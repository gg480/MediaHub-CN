import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const TMDB_API_BASE = 'https://api.themoviedb.org/3'
const TMDB_TIMEOUT = 10_000

/**
 * Get TMDB API key from database Settings or environment variable
 */
async function getTmdbApiKey(): Promise<string | null> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'tmdb_api_key' } })
    if (setting?.value) return setting.value
  } catch {
    // DB not available, fall through
  }
  return process.env.TMDB_API_KEY || null
}

/**
 * Get proxy configuration from database Settings
 */
async function getProxyConfig(): Promise<string | null> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'proxy_host' } })
    return setting?.value || null
  } catch {
    return null
  }
}

/**
 * Make a fetch request to TMDB API with optional proxy support and timeout
 */
async function tmdbFetch(url: string, proxyHost: string | null): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TMDB_TIMEOUT)

  try {
    const fetchOptions: RequestInit = {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    }

    if (proxyHost) {
      const proxyUrl = proxyHost.startsWith('http') ? proxyHost : `http://${proxyHost}`
      const prevProxy = process.env.http_proxy
      const prevHttpsProxy = process.env.https_proxy
      try {
        process.env.http_proxy = proxyUrl
        process.env.https_proxy = proxyUrl
        const response = await fetch(url, fetchOptions)
        return response
      } finally {
        if (prevProxy !== undefined) process.env.http_proxy = prevProxy
        else delete process.env.http_proxy
        if (prevHttpsProxy !== undefined) process.env.https_proxy = prevHttpsProxy
        else delete process.env.https_proxy
      }
    }

    return await fetch(url, fetchOptions)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Normalize TMDB result items into a consistent format
 */
function normalizeMediaItem(item: Record<string, unknown>, mediaType: string) {
  return {
    id: item.id as number,
    title: (item.title as string) || undefined,
    name: (item.name as string) || undefined,
    overview: (item.overview as string) || undefined,
    posterPath: (item.poster_path as string) || undefined,
    backdropPath: (item.backdrop_path as string) || undefined,
    releaseDate: (item.release_date as string) || undefined,
    firstAirDate: (item.first_air_date as string) || undefined,
    voteAverage: (item.vote_average as number) || 0,
    mediaType,
    genreIds: (item.genre_ids as number[]) || [],
    popularity: (item.popularity as number) || 0,
  }
}

/**
 * GET /api/scrape/tmdb?trending=movie     - Get trending movies (weekly)
 * GET /api/scrape/tmdb?trending=tv        - Get trending TV shows (weekly)
 * GET /api/scrape/tmdb?popular=movie       - Get popular movies
 * GET /api/scrape/tmdb?popular=tv          - Get popular TV shows
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const trending = searchParams.get('trending')
    const popular = searchParams.get('popular')
    const language = searchParams.get('language') || 'zh-CN'
    const page = searchParams.get('page') || '1'

    const apiKey = await getTmdbApiKey()
    const proxyHost = await getProxyConfig()

    if (!apiKey) {
      return NextResponse.json(
        { error: 'TMDB API 密钥未配置，请在设置页面配置 TMDB API Key 或设置环境变量 TMDB_API_KEY' },
        { status: 400 }
      )
    }

    let url = ''
    let mediaType = ''

    // ---- Trending content ----
    if (trending) {
      if (trending !== 'movie' && trending !== 'tv') {
        return NextResponse.json(
          { error: 'trending 参数必须是 "movie" 或 "tv"' },
          { status: 400 }
        )
      }
      mediaType = trending
      url = `${TMDB_API_BASE}/trending/${trending}/week?api_key=${apiKey}&language=${language}&page=${page}`
    }
    // ---- Popular content ----
    else if (popular) {
      if (popular !== 'movie' && popular !== 'tv') {
        return NextResponse.json(
          { error: 'popular 参数必须是 "movie" 或 "tv"' },
          { status: 400 }
        )
      }
      mediaType = popular
      url = `${TMDB_API_BASE}/${popular}/popular?api_key=${apiKey}&language=${language}&page=${page}`
    }
    // ---- No valid parameter ----
    else {
      return NextResponse.json(
        { error: '请提供 trending 或 popular 参数，例如: ?trending=movie 或 ?popular=tv' },
        { status: 400 }
      )
    }

    const res = await tmdbFetch(url, proxyHost)

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      console.error(`[TMDB] API 错误: ${res.status}`, errorText)
      return NextResponse.json(
        { error: `TMDB 请求失败 (HTTP ${res.status})，请检查 API 密钥是否正确` },
        { status: res.status }
      )
    }

    const data = await res.json()

    const results = (data.results || []).map(
      (item: Record<string, unknown>) => normalizeMediaItem(item, mediaType)
    )

    const label = trending
      ? `热门${mediaType === 'movie' ? '电影' : '剧集'}`
      : `流行${mediaType === 'movie' ? '电影' : '剧集'}`

    return NextResponse.json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results,
      label,
      source: 'tmdb',
    })
  } catch (error) {
    console.error('[TMDB] 请求失败:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'TMDB API 请求超时，请检查网络连接或代理配置' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: '获取 TMDB 数据失败，请稍后重试' },
      { status: 500 }
    )
  }
}
