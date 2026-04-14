import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================
// Subscription auto-search
// POST /api/subscriptions/check?id=xxx
// Searches indexers for a subscription and optionally auto-downloads
// ============================================

interface IndexerRecord {
  id: string
  name: string
  type: string
  scheme: string
  host: string
  port: number | null
  baseUrl: string | null
  apiKey: string | null
  cookie: string | null
  categories: string | null
  searchPath: string | null
  enableSearch: boolean
  rateLimit: number
  lastSearchAt: Date | null
  priority: number
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    const forceDownload = searchParams.get('download') === 'true'

    if (!id) {
      return NextResponse.json({ error: '缺少订阅ID' }, { status: 400 })
    }

    const sub = await db.subscription.findUnique({
      where: { id },
      include: {
        mediaItem: true,
      },
    })

    if (!sub) {
      return NextResponse.json({ error: '订阅不存在' }, { status: 404 })
    }

    if (!sub.enabled) {
      return NextResponse.json({ error: '订阅已禁用' }, { status: 400 })
    }

    // Build search keyword
    let query = sub.keyword || ''
    if (!query && sub.tmdbId) {
      // Get title from linked media item
      if (sub.mediaItem) {
        query = sub.mediaItem.titleEn || sub.mediaItem.titleCn
      }
    }
    if (!query) {
      return NextResponse.json({ error: '没有可用的搜索关键词' }, { status: 400 })
    }

    // Check rate limit - don't search if checked recently (within interval)
    if (sub.lastCheckAt) {
      const elapsed = Date.now() - new Date(sub.lastCheckAt).getTime()
      const intervalMs = (sub.rssInterval || 30) * 60 * 1000
      if (elapsed < intervalMs) {
        return NextResponse.json({
          success: true,
          skipped: true,
          message: `距上次检查仅 ${Math.round(elapsed / 60000)} 分钟，间隔为 ${sub.rssInterval || 30} 分钟`,
          nextCheckIn: Math.round((intervalMs - elapsed) / 60000),
        })
      }
    }

    // Get enabled indexers with search capability
    const indexers = await db.indexer.findMany({
      where: {
        enabled: true,
        enableSearch: true,
      },
      orderBy: { priority: 'desc' },
    })

    if (indexers.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        message: '没有可用的索引器',
      })
    }

    // Search across all indexers
    const queries = await buildSearchQueries(query, sub.type)
    const searchPromises = indexers.map((idx) => searchIndexer(idx as IndexerRecord, queries))
    const allResults = await Promise.allSettled(searchPromises)

    let results: Array<{
      title: string
      size: number
      seeders: number
      leechers: number
      magnetUrl: string
      torrentUrl: string
      infoHash: string
      score: number
      indexerId: string
      indexerName: string
    }> = []

    for (const outcome of allResults) {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value)
      }
    }

    // Score and filter results
    results = results.filter((r) => {
      r.score = scoreResult(r, sub.type || 'movie')
      return r.score >= 30 // Minimum quality threshold
    })
    results.sort((a, b) => b.score - a.score)

    // Update last check time
    await db.subscription.update({
      where: { id },
      data: { lastCheckAt: new Date() },
    })

    // Auto-download if enabled and good results found
    let downloaded = false
    let downloadMessage = ''

    if ((sub.autoDownload || forceDownload) && results.length > 0) {
      const bestResult = results[0]

      // Check if already downloaded (by info hash or similar title)
      const existingTasks = await db.downloadTask.findMany({
        where: {
          infoHash: bestResult.infoHash || undefined,
          title: { contains: bestResult.title.substring(0, 20) },
        },
      })

      if (existingTasks.length === 0) {
        // Create download task
        const task = await db.downloadTask.create({
          data: {
            mediaItemId: sub.mediaItemId || null,
            title: bestResult.title,
            size: bestResult.size,
            magnetUrl: bestResult.magnetUrl || null,
            torrentUrl: bestResult.torrentUrl || null,
            infoHash: bestResult.infoHash || null,
            indexerId: bestResult.indexerId,
            status: 'pending',
            progress: 0,
          },
        })

        // Try to send to download client
        try {
          const client = await db.downloadClient.findFirst({
            where: { enabled: true },
            orderBy: { priority: 'desc' },
          })

          if (client) {
            const sendRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/downloads/action/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                downloadTaskId: task.id,
                mediaType: sub.type,
              }),
            })
            const sendData = await sendRes.json()
            downloaded = sendData.success
            downloadMessage = sendData.success ? sendData.message : sendData.error
          } else {
            downloadMessage = '没有可用的下载客户端'
          }
        } catch {
          downloadMessage = '发送到下载客户端失败'
        }
      } else {
        downloadMessage = '已有相似的下载任务'
      }
    }

    return NextResponse.json({
      success: true,
      subscription: { id: sub.id, keyword: sub.keyword, type: sub.type },
      query,
      queries: queries.length > 1 ? queries : undefined,
      resultsCount: results.length,
      topResults: results.slice(0, 5).map((r) => ({
        title: r.title,
        size: r.size,
        seeders: r.seeders,
        score: r.score,
        indexerName: r.indexerName,
      })),
      downloaded,
      downloadMessage,
      message: `搜索完成，找到 ${results.length} 条结果${downloaded ? '，已自动下载最佳结果' : ''}`,
    })
  } catch (error) {
    console.error('Subscription check error:', error)
    return NextResponse.json({ error: '检查失败' }, { status: 500 })
  }
}

// ============================================
// Helper functions
// ============================================

async function buildSearchQueries(
  originalQuery: string,
  mediaType?: string
): Promise<string[]> {
  const queries = [originalQuery]

  const hasChinese = /[\u4e00-\u9fff]/.test(originalQuery)
  if (hasChinese) {
    const englishName = await lookupEnglishName(originalQuery, mediaType)
    if (englishName && englishName !== originalQuery) {
      queries.push(englishName)
    }
  }

  return queries
}

async function lookupEnglishName(
  chineseName: string,
  mediaType?: string
): Promise<string | null> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'tmdb_api_key' } })
    const apiKey = setting?.value || process.env.TMDB_API_KEY
    if (!apiKey) return null

    const type = mediaType === 'tv' ? 'tv' : 'movie'
    const url = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(chineseName)}&page=1`

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null

    const data = await res.json()
    if (data.results?.length > 0) {
      return data.results[0].title || data.results[0].name || null
    }
    return null
  } catch {
    return null
  }
}

async function searchIndexer(
  indexer: IndexerRecord,
  queries: string[]
): Promise<Array<{
  title: string
  size: number
  seeders: number
  leechers: number
  magnetUrl: string
  torrentUrl: string
  infoHash: string
  indexerId: string
  indexerName: string
}>> {
  // Rate limit check
  if (indexer.rateLimit && indexer.lastSearchAt) {
    const elapsed = Date.now() - new Date(indexer.lastSearchAt).getTime()
    if (elapsed < indexer.rateLimit * 1000) {
      return []
    }
  }

  try {
    const baseUrl = buildBaseUrl(indexer)
    const allResults: Array<{
      title: string; size: number; seeders: number; leechers: number
      magnetUrl: string; torrentUrl: string; infoHash: string
      indexerId: string; indexerName: string
    }> = []

    for (const query of queries) {
      if (indexer.type === 'torznab' || indexer.type === 'newznab' || indexer.type === 'cardigann') {
        const categories = indexer.categories || ''
        let url = `${baseUrl}/api?t=search&q=${encodeURIComponent(query)}`
        if (categories) url += `&cat=${categories}`
        if (indexer.apiKey) url += `&apikey=${indexer.apiKey}`

        const res = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'MediaHub-CN/1.0', 'Accept': 'application/xml' },
        })

        if (res.ok) {
          const xml = await res.text()
          const items = parseTorznabXml(xml)
          for (const item of items) {
            allResults.push({
              title: item.title,
              size: item.size,
              seeders: item.seeders,
              leechers: item.peers,
              magnetUrl: item.magnetUrl,
              torrentUrl: item.link,
              infoHash: item.infoHash,
              indexerId: indexer.id,
              indexerName: indexer.name,
            })
          }
        }
      } else if (indexer.type === 'native_pt') {
        // Simplified native PT search (same logic as search route)
        const searchPath = indexer.searchPath || '/torrents.php'
        const sep = searchPath.includes('?') ? '&' : '?'
        const url = `${baseUrl}${searchPath}${sep}search=${encodeURIComponent(query)}`

        const headers: Record<string, string> = {
          'User-Agent': 'MediaHub-CN/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml',
        }
        if (indexer.cookie) headers['Cookie'] = indexer.cookie

        const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers })
        if (res.ok) {
          const html = await res.text()
          const items = parseNativePtSimple(html, baseUrl)
          for (const item of items) {
            allResults.push({
              title: item.title,
              size: item.size,
              seeders: item.seeders,
              leechers: item.leechers,
              magnetUrl: item.magnetUrl || '',
              torrentUrl: item.torrentUrl || '',
              infoHash: item.infoHash || '',
              indexerId: indexer.id,
              indexerName: indexer.name,
            })
          }
        }
      }
    }

    // Update last search time
    await db.indexer.update({
      where: { id: indexer.id },
      data: { lastSearchAt: new Date() },
    }).catch(() => {})

    return allResults
  } catch {
    return []
  }
}

function scoreResult(result: { title: string; size: number; seeders: number; publishDate?: string }, mediaType: string): number {
  let score = 0
  const title = result.title

  if (/2160p|4K|UHD/i.test(title)) score += 40
  else if (/1080p|FHD/i.test(title)) score += 30
  else if (/1080i/i.test(title)) score += 20
  else if (/720p/i.test(title)) score += 10

  if (/Remux/i.test(title)) score += 25
  else if (/BluRay|BLURAY|BDRip/i.test(title)) score += 20
  else if (/WEB-?DL/i.test(title)) score += 15
  else if (/WEBRip/i.test(title)) score += 12
  else if (/HDTV/i.test(title)) score += 8

  if (/H\.?265|x265|HEVC/i.test(title)) score += 10
  else if (/H\.?264|x264/i.test(title)) score += 5

  if (/[简繁]体|中文|双语|GB|BIG5|简日|繁日|简繁|CH[ST]|字幕组|中字/i.test(title)) {
    score += 30
  }

  const seeders = result.seeders || 0
  if (seeders > 0) {
    score += Math.min(Math.log2(seeders + 1) * 3, 30)
  }

  return Math.round(score * 10) / 10
}

function buildBaseUrl(indexer: IndexerRecord): string {
  const scheme = indexer.scheme || 'https'
  let url = `${scheme}://${indexer.host}`
  if (indexer.port && ((scheme === 'https' && indexer.port !== 443) || (scheme === 'http' && indexer.port !== 80))) {
    url += `:${indexer.port}`
  }
  if (indexer.baseUrl) {
    const base = indexer.baseUrl.startsWith('/') ? indexer.baseUrl : `/${indexer.baseUrl}`
    url += base
  }
  return url
}

// ============================================
// XML Parsing (simplified)
// ============================================

interface TorznabItem {
  title: string
  link: string
  size: number
  seeders: number
  peers: number
  grabs: number
  infoHash: string
  magnetUrl: string
}

function parseTorznabXml(xml: string): TorznabItem[] {
  const items: TorznabItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const title = extractXmlValue(itemXml, 'title') || ''
    const link = extractXmlValue(itemXml, 'link') || ''
    const sizeStr = extractXmlValue(itemXml, 'size') || '0'

    const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]*)"[^>]*length="([^"]*)"/)
    const enclosureUrl = enclosureMatch ? enclosureMatch[1] : ''
    const enclosureLength = enclosureMatch ? parseInt(enclosureMatch[2], 10) : 0

    const seeders = parseInt(extractTorznabAttr(itemXml, 'seeders') || '0', 10)
    const peers = parseInt(extractTorznabAttr(itemXml, 'peers') || '0', 10)
    const grabs = parseInt(extractTorznabAttr(itemXml, 'grabs') || '0', 10)
    const infoHash = extractTorznabAttr(itemXml, 'infohash') || ''
    const magnetUrl = extractTorznabAttr(itemXml, 'magneturl') || ''

    const size = parseInt(sizeStr, 10) || enclosureLength || 0
    if (title) {
      items.push({ title, link: link || enclosureUrl, size, seeders, peers, grabs, infoHash, magnetUrl })
    }
  }
  return items
}

function extractXmlValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null
}

function extractTorznabAttr(xml: string, name: string): string | null {
  const regex = new RegExp(`<(?:\\w+:)?attr[^>]*name="${name}"[^>]*value="([^"]*)"`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : null
}

// ============================================
// Native PT simple parser
// ============================================

function parseNativePtSimple(html: string, baseUrl: string) {
  const items: Array<{ title: string; size: number; seeders: number; leechers: number; torrentUrl?: string; infoHash?: string; magnetUrl?: string }> = []

  // Try JSON API (M-Team style)
  try {
    const jsonMatch = html.match(/\{[\s\S]*"data"[\s\S]*\}/)
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0])
      if (data.data && Array.isArray(data.data)) {
        for (const torrent of data.data.slice(0, 20)) {
          items.push({
            title: torrent.name || torrent.title || '',
            size: parseInt(torrent.size || '0', 10),
            seeders: parseInt(torrent.seeders || '0', 10),
            leechers: parseInt(torrent.leechers || '0', 10),
            torrentUrl: torrent.url || undefined,
            infoHash: torrent.info_hash || undefined,
          })
        }
        return items
      }
    }
  } catch {}

  // HTML table parsing (NexusPHP style)
  const rowRegex = /<tr[^>]*class="[^"]*(?:torrent|row)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const titleMatch = rowHtml.match(/<a[^>]*href="[^"]*(?:details|torrent)[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    if (!titleMatch) continue

    const title = titleMatch[1].replace(/<[^>]*>/g, '').trim()
    if (!title || title.length < 3) continue

    let size = 0
    let seeders = 0
    let leechers = 0
    const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []
    for (const cell of cells) {
      const text = cell.replace(/<[^>]*>/g, '').trim()
      const sizeMatch = text.match(/([\d.]+)\s*(TB|GB|MB|KB)/i)
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1])
        const multipliers: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
        size = Math.round(val * (multipliers[sizeMatch[2].toUpperCase()] || 1))
      }
    }

    const seedersMatch = rowHtml.match(/class="[^"]*seed[^"]*"[^>]*>(\d+)/i)
    if (seedersMatch) seeders = parseInt(seedersMatch[1], 10)
    const leechersMatch = rowHtml.match(/class="[^"]*leech[^"]*"[^>]*>(\d+)/i)
    if (leechersMatch) leechers = parseInt(leechersMatch[1], 10)

    const downloadMatch = rowHtml.match(/href="([^"]*(?:download|get)[^"]*)"/i)
    let torrentUrl: string | undefined
    if (downloadMatch) {
      torrentUrl = downloadMatch[1].startsWith('http') ? downloadMatch[1] : `${baseUrl}${downloadMatch[1]}`
    }

    items.push({ title, size, seeders, leechers, torrentUrl })
  }

  return items
}
