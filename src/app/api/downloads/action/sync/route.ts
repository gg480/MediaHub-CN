import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================
// Sync download progress from download clients
// POST /api/downloads/action/sync
// ============================================

interface ClientRecord {
  id: string
  type: string
  host: string
  port: number
  username?: string | null
  password?: string | null
  baseUrl?: string | null
}

interface TorrentInfo {
  hash: string
  name: string
  size: number
  progress: number
  dlspeed: number
  upspeed: number
  num_seeds: number
  num_leechs: number
  state: string
  save_path: string
  eta: number
}

export async function POST() {
  try {
    const activeTasks = await db.downloadTask.findMany({
      where: {
        status: { in: ['pending', 'downloading', 'queued'] },
        clientId: { not: null },
      },
      include: {
        client: true,
      },
    })

    if (activeTasks.length === 0) {
      return NextResponse.json({ synced: 0, message: '没有需要同步的活跃任务' })
    }

    // Group tasks by client
    const clientGroups = new Map<string, { client: ClientRecord; tasks: typeof activeTasks }>()
    for (const task of activeTasks) {
      if (!task.client) continue
      const cid = task.client.id
      if (!clientGroups.has(cid)) {
        clientGroups.set(cid, { client: task.client as ClientRecord, tasks: [] })
      }
      clientGroups.get(cid)!.tasks.push(task)
    }

    let syncedCount = 0
    let failedCount = 0

    for (const [, group] of clientGroups) {
      try {
        const client = group.client
        let torrents: TorrentInfo[] = []

        switch (client.type) {
          case 'qbittorrent':
            torrents = await getQbittorrentTorrents(client)
            break
          case 'transmission':
            torrents = await getTransmissionTorrents(client)
            break
          default:
            continue
        }

        // Build hash -> torrent info map
        const torrentMap = new Map<string, TorrentInfo>()
        for (const t of torrents) {
          torrentMap.set(t.hash.toUpperCase(), t)
        }

        for (const task of group.tasks) {
          if (!task.infoHash) continue

          const torrent = torrentMap.get(task.infoHash.toUpperCase())
          if (!torrent) continue

          const newProgress = Math.min(torrent.progress, 1)
          const newState = mapState(torrent.state)

          const updateData: Record<string, unknown> = {
            progress: newProgress,
            downloadSpeed: torrent.dlspeed,
            uploadSpeed: torrent.upspeed,
            seeders: torrent.num_seeds,
            leechers: torrent.num_leechs,
            outputPath: torrent.save_path || null,
          }

          if (newState === 'completed' && task.status !== 'completed') {
            updateData.status = 'completed'
            updateData.completedAt = new Date()
          } else if (newState === 'downloading') {
            updateData.status = 'downloading'
            if (!task.startedAt) updateData.startedAt = new Date()
          } else if (newState === 'failed') {
            updateData.status = 'failed'
            updateData.errorMessage = torrent.state
          }

          if (
            newProgress !== task.progress ||
            torrent.dlspeed !== (task.downloadSpeed || 0) ||
            updateData.status
          ) {
            await db.downloadTask.update({
              where: { id: task.id },
              data: updateData,
            })

            if (newState === 'completed' && task.mediaItemId) {
              await db.mediaItem.update({
                where: { id: task.mediaItemId },
                data: { status: 'downloaded' },
              }).catch(() => {})
            }
            syncedCount++
          }
        }
      } catch (error) {
        console.error(`Sync error for client ${group.client.name}:`, error)
        failedCount++
      }
    }

    // Mark stale pending tasks as failed (older than 5 min, never started)
    const stalePending = await db.downloadTask.findMany({
      where: {
        status: 'pending',
        startedAt: null,
        createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    })

    for (const task of stalePending) {
      await db.downloadTask.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          errorMessage: '下载任务超时未发送到客户端',
        },
      })
      syncedCount++
    }

    return NextResponse.json({
      synced: syncedCount,
      failed: failedCount,
      clients: clientGroups.size,
      message: `同步完成：${syncedCount} 个任务已更新`,
    })
  } catch (error) {
    console.error('Download sync error:', error)
    return NextResponse.json({ error: '同步失败' }, { status: 500 })
  }
}

// ============================================
// Client torrent listing
// ============================================

function buildClientUrl(client: ClientRecord): string {
  const scheme = client.host.startsWith('localhost') || client.host.startsWith('127.0') ? 'http' : 'http'
  const base = client.baseUrl || ''
  return `${scheme}://${client.host}:${client.port}${base}`
}

async function getQbittorrentTorrents(client: ClientRecord): Promise<TorrentInfo[]> {
  const baseUrl = buildClientUrl(client)

  if (client.username && client.password) {
    await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(client.username!)}&password=${encodeURIComponent(client.password!)}`,
    }).catch(() => {})
  }

  const res = await fetch(`${baseUrl}/api/v2/torrents/info`, {
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) return []

  const data = await res.json() as Record<string, unknown>[]
  if (!Array.isArray(data)) return []

  return data.map((t) => ({
    hash: String(t.hash || ''),
    name: String(t.name || ''),
    size: Number(t.size || 0),
    progress: Number(t.progress || 0),
    dlspeed: Number(t.dlspeed || 0),
    upspeed: Number(t.upspeed || 0),
    num_seeds: Number(t.num_seeds || 0),
    num_leechs: Number(t.num_leechs || 0),
    state: String(t.state || ''),
    save_path: String(t.save_path || ''),
    eta: Number(t.eta || 0),
  }))
}

async function getTransmissionTorrents(client: ClientRecord): Promise<TorrentInfo[]> {
  const baseUrl = buildClientUrl(client)

  const sessionRes = await fetch(`${baseUrl}/transmission/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa(`${client.username || ''}:${client.password || ''}`),
    },
    body: JSON.stringify({ method: 'session-get', arguments: {} }),
  })

  const sessionId = sessionRes.headers.get('x-transmission-session-id') || ''

  const res = await fetch(`${baseUrl}/transmission/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Transmission-Session-Id': sessionId,
      'Authorization': 'Basic ' + btoa(`${client.username || ''}:${client.password || ''}`),
    },
    body: JSON.stringify({
      method: 'torrent-get',
      arguments: {
        fields: [
          'hashString', 'name', 'totalSize', 'percentDone', 'rateDownload', 'rateUpload',
          'seeders', 'leechers', 'status', 'downloadDir', 'eta', 'haveValid',
        ],
      },
    }),
  })

  if (!res.ok) return []

  const data = await res.json()
  const torrents = data?.arguments?.torrents
  if (!Array.isArray(torrents)) return []

  return torrents.map((t: Record<string, unknown>) => ({
    hash: String(t.hashString || ''),
    name: String(t.name || ''),
    size: Number(t.totalSize || 0),
    progress: Number(t.percentDone || 0),
    dlspeed: Number(t.rateDownload || 0),
    upspeed: Number(t.rateUpload || 0),
    num_seeds: Number(t.seeders || 0),
    num_leechs: Number(t.leechers || 0),
    state: transmissionStatusToState(Number(t.status || 0)),
    save_path: String(t.downloadDir || ''),
    eta: Number(t.eta || 0),
  }))
}

function transmissionStatusToState(status: number): string {
  switch (status) {
    case 4: return 'downloading'
    case 6: return 'seeding'
    case 0: return 'stopped'
    case 2: return 'downloading'
    case 1: return 'queued'
    case 3: return 'queued'
    default: return 'unknown'
  }
}

function mapState(state: string): string {
  const s = state.toLowerCase()
  if (s === 'downloading' || s === 'stalleddl' || s === 'checkingdl') return 'downloading'
  if (s === 'uploading' || s === 'stalledup' || s === 'checkingup' || s === 'forcedup' || s === 'seeding') return 'completed'
  if (s === 'queueddl' || s === 'queuedup') return 'queued'
  if (s === 'missingfiles' || s === 'error') return 'failed'
  if (s === 'stopped') return 'queued'
  return 'downloading'
}
