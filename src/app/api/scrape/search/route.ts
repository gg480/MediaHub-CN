import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const TMDB_API_BASE = 'https://api.themoviedb.org/3'

// Default timeout for TMDB API requests (10 seconds)
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

    // If proxy is configured, use it
    // Note: In Node.js server-side, we can set the proxy via environment variables
    // or use a custom agent. For simplicity, we set the proxy via env vars for this request.
    if (proxyHost) {
      const proxyUrl = proxyHost.startsWith('http') ? proxyHost : `http://${proxyHost}`
      // Use environment variable approach for proxy (works with Node.js fetch)
      const prevProxy = process.env.http_proxy
      const prevHttpsProxy = process.env.https_proxy
      try {
        process.env.http_proxy = proxyUrl
        process.env.https_proxy = proxyUrl
        const response = await fetch(url, fetchOptions)
        return response
      } finally {
        // Restore previous proxy settings
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
 * Normalize TMDB search result items into a consistent format
 */
function normalizeSearchItem(item: Record<string, unknown>) {
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
    mediaType: (item.media_type as string) || 'movie',
    genreIds: item.genre_ids as number[] || [],
    popularity: (item.popularity as number) || 0,
  }
}

/**
 * GET /api/scrape/search?q=xxx                  - Multi-search movies and TV shows
 * GET /api/scrape/search?tmdbId=123&mediaType=movie - Get movie details
 * GET /api/scrape/search?tmdbId=123&mediaType=tv    - Get TV show details with seasons/episodes
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const query = searchParams.get('q')
    const tmdbId = searchParams.get('tmdbId')
    const mediaType = searchParams.get('mediaType') || 'movie'
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

    // ---- Case 1: Get specific media details by TMDB ID ----
    if (tmdbId) {
      if (mediaType === 'tv') {
        return await handleTvDetails(tmdbId, apiKey, language, proxyHost)
      } else {
        return await handleMovieDetails(tmdbId, apiKey, language, proxyHost)
      }
    }

    // ---- Case 2: Multi-search by query ----
    if (!query) {
      return NextResponse.json(
        { error: '请提供搜索关键词 (q) 或 TMDB ID (tmdbId)' },
        { status: 400 }
      )
    }

    return await handleMultiSearch(query, apiKey, language, page, proxyHost)
  } catch (error) {
    console.error('[TMDB Search] 请求失败:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'TMDB API 请求超时，请检查网络连接或代理配置' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: '刮削搜索失败，请稍后重试' },
      { status: 500 }
    )
  }
}

/**
 * Handle multi-search across movies and TV shows
 */
async function handleMultiSearch(
  query: string,
  apiKey: string,
  language: string,
  page: string,
  proxyHost: string | null
) {
  const url = `${TMDB_API_BASE}/search/multi?api_key=${apiKey}&language=${language}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`

  const res = await tmdbFetch(url, proxyHost)

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    console.error(`[TMDB Search] API 错误: ${res.status}`, errorText)
    return NextResponse.json(
      { error: `TMDB 搜索失败 (HTTP ${res.status})，请检查 API 密钥是否正确` },
      { status: res.status }
    )
  }

  const data = await res.json()

  // Filter out person results and normalize
  const filteredResults = (data.results || [])
    .filter((item: Record<string, unknown>) => item.media_type !== 'person')
    .map(normalizeSearchItem)

  return NextResponse.json({
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    results: filteredResults,
    source: 'tmdb',
  })
}

/**
 * Handle movie details request
 */
async function handleMovieDetails(
  tmdbId: string,
  apiKey: string,
  language: string,
  proxyHost: string | null
) {
  const url = `${TMDB_API_BASE}/movie/${tmdbId}?api_key=${apiKey}&language=${language}&append_to_response=credits,videos`

  const res = await tmdbFetch(url, proxyHost)

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json(
        { error: `未找到 TMDB ID 为 ${tmdbId} 的电影` },
        { status: 404 }
      )
    }
    console.error(`[TMDB Movie Details] API 错误: ${res.status}`)
    return NextResponse.json(
      { error: `获取电影详情失败 (HTTP ${res.status})` },
      { status: res.status }
    )
  }

  const data = await res.json()

  // Normalize the response
  const normalized = {
    id: data.id,
    title: data.title,
    originalTitle: data.original_title,
    overview: data.overview,
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    releaseDate: data.release_date,
    voteAverage: data.vote_average,
    voteCount: data.vote_count,
    popularity: data.popularity,
    runtime: data.runtime,
    genres: data.genres,
    productionCompanies: data.production_companies,
    productionCountries: data.production_countries,
    imdbId: data.imdb_id,
    mediaType: 'movie',
    credits: data.credits ? {
      cast: (data.credits.cast || []).slice(0, 20).map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: c.profile_path,
        order: c.order,
      })),
      crew: (data.credits.crew || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profilePath: c.profile_path,
      })),
    } : null,
    videos: data.videos?.results?.filter((v: Record<string, unknown>) => v.site === 'YouTube').slice(0, 5) || [],
    source: 'tmdb',
  }

  return NextResponse.json(normalized)
}

/**
 * Handle TV show details request with seasons and episodes
 */
async function handleTvDetails(
  tmdbId: string,
  apiKey: string,
  language: string,
  proxyHost: string | null
) {
  const url = `${TMDB_API_BASE}/tv/${tmdbId}?api_key=${apiKey}&language=${language}&append_to_response=credits,videos`

  const res = await tmdbFetch(url, proxyHost)

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json(
        { error: `未找到 TMDB ID 为 ${tmdbId} 的剧集` },
        { status: 404 }
      )
    }
    console.error(`[TMDB TV Details] API 错误: ${res.status}`)
    return NextResponse.json(
      { error: `获取剧集详情失败 (HTTP ${res.status})` },
      { status: res.status }
    )
  }

  const data = await res.json()

  // Normalize seasons info
  const seasons = (data.seasons || []).map((s: Record<string, unknown>) => ({
    id: s.id,
    seasonNumber: s.season_number,
    name: s.name,
    overview: s.overview,
    airDate: s.air_date,
    episodeCount: s.episode_count,
    posterPath: s.poster_path,
  }))

  const normalized = {
    id: data.id,
    name: data.name,
    originalName: data.original_name,
    overview: data.overview,
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    firstAirDate: data.first_air_date,
    lastAirDate: data.last_air_date,
    voteAverage: data.vote_average,
    voteCount: data.vote_count,
    popularity: data.popularity,
    numberOfSeasons: data.number_of_seasons,
    numberOfEpisodes: data.number_of_episodes,
    status: data.status,
    genres: data.genres,
    productionCompanies: data.production_companies,
    originCountry: data.origin_country,
    createdBy: data.created_by,
    networks: data.networks,
    imdbId: data.imdb_id,
    mediaType: 'tv',
    seasons,
    credits: data.credits ? {
      cast: (data.credits.cast || []).slice(0, 20).map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: c.profile_path,
        order: c.order,
      })),
      crew: (data.credits.crew || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profilePath: c.profile_path,
      })),
    } : null,
    videos: data.videos?.results?.filter((v: Record<string, unknown>) => v.site === 'YouTube').slice(0, 5) || [],
    source: 'tmdb',
  }

  return NextResponse.json(normalized)
}
