import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================
// Send torrent/magnet to download client
// POST /api/downloads/action/send
// Body: { downloadTaskId?, magnetUrl?, torrentUrl?, infoHash?, mediaType?, clientId? }
// ============================================

interface ClientRecord {
  id: string
  type: string
  host: string
  port: number
  username?: string | null
  password?: string | null
  baseUrl?: string | null
  category?: string | null
  directory?: string | null
  tvCategory?: string | null
  movieCategory?: string | null
  tvDirectory?: string | null
  movieDirectory?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { downloadTaskId, magnetUrl, torrentUrl, infoHash, mediaType, clientId } = body

    if (!magnetUrl && !torrentUrl && !downloadTaskId) {
      return NextResponse.json({ error: '缺少下载链接或任务ID' }, { status: 400 })
    }

    // Find or get task details
    let task: Record<string, unknown> | null = null
    if (downloadTaskId) {
      task = await db.downloadTask.findUnique({ where: { id: downloadTaskId } }) as Record<string, unknown> | null
      if (!task) {
        return NextResponse.json({ error: '下载任务不存在' }, { status: 404 })
      }
    }

    const targetMagnet = magnetUrl || (task?.magnetUrl as string) || ''
    const targetTorrent = torrentUrl || (task?.torrentUrl as string) || ''
    const targetHash = infoHash || (task?.infoHash as string) || ''
    const taskId = downloadTaskId || (task?.id as string)

    if (!targetMagnet && !targetTorrent) {
      return NextResponse.json({ error: '没有可用的下载链接' }, { status: 400 })
    }

    // Find download client
    let client: ClientRecord | null = null
    if (clientId) {
      client = await db.downloadClient.findUnique({ where: { id: clientId } }) as ClientRecord | null
    } else {
      // Auto-select: find first enabled client
      client = await db.downloadClient.findFirst({
        where: { enabled: true },
        orderBy: { priority: 'desc' },
      }) as ClientRecord | null
    }

    if (!client) {
      return NextResponse.json({ error: '没有可用的下载客户端，请先配置' }, { status: 400 })
    }

    // Determine category and save path based on media type
    const effectiveMediaType = mediaType || (task?.mediaItemId ? 'movie' : undefined)
    let category = client.category || ''
    let savePath = client.directory || ''

    if (effectiveMediaType === 'tv') {
      category = client.tvCategory || category
      savePath = client.tvDirectory || savePath
    } else if (effectiveMediaType === 'movie') {
      category = client.movieCategory || category
      savePath = client.movieDirectory || savePath
    }

    // Send to download client
    let result: { success: boolean; message: string; addedInfoHash?: string }

    switch (client.type) {
      case 'qbittorrent':
        result = await sendToQbittorrent(client, targetMagnet, targetTorrent, category, savePath)
        break
      case 'transmission':
        result = await sendToTransmission(client, targetMagnet, targetTorrent, category)
        break
      case 'deluge':
        result = await sendToDeluge(client, targetMagnet, targetTorrent, category, savePath)
        break
      default:
        return NextResponse.json({ error: `不支持的客户端类型: ${client.type}` }, { status: 400 })
    }

    // Update download task
    if (taskId && result.success) {
      await db.downloadTask.update({
        where: { id: taskId },
        data: {
          clientId: client.id,
          status: 'downloading',
          startedAt: new Date(),
          infoHash: result.addedInfoHash || targetHash,
        },
      })

      // Update media item status if linked
      if (task?.mediaItemId) {
        await db.mediaItem.update({
          where: { id: task.mediaItemId as string },
          data: { status: 'downloading' },
        }).catch(() => {})
      }
    } else if (taskId && !result.success) {
      await db.downloadTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          errorMessage: result.message,
        },
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Download send error:', error)
    return NextResponse.json({ error: '发送下载失败' }, { status: 500 })
  }
}

// ============================================
// qBittorrent integration
// ============================================

function buildClientUrl(client: ClientRecord): string {
  const isLocal = client.host.startsWith('localhost') || client.host.startsWith('127.0') || client.host.startsWith('192.168.') || client.host.startsWith('10.') || client.host.startsWith('172.')
  const scheme = isLocal ? 'http' : 'https'
  const base = client.baseUrl || ''
  return `${scheme}://${client.host}:${client.port}${base}`
}

async function qbitLogin(client: ClientRecord): Promise<string> {
  if (!client.username || !client.password) return ''
  const baseUrl = buildClientUrl(client)
  try {
    const res = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(client.username!)}&password=${encodeURIComponent(client.password!)}`,
    })
    if (res.ok && (await res.text()) === 'Ok.') {
      // Capture SID cookie from login response
      const setCookie = res.headers.get('set-cookie') || ''
      const sidMatch = setCookie.match(/SID=([^;]+)/)
      return sidMatch ? `SID=${sidMatch[1]}` : ''
    }
    return ''
  } catch {
    return ''
  }
}

async function sendToQbittorrent(
  client: ClientRecord,
  magnetUrl: string,
  torrentUrl: string,
  category: string,
  savePath: string
): Promise<{ success: boolean; message: string; addedInfoHash?: string }> {
  const baseUrl = buildClientUrl(client)

  // Authenticate and capture session cookie
  const sidCookie = await qbitLogin(client)
  const loggedIn = !!sidCookie || !client.username || !client.password

  // Build form data
  const formParams = new URLSearchParams()
  if (magnetUrl) {
    formParams.append('urls', magnetUrl)
  }
  if (torrentUrl) {
    // For torrent file URLs, fetch and upload as binary
    try {
      const torrentRes = await fetch(torrentUrl, {
        headers: {
          'User-Agent': 'MediaHub-CN/1.0',
        },
      })
      if (torrentRes.ok) {
        const blob = await torrentRes.blob()
        if (blob.type === 'application/x-bittorrent' || blob.size > 100) {
          const formData = new FormData()
          formData.append('torrents', blob, 'download.torrent')
          if (category) formData.append('category', category)
          if (savePath) formData.append('savepath', savePath)
          formData.append('autoTMM', 'false')

          const addRes = await fetch(`${baseUrl}/api/v2/torrents/add`, {
            method: 'POST',
            headers: sidCookie ? { 'Cookie': sidCookie } : {},
            body: formData,
          })

          if (addRes.ok) {
            const result = await addRes.text()
            if (result === 'Ok.') {
              return { success: true, message: '种子文件已发送到 qBittorrent' }
            }
            return { success: false, message: `qBittorrent 返回: ${result}` }
          }
          return { success: false, message: `qBittorrent 添加失败: HTTP ${addRes.status}` }
        }
      }
      // If torrent file download failed, fall back to URL method
    } catch {
      // Fall through to magnet URL handling
    }

    // Add torrent URL directly as fallback
    if (torrentUrl && !magnetUrl) {
      formParams.append('urls', torrentUrl)
    }
  }

  if (!formParams.has('urls') && !magnetUrl) {
    return { success: false, message: '没有可用的下载链接' }
  }

  if (category) formParams.append('category', category)
  if (savePath) formParams.append('savepath', savePath)
  formParams.append('autoTMM', 'false')

  const res = await fetch(`${baseUrl}/api/v2/torrents/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(sidCookie ? { 'Cookie': sidCookie } : {}),
    },
    body: formParams.toString(),
  })

  if (res.ok) {
    const result = await res.text()
    if (result === 'Ok.') {
      const hashMatch = magnetUrl.match(/urn:btih:([a-fA-F0-9]{40})/i)
        || magnetUrl.match(/urn:btih:([A-Z2-7]{32})/i)
      const infoHash = hashMatch ? hashMatch[1].toUpperCase() : undefined

      return {
        success: true,
        message: loggedIn ? '已发送到 qBittorrent' : '已发送到 qBittorrent（未认证，可能需要配置密码）',
        addedInfoHash: infoHash,
      }
    }
    if (result.includes('Fails')) {
      return { success: false, message: '种子已在 qBittorrent 中存在' }
    }
    return { success: false, message: `qBittorrent 返回: ${result}` }
  }

  return { success: false, message: `qBittorrent 请求失败: HTTP ${res.status}` }
}

// ============================================
// Transmission integration
// ============================================

async function sendToTransmission(
  client: ClientRecord,
  magnetUrl: string,
  torrentUrl: string,
  category: string
): Promise<{ success: boolean; message: string; addedInfoHash?: string }> {
  const baseUrl = buildClientUrl(client)

  // Get session ID and authenticate
  const sessionRes = await fetch(`${baseUrl}/transmission/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(`${client.username || ''}:${client.password || ''}`),
    },
    body: JSON.stringify({ method: 'session-get', arguments: {} }),
  })

  if (sessionRes.status !== 200 && sessionRes.status !== 409) {
    return { success: false, message: `Transmission 连接失败: HTTP ${sessionRes.status}` }
  }

  // Extract session ID from response headers
  const sessionId = sessionRes.headers.get('x-transmission-session-id') || ''

  // Add torrent
  const rpcBody: Record<string, unknown> = {
    method: 'torrent-add',
    arguments: {},
  }

  if (magnetUrl) {
    rpcBody.arguments = { filename: magnetUrl }
  } else if (torrentUrl) {
    rpcBody.arguments = { filename: torrentUrl }
  }

  if (category) {
    rpcBody.arguments.labels = [category]
  }

  const addRes = await fetch(`${baseUrl}/transmission/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Transmission-Session-Id': sessionId,
      'Authorization': 'Basic ' + btoa(`${client.username || ''}:${client.password || ''}`),
    },
    body: JSON.stringify(rpcBody),
  })

  if (!addRes.ok) {
    if (addRes.status === 409) {
      const newSessionId = addRes.headers.get('x-transmission-session-id') || ''
      const retryRes = await fetch(`${baseUrl}/transmission/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transmission-Session-Id': newSessionId,
          'Authorization': 'Basic ' + btoa(`${client.username || ''}:${client.password || ''}`),
        },
        body: JSON.stringify(rpcBody),
      })
      if (retryRes.ok) {
        const retryData = await retryRes.json()
        if (retryData.result === 'success') {
          return { success: true, message: '已发送到 Transmission' }
        }
        return { success: false, message: `Transmission 错误: ${retryData.result}` }
      }
    }
    return { success: false, message: `Transmission 请求失败: HTTP ${addRes.status}` }
  }

  const data = await addRes.json()
  if (data.result === 'success') {
    const addedInfoHash = data.arguments?.['torrent-added']?.hashString
      || data.arguments?.['torrent-duplicate']?.hashString
    if (data.arguments?.['torrent-duplicate']) {
      return { success: false, message: '种子已在 Transmission 中存在' }
    }
    return { success: true, message: '已发送到 Transmission', addedInfoHash }
  }

  return { success: false, message: `Transmission 错误: ${data.result}` }
}

// ============================================
// Deluge integration
// ============================================

let delugeRpcId = 0

async function delugeRpc(
  client: ClientRecord,
  method: string,
  params: unknown[] = [],
  timeout = 15000
): Promise<Record<string, unknown>> {
  const baseUrl = buildClientUrl(client)
  const rpcId = ++delugeRpcId

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${baseUrl}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        method,
        params,
        id: rpcId,
      }),
    })

    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const data = await res.json() as Record<string, unknown>

    if (data.error) {
      throw new Error(String(data.error))
    }

    return data.result as Record<string, unknown> || {}
  } catch (error) {
    clearTimeout(timer)
    throw error
  }
}

async function sendToDeluge(
  client: ClientRecord,
  magnetUrl: string,
  torrentUrl: string,
  category: string,
  savePath: string
): Promise<{ success: boolean; message: string; addedInfoHash?: string }> {
  try {
    // Authenticate with Deluge daemon
    await delugeRpc(client, 'daemon.login', [
      client.password || '',
    ])

    // Build download options
    const options: Record<string, unknown> = {
      add_paused: false,
      remove_at_ratio: false,
    }

    // Set save path (Deluge calls it "download_location")
    if (savePath) {
      options.download_location = savePath
    }

    // Deluge doesn't have categories like qBittorrent, but supports labels via plugin
    // We store the category in the label if the plugin is available
    if (category) {
      try {
        await delugeRpc(client, 'label.add', [category])
        options.label = category
      } catch {
        // Label plugin not installed, silently ignore
      }
    }

    // Add torrent via magnet or URL
    let addedInfoHash: string | undefined
    if (magnetUrl) {
      const result = await delugeRpc(client, 'core.add_torrent_magnet', [magnetUrl, options])
      addedInfoHash = typeof result === 'string' ? result : undefined
      if (!addedInfoHash) {
        return { success: false, message: 'Deluge 未能添加磁力链接' }
      }
    } else if (torrentUrl) {
      // Fetch torrent file content and add via base64
      try {
        const torrentRes = await fetch(torrentUrl, {
          headers: { 'User-Agent': 'MediaHub-CN/1.0' },
        })
        if (torrentRes.ok) {
          const blob = await torrentRes.blob()
          if (blob.type === 'application/x-bittorrent' || blob.size > 100) {
            const buffer = await blob.arrayBuffer()
            const base64 = Buffer.from(buffer).toString('base64')
            const result = await delugeRpc(client, 'core.add_torrent_url', [
              `file://${Buffer.from(buffer).toString('binary')}`,
              options,
            ])
            // Fallback: use base64-encoded file content
            const result2 = await delugeRpc(client, 'core.add_torrent_file', [
              `${Date.now()}.torrent`,
              base64,
              options,
            ])
            addedInfoHash = typeof result2 === 'string' ? result2 : undefined
          } else {
            // Not a valid torrent file, try as URL
            const result = await delugeRpc(client, 'core.add_torrent_url', [torrentUrl, options])
            addedInfoHash = typeof result === 'string' ? result : undefined
          }
        } else {
          return { success: false, message: `无法下载种子文件: HTTP ${torrentRes.status}` }
        }
      } catch (error) {
        return { success: false, message: `种子文件处理失败: ${error instanceof Error ? error.message : '未知错误'}` }
      }
    } else {
      return { success: false, message: '没有可用的下载链接' }
    }

    return {
      success: true,
      message: '已发送到 Deluge',
      addedInfoHash,
    }
  } catch (error) {
    return {
      success: false,
      message: `Deluge 连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }
  }
}
