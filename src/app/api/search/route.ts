import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================
// Proxy support
// ============================================

async function getProxyHost(): Promise<string> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'proxy_host' } })
    return setting?.value || ''
  } catch {
    return ''
  }
}

/**
 * Fetch with optional HTTP proxy support.
 * If proxy_host is configured and the URL is external, uses the proxy.
 */
async function fetchWithProxy(url: string, options: RequestInit = {}): Promise<Response> {
  const proxy = await getProxyHost()
  if (!proxy) {
    return fetch(url, options)
  }
  try {
    const { ProxyAgent } = await import('undici')
    if (ProxyAgent && !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('192.168.') && !url.includes('10.')) {
      const agent = new ProxyAgent(proxy)
      return fetch(url, { ...options, dispatcher: agent } as any)
    }
  } catch {
    // undici not available, fall back to direct
  }
  return fetch(url, options)
}

// ============================================
// Proxy support
// ============================================

async function getProxyHost(): Promise<string> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'proxy_host' } })
    return setting?.value || ''
  } catch {
    return ''
  }
}

/**
 * Fetch with optional HTTP proxy support.
 * If proxy_host is configured and the URL is external (not local/private IP),
 * uses the proxy. Supports Node.js HTTP_PROXY/HTTPS_PROXY env vars via undici.
 */
async function fetchWithProxy(url: string, options: RequestInit = {}): Promise<Response> {
  const proxy = await getProxyHost()
  if (!proxy) {
    return fetch(url, options)
  }
  try {
    // If proxy is set, configure fetch to use it
    // Node.js undici supports dispatcher option for proxy
    const { setGlobalDispatcher, ProxyAgent } = await import('undici')
    if (ProxyAgent && !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('192.168.') && !url.includes('10.')) {
      const agent = new ProxyAgent(proxy)
      // Create a one-off dispatcher for this request
      return fetch(url, { ...options, dispatcher: agent } as any)
    }
  } catch {
    // undici not available or ProxyAgent failed, fall back to direct
  }
  return fetch(url, options)
}

// ============================================
// Types
// ============================================

interface IndexerRecord {
  id: string
  name: string
  enabled: boolean
  type: string
  protocol: string
  scheme: string
  host: string
  port: number | null
  baseUrl: string | null
  apiKey: string | null
  uid: string | null
  passkey: string | null
  cookie: string | null
  categories: string | null
  searchPath: string | null
  detailsPath: string | null
  vip: boolean
  priority: number
  enableSearch: boolean
  rateLimit: number
  lastSearchAt: Date | null
}

interface RawSearchResult {
  title: string
  size: number
  seeders: number
  leechers: number
  grabs: number
  publishDate: string
  indexerName: string
  indexerId: string
  magnetUrl?: string
  torrentUrl?: string
  infoHash?: string
  quality?: string
  resolution?: string
  codec?: string
  source?: string
  audioCodec?: string
  group?: string
  hasChineseSub?: boolean
  score?: number
}

// ============================================
// Main handler
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const query = searchParams.get('q')
    const mediaType = searchParams.get('mediaType') // movie | tv

    if (!query) {
      return NextResponse.json({ results: [], total: 0 })
    }

    // Get all enabled indexers that have search enabled
    const indexers = await db.indexer.findMany({
      where: {
        enabled: true,
        enableSearch: true,
      },
      orderBy: { priority: 'desc' },
    })

    if (indexers.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        message: '没有可用的索引器，请先配置并启用索引器',
      })
    }

    // Build search queries - if Chinese, also try English
    const queries = await buildSearchQueries(query, mediaType || undefined)

    // Search all indexers in parallel with timeout handling
    const searchPromises = indexers.map((indexer) =>
      searchIndexer(indexer, queries)
    )

    const allResults = await Promise.allSettled(searchPromises)

    // Aggregate results
    let aggregated: RawSearchResult[] = []
    for (const result of allResults) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        aggregated.push(...result.value)
      }
    }

    // Score results
    for (const r of aggregated) {
      r.score = scoreResult(r)
    }

    // Deduplicate
    aggregated = deduplicateResults(aggregated)

    // Sort by score descending
    aggregated.sort((a, b) => (b.score || 0) - (a.score || 0))

    return NextResponse.json({
      results: aggregated,
      total: aggregated.length,
      queries: queries.length > 1 ? queries : undefined,
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: '搜索失败' }, { status: 500 })
  }
}

// ============================================
// Chinese search optimization
// ============================================

async function buildSearchQueries(
  originalQuery: string,
  mediaType?: string
): Promise<string[]> {
  const queries = [originalQuery]

  // Detect if query contains Chinese characters
  const hasChinese = /[\u4e00-\u9fff]/.test(originalQuery)

  if (hasChinese) {
    // Try to get English name from TMDB
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
    // Get TMDB API key from settings
    const setting = await db.setting.findUnique({
      where: { key: 'tmdb_api_key' },
    })
    const apiKey = setting?.value || process.env.TMDB_API_KEY
    if (!apiKey) return null

    const type = mediaType === 'tv' ? 'tv' : 'movie'
    const url = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(chineseName)}&page=1`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetchWithProxy(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return null

    const data = await res.json()
    if (data.results && data.results.length > 0) {
      // Return the first result's English title/name
      const first = data.results[0]
      return first.title || first.name || null
    }

    return null
  } catch {
    // TMDB lookup failed, continue without English name
    return null
  }
}

// ============================================
// Indexer search implementations
// ============================================

async function searchIndexer(
  indexer: IndexerRecord,
  queries: string[]
): Promise<RawSearchResult[]> {
  // Check rate limiting
  if (indexer.rateLimit && indexer.lastSearchAt) {
    const elapsed = Date.now() - new Date(indexer.lastSearchAt).getTime()
    if (elapsed < indexer.rateLimit * 1000) {
      // Skip this indexer due to rate limiting
      console.log(`Rate limited: ${indexer.name}, skipping`)
      return []
    }
  }

  try {
    let results: RawSearchResult[] = []

    switch (indexer.type) {
      case 'torznab':
      case 'newznab':
        results = await searchTorznab(indexer, queries)
        break
      case 'native_pt':
        results = await searchNativePt(indexer, queries)
        break
      case 'cardigann':
        // Cardigann uses similar approach to Torznab for search
        results = await searchTorznab(indexer, queries)
        break
      default:
        console.log(`Unknown indexer type: ${indexer.type}`)
    }

    // Update last search time
    await db.indexer.update({
      where: { id: indexer.id },
      data: { lastSearchAt: new Date() },
    }).catch(() => {})

    return results
  } catch (error) {
    console.error(`Search error for indexer ${indexer.name}:`, error)
    return []
  }
}

// -------------------------------------------
// Torznab/Newznab search
// -------------------------------------------

async function searchTorznab(
  indexer: IndexerRecord,
  queries: string[]
): Promise<RawSearchResult[]> {
  const baseUrl = buildBaseUrl(indexer)
  const allResults: RawSearchResult[] = []

  // Search with each query variant
  for (const query of queries) {
    const categories = indexer.categories || ''
    let url = `${baseUrl}/api?t=search&q=${encodeURIComponent(query)}`
    if (categories) {
      url += `&cat=${categories}`
    }
    if (indexer.apiKey) {
      url += `&apikey=${indexer.apiKey}`
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetchWithProxy(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MediaHub-CN/1.0',
          'Accept': 'application/xml',
        },
      })
      clearTimeout(timeout)

      if (!res.ok) {
        console.error(`Torznab search failed for ${indexer.name}: HTTP ${res.status}`)
        continue
      }

      const xml = await res.text()
      const items = parseTorznabXml(xml)

      for (const item of items) {
        allResults.push({
          title: item.title,
          size: item.size,
          seeders: item.seeders,
          leechers: item.peers,
          grabs: item.grabs,
          publishDate: item.pubDate,
          indexerName: indexer.name,
          indexerId: indexer.id,
          magnetUrl: item.magnetUrl,
          torrentUrl: item.link,
          infoHash: item.infoHash,
        })
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.error(`Torznab search timeout for ${indexer.name}`)
      } else {
        console.error(`Torznab search error for ${indexer.name}:`, error)
      }
    }
  }

  return allResults
}

interface TorznabItem {
  title: string
  link: string
  size: number
  pubDate: string
  seeders: number
  peers: number
  grabs: number
  infoHash: string
  magnetUrl: string
}

function parseTorznabXml(xml: string): TorznabItem[] {
  const items: TorznabItem[] = []

  // Simple regex-based XML parsing (no external deps needed)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]

    const title = extractXmlValue(itemXml, 'title') || ''
    const link = extractXmlValue(itemXml, 'link') || ''
    const sizeStr = extractXmlValue(itemXml, 'size') || '0'
    const pubDate = extractXmlValue(itemXml, 'pubDate') || new Date().toISOString()

    // Parse enclosure attributes
    const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]*)"[^>]*length="([^"]*)"/)
    const enclosureUrl = enclosureMatch ? enclosureMatch[1] : ''
    const enclosureLength = enclosureMatch ? parseInt(enclosureMatch[2], 10) : 0

    // Parse torznab attributes
    const seeders = parseInt(extractTorznabAttr(itemXml, 'seeders') || '0', 10)
    const peers = parseInt(extractTorznabAttr(itemXml, 'peers') || '0', 10)
    const grabs = parseInt(extractTorznabAttr(itemXml, 'grabs') || '0', 10)
    const infoHash = extractTorznabAttr(itemXml, 'infohash') || ''
    const magnetUrl = extractTorznabAttr(itemXml, 'magneturl') || ''

    const size = parseInt(sizeStr, 10) || enclosureLength || 0

    if (title) {
      items.push({
        title,
        link: link || enclosureUrl,
        size,
        pubDate,
        seeders,
        peers,
        grabs,
        infoHash,
        magnetUrl,
      })
    }
  }

  return items
}

function extractXmlValue(xml: string, tag: string): string | null {
  // Match both self-closing and regular tags, handle namespaces
  const regex = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i')
  const match = xml.match(regex)
  if (match) {
    return unescapeXml(match[1].trim())
  }
  return null
}

function extractTorznabAttr(xml: string, name: string): string | null {
  const regex = new RegExp(`<(?:\\w+:)?attr[^>]*name="${name}"[^>]*value="([^"]*)"`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : null
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
}

// -------------------------------------------
// Native PT site search
// -------------------------------------------

async function searchNativePt(
  indexer: IndexerRecord,
  queries: string[]
): Promise<RawSearchResult[]> {
  const allResults: RawSearchResult[] = []

  for (const query of queries) {
    try {
      const baseUrl = buildBaseUrl(indexer)
      const searchPath = indexer.searchPath || '/torrents.php'
      const separator = searchPath.includes('?') ? '&' : '?'
      const url = `${baseUrl}${searchPath}${separator}search=${encodeURIComponent(query)}`

      const headers: Record<string, string> = {
        'User-Agent': 'MediaHub-CN/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
      }

      // Use cookie auth for native PT
      if (indexer.cookie) {
        headers['Cookie'] = indexer.cookie
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetchWithProxy(url, {
        signal: controller.signal,
        headers,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        console.error(`Native PT search failed for ${indexer.name}: HTTP ${res.status}`)
        continue
      }

      const html = await res.text()
      const items = parseNativePtHtml(html, indexer)

      for (const item of items) {
        allResults.push({
          ...item,
          indexerName: indexer.name,
          indexerId: indexer.id,
        })
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.error(`Native PT search timeout for ${indexer.name}`)
      } else {
        console.error(`Native PT search error for ${indexer.name}:`, error)
      }
    }
  }

  return allResults
}

interface NativePtItem {
  title: string
  size: number
  seeders: number
  leechers: number
  grabs: number
  publishDate: string
  magnetUrl?: string
  torrentUrl?: string
  infoHash?: string
}

function parseNativePtHtml(
  html: string,
  indexer: IndexerRecord
): NativePtItem[] {
  const items: NativePtItem[] = []

  // Try to parse torrent table rows from HTML
  // Most PT sites use a similar table structure
  // Look for torrent rows - common patterns across different PT site engines

  // Pattern 1: NexusPHP-style tables with torrent name links
  const rowRegex = /<tr[^>]*class="[^"]*(?:torrent|row)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const item = parseNativePtRow(rowHtml, indexer)
    if (item) {
      items.push(item)
    }
  }

  // If no class-based rows found, try generic table rows in torrent table
  if (items.length === 0) {
    const tbodyMatch = html.match(/<table[^>]*id="[^"]*torrent[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
      || html.match(/<table[^>]*class="[^"]*torrent[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
      || html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)

    if (tbodyMatch) {
      const tbody = tbodyMatch[1]
      const genericRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      while ((rowMatch = genericRowRegex.exec(tbody)) !== null) {
        const rowHtml = rowMatch[1]
        const item = parseNativePtRow(rowHtml, indexer)
        if (item) {
          items.push(item)
        }
      }
    }
  }

  // If still nothing, try to parse JSON API response (M-Team style)
  if (items.length === 0) {
    try {
      const jsonMatch = html.match(/\{[\s\S]*"data"[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        if (data.data && Array.isArray(data.data)) {
          for (const torrent of data.data) {
            items.push({
              title: torrent.name || torrent.title || '',
              size: parseInt(torrent.size || '0', 10),
              seeders: parseInt(torrent.seeders || torrent.seeding || '0', 10),
              leechers: parseInt(torrent.leechers || torrent.leeching || '0', 10),
              grabs: parseInt(torrent.snatches || torrent.grabs || '0', 10),
              publishDate: torrent.time || torrent.created_at || new Date().toISOString(),
              torrentUrl: torrent.url || undefined,
              infoHash: torrent.info_hash || undefined,
            })
          }
        }
      }
    } catch {
      // Not JSON, ignore
    }
  }

  return items
}

function parseNativePtRow(
  rowHtml: string,
  indexer: IndexerRecord
): NativePtItem | null {
  // Extract title from link
  const titleMatch = rowHtml.match(/<a[^>]*href="[^"]*(?:details|torrent)[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
  if (!titleMatch) return null

  const title = titleMatch[1].replace(/<[^>]*>/g, '').trim()
  if (!title || title.length < 3) return null

  // Extract seeders, leechers, grabs from td cells
  const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []

  // Parse numeric values from cells - typically: category, name, size, seeders, leechers, grabs
  let size = 0
  let seeders = 0
  let leechers = 0
  let grabs = 0

  for (const cell of cells) {
    const text = cell.replace(/<[^>]*>/g, '').trim()

    // Size detection
    const sizeMatch = text.match(/([\d.]+)\s*(TB|GB|MB|KB)/i)
    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1])
      const unit = sizeMatch[2].toUpperCase()
      const multipliers: Record<string, number> = {
        KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
      }
      size = Math.round(val * (multipliers[unit] || 1))
    }

    // Seeders / leechers / grabs - small integers
    const num = parseInt(text, 10)
    if (!isNaN(num) && num >= 0 && num < 100000 && text.length < 8) {
      // Heuristic: seeders is usually > leechers > grabs pattern in cells
      if (seeders === 0 && num > 0) {
        // We need better heuristics - for now use the position pattern
        // This is a rough approximation
      }
    }
  }

  // Try to extract seeders/leechers with more specific patterns
  const seedersMatch = rowHtml.match(/(?:seeders?|seeding|做种)[^>]*>[\s\S]*?(\d+)/i)
    || rowHtml.match(/class="[^"]*seed[^"]*"[^>]*>(\d+)/i)
  if (seedersMatch) seeders = parseInt(seedersMatch[1], 10)

  const leechersMatch = rowHtml.match(/(?:leechers?|leeching|下载)[^>]*>[\s\S]*?(\d+)/i)
    || rowHtml.match(/class="[^"]*leech[^"]*"[^>]*>(\d+)/i)
  if (leechersMatch) leechers = parseInt(leechersMatch[1], 10)

  const grabsMatch = rowHtml.match(/(?:snatches?|grabs?|完成)[^>]*>[\s\S]*?(\d+)/i)
    || rowHtml.match(/class="[^"]*snatch[^"]*"[^>]*>(\d+)/i)
  if (grabsMatch) grabs = parseInt(grabsMatch[1], 10)

  // Extract torrent download link
  let torrentUrl: string | undefined
  const downloadMatch = rowHtml.match(/href="([^"]*(?:download|get)[^"]*)"/i)
  if (downloadMatch) {
    const baseUrl = buildBaseUrl(indexer)
    const href = downloadMatch[1]
    torrentUrl = href.startsWith('http') ? href : `${baseUrl}${href}`
  }

  // Extract info hash from magnet links
  let infoHash: string | undefined
  const magnetMatch = rowHtml.match(/magnet:\?xt=urn:btih:([a-fA-F0-9]{40})/i)
  if (magnetMatch) {
    infoHash = magnetMatch[1].toUpperCase()
  }

  return {
    title,
    size,
    seeders,
    leechers,
    grabs,
    publishDate: new Date().toISOString(),
    torrentUrl,
    infoHash,
  }
}

// ============================================
// URL builder
// ============================================

function buildBaseUrl(indexer: IndexerRecord): string {
  const scheme = indexer.scheme || 'https'
  const host = indexer.host
  const port = indexer.port

  let url = `${scheme}://${host}`

  // Add port if non-standard
  if (port && ((scheme === 'https' && port !== 443) || (scheme === 'http' && port !== 80))) {
    url += `:${port}`
  }

  // Add base path if present
  if (indexer.baseUrl) {
    // Ensure leading slash
    const base = indexer.baseUrl.startsWith('/') ? indexer.baseUrl : `/${indexer.baseUrl}`
    url += base
  }

  return url
}

// ============================================
// Scoring
// ============================================

function scoreResult(result: RawSearchResult): number {
  let score = 0

  // Parse quality info from title
  const title = result.title

  // Resolution scoring (higher is better)
  if (/2160p|4K|UHD/i.test(title)) score += 40
  else if (/1080p|FHD/i.test(title)) score += 30
  else if (/1080i/i.test(title)) score += 20
  else if (/720p/i.test(title)) score += 10

  // Source scoring
  if (/Remux/i.test(title)) score += 25
  else if (/BluRay|BLURAY|BDRip/i.test(title)) score += 20
  else if (/WEB-?DL/i.test(title)) score += 15
  else if (/WEBRip/i.test(title)) score += 12
  else if (/HDTV/i.test(title)) score += 8

  // Codec scoring
  if (/H\.?265|x265|HEVC/i.test(title)) score += 10
  else if (/H\.?264|x264/i.test(title)) score += 5

  // Chinese subtitle bonus (important for CN users)
  if (/[简繁]体|中文|双语|GB|BIG5|简日|繁日|简繁|CH[ST]|字幕组|中字/i.test(title)) {
    score += 30
  }

  // Seeders scoring (logarithmic to prevent domination)
  const seeders = result.seeders || 0
  if (seeders > 0) {
    score += Math.min(Math.log2(seeders + 1) * 3, 30)
  }

  // Size scoring - prefer reasonable sizes (not too small, not too large)
  const sizeGB = (result.size || 0) / (1024 ** 3)
  if (sizeGB > 0.5 && sizeGB < 10) score += 5
  else if (sizeGB >= 10 && sizeGB < 50) score += 3
  else if (sizeGB >= 50) score += 1

  // Recency bonus
  try {
    const pubDate = new Date(result.publishDate)
    const daysSincePub = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSincePub < 7) score += 15
    else if (daysSincePub < 30) score += 10
    else if (daysSincePub < 90) score += 5
  } catch {
    // Invalid date, no bonus
  }

  // Grabs bonus
  const grabs = result.grabs || 0
  if (grabs > 0) {
    score += Math.min(Math.log2(grabs + 1) * 2, 15)
  }

  return Math.round(score * 10) / 10
}

// ============================================
// Deduplication
// ============================================

function deduplicateResults(results: RawSearchResult[]): RawSearchResult[] {
  const seen = new Map<string, RawSearchResult>()

  for (const result of results) {
    let key: string

    // Primary dedup by infoHash (most reliable)
    if (result.infoHash) {
      key = `hash:${result.infoHash.toUpperCase()}`
    } else if (result.magnetUrl) {
      // Try to extract hash from magnet URL
      const hashMatch = result.magnetUrl.match(/urn:btih:([a-fA-F0-9]{40})/i)
      if (hashMatch) {
        key = `hash:${hashMatch[1].toUpperCase()}`
      } else {
        key = `title:${normalizeTitle(result.title)}`
      }
    } else {
      // Fallback to title similarity
      key = `title:${normalizeTitle(result.title)}`
    }

    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, result)
    } else {
      // Keep the one with higher score, or more seeders
      const newScore = result.score || 0
      const existingScore = existing.score || 0
      if (newScore > existingScore || (newScore === existingScore && (result.seeders || 0) > (existing.seeders || 0))) {
        seen.set(key, result)
      }
    }
  }

  return Array.from(seen.values())
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s._\-[\](){}]+/g, '')  // Remove separators
    .replace(/\d{3,4}p/g, '')           // Remove resolution
    .replace(/h\.?26[45]/gi, '')        // Remove codec
    .replace(/x26[45]/gi, '')           // Remove codec
    .replace(/hevc/gi, '')              // Remove codec
    .replace(/bluray|webdl|webrip|hdtv|remux/gi, '') // Remove source
    .replace(/[\u4e00-\u9fff]/g, '')    // Remove Chinese (for matching)
    .substring(0, 60)                   // Limit length
}
