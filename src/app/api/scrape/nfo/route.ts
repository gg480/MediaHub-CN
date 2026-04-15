import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'

const TMDB_API_BASE = 'https://api.themoviedb.org/3'

/**
 * GET /api/scrape/nfo?mediaItemId=xxx
 * Generate NFO XML for a media item (Kodi/Emby/Jellyfin/极影视 compatible)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const mediaItemId = searchParams.get('mediaItemId')

    if (!mediaItemId) {
      return NextResponse.json({ error: '请提供 mediaItemId' }, { status: 400 })
    }

    const mediaItem = await db.mediaItem.findUnique({
      where: { id: mediaItemId },
      include: {
        seasons: {
          include: { episodes: { orderBy: { episodeNumber: 'asc' } } },
          orderBy: { seasonNumber: 'asc' },
        },
      },
    })

    if (!mediaItem) {
      return NextResponse.json({ error: '未找到该影视' }, { status: 404 })
    }

    // Try to enrich data from TMDB if needed
    let enrichedData: Record<string, unknown> | null = null
    if (mediaItem.tmdbId) {
      enrichedData = await enrichFromTmdb(mediaItem.tmdbId, mediaItem.type)
    }

    // Generate NFO
    const nfoContent = mediaItem.type === 'movie'
      ? generateMovieNfo(mediaItem, enrichedData)
      : generateTvShowNfo(mediaItem, enrichedData)

    // Save NFO record to database
    await db.nfoFile.upsert({
      where: {
        id: `${mediaItemId}-main`,
      },
      create: {
        id: `${mediaItemId}-main`,
        mediaItemId,
        filePath: generateNfoPath(mediaItem),
        nfoType: mediaItem.type === 'movie' ? 'movie' : 'tvshow',
        content: nfoContent,
        scrapedFrom: enrichedData ? 'tmdb' : 'local',
        lastScrapedAt: new Date(),
      },
      update: {
        content: nfoContent,
        scrapedFrom: enrichedData ? 'tmdb' : 'local',
        lastScrapedAt: new Date(),
      },
    })

    // Write NFO file to disk if library path is configured
    const nfoWritten = await writeNfoToDisk(mediaItem, nfoContent)

    return NextResponse.json({
      content: nfoContent,
      type: mediaItem.type === 'movie' ? 'movie' : 'tvshow',
      filePath: generateNfoPath(mediaItem),
      writtenToDisk: nfoWritten,
    })
  } catch (error) {
    console.error('NFO generation error:', error)
    return NextResponse.json({ error: 'NFO生成失败' }, { status: 500 })
  }
}

/**
 * POST /api/scrape/nfo?mediaItemId=xxx
 * Scrape metadata from TMDB and regenerate NFO
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const mediaItemId = searchParams.get('mediaItemId')

    if (!mediaItemId) {
      return NextResponse.json({ error: '请提供 mediaItemId' }, { status: 400 })
    }

    const mediaItem = await db.mediaItem.findUnique({
      where: { id: mediaItemId },
      include: {
        seasons: {
          include: { episodes: { orderBy: { episodeNumber: 'asc' } } },
          orderBy: { seasonNumber: 'asc' },
        },
      },
    })

    if (!mediaItem) {
      return NextResponse.json({ error: '未找到该影视' }, { status: 404 })
    }

    // Get TMDB API key
    const apiKey = await getTmdbApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'TMDB API 密钥未配置' }, { status: 400 })
    }

    // Scrape from TMDB
    let enrichedData: Record<string, unknown> | null = null
    if (mediaItem.tmdbId) {
      enrichedData = await enrichFromTmdb(mediaItem.tmdbId, mediaItem.type)
    }

    // Update media item with scraped data
    if (enrichedData) {
      await db.mediaItem.update({
        where: { id: mediaItemId },
        data: {
          titleEn: (enrichedData.title || enrichedData.name || mediaItem.titleEn) as string || null,
          originalTitle: (enrichedData.originalTitle || enrichedData.originalName) as string || null,
          overviewCn: (enrichedData.overview as string) || mediaItem.overviewCn || null,
          overviewEn: (enrichedData.overviewEn as string) || null,
          posterPath: (enrichedData.posterPath as string) || mediaItem.posterPath || null,
          backdropPath: (enrichedData.backdropPath as string) || mediaItem.backdropPath || null,
          imdbId: (enrichedData.imdbId as string) || mediaItem.imdbId || null,
          tmdbRating: (enrichedData.voteAverage as number) || mediaItem.tmdbRating || null,
          year: enrichedData.year as number || mediaItem.year || null,
        },
      })
    }

    // Generate NFO
    const nfoContent = mediaItem.type === 'movie'
      ? generateMovieNfo({ ...mediaItem, ...enrichedData } as any, enrichedData)
      : generateTvShowNfo({ ...mediaItem, ...enrichedData } as any, enrichedData)

    // Save NFO record
    await db.nfoFile.upsert({
      where: { id: `${mediaItemId}-main` },
      create: {
        id: `${mediaItemId}-main`,
        mediaItemId,
        filePath: generateNfoPath(mediaItem),
        nfoType: mediaItem.type === 'movie' ? 'movie' : 'tvshow',
        content: nfoContent,
        scrapedFrom: 'tmdb',
        lastScrapedAt: new Date(),
      },
      update: {
        content: nfoContent,
        scrapedFrom: 'tmdb',
        lastScrapedAt: new Date(),
      },
    })

    // Write NFO file to disk if library path is configured
    const nfoWritten = await writeNfoToDisk(mediaItem, nfoContent)

    // Generate episode NFOs for TV shows
    let episodeNfoCount = 0
    if (mediaItem.type === 'tv' && mediaItem.seasons && mediaItem.seasons.length > 0) {
      episodeNfoCount = await generateEpisodeNfos(mediaItem)
    }

    // Download poster and fanart images
    const artworkDownloaded = await downloadArtwork(mediaItem)

    return NextResponse.json({
      success: true,
      content: nfoContent,
      type: mediaItem.type === 'movie' ? 'movie' : 'tvshow',
      updated: !!enrichedData,
      writtenToDisk: nfoWritten,
      episodeNfoCount,
      artworkDownloaded,
    })
  } catch (error) {
    console.error('NFO scrape error:', error)
    return NextResponse.json({ error: '刮削失败' }, { status: 500 })
  }
}

// ============================================
// TMDB Enrichment
// ============================================

async function getTmdbApiKey(): Promise<string | null> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'tmdb_api_key' } })
    if (setting?.value) return setting.value
  } catch {}
  return process.env.TMDB_API_KEY || null
}

async function enrichFromTmdb(tmdbId: number, mediaType: string): Promise<Record<string, unknown> | null> {
  try {
    const apiKey = await getTmdbApiKey()
    if (!apiKey) return null

    const endpoint = mediaType === 'tv' ? `tv/${tmdbId}` : `movie/${tmdbId}`
    const url = `${TMDB_API_BASE}/${endpoint}?api_key=${apiKey}&language=zh-CN&append_to_response=credits`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return null

    const data = await res.json()

    const year = mediaType === 'tv'
      ? parseInt((data.first_air_date || '').substring(0, 4)) || null
      : parseInt((data.release_date || '').substring(0, 4)) || null

    return {
      title: data.title || null,
      name: data.name || null,
      originalTitle: data.original_title || null,
      originalName: data.original_name || null,
      overview: data.overview || null,
      overviewEn: data.overview || null, // Could fetch English version separately
      posterPath: data.poster_path || null,
      backdropPath: data.backdrop_path || null,
      voteAverage: data.vote_average || null,
      imdbId: data.imdb_id || null,
      year,
      runtime: data.runtime || null,
      genres: (data.genres || []).map((g: { name: string }) => g.name),
      mpaa: data.release_dates?.results?.[0]?.release_dates?.[0]?.certification || null,
      studios: (data.production_companies || []).map((c: { name: string }) => c.name),
      director: data.credits?.crew?.filter((c: { job: string }) => c.job === 'Director').map((c: { name: string }) => c.name).join(' / ') || null,
      cast: (data.credits?.cast || []).slice(0, 10).map((c: { name: string; character: string }) => `${c.name} as ${c.character}`),
      premiered: mediaType === 'tv' ? data.first_air_date : data.release_date,
      status: data.status || null,
    }
  } catch {
    return null
  }
}

// ============================================
// NFO Generation Functions
// ============================================

interface MediaItemData {
  titleCn: string
  titleEn?: string | null
  originalTitle?: string | null
  year?: number | null
  tmdbId?: number | null
  imdbId?: string | null
  overviewCn?: string | null
  overviewEn?: string | null
  posterPath?: string | null
  backdropPath?: string | null
  doubanRating?: number | null
  tmdbRating?: number | null
  type: string
  seasons?: Array<{
    seasonNumber: number
    title?: string | null
    episodes?: Array<{
      episodeNumber: number
      titleCn?: string | null
      titleEn?: string | null
      overview?: string | null
      airDate?: string | null
    }>
  }>
}

function generateMovieNfo(item: MediaItemData, enriched: Record<string, unknown> | null): string {
  const title = item.titleCn || item.titleEn || ''
  const originalTitle = enriched?.originalTitle || item.originalTitle || title
  const year = enriched?.year || item.year || ''
  const outline = enriched?.overview || item.overviewCn || ''
  const rating = item.doubanRating || item.tmdbRating || enriched?.voteAverage || 0
  const genres = (enriched?.genres as string[]) || []
  const mpaa = enriched?.mpaa as string || ''
  const runtime = enriched?.runtime as number || 0
  const director = enriched?.director as string || ''
  const studios = (enriched?.studios as string[]) || []
  const premiered = enriched?.premiered as string || ''
  const tmdbId = item.tmdbId || ''
  const imdbId = enriched?.imdbId || item.imdbId || ''
  const cast = (enriched?.cast as string[]) || []

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  xml += '<movie>\n'

  // Title
  xml += `  <title>${escXml(title)}</title>\n`
  xml += `  <originaltitle>${escXml(originalTitle)}</originaltitle>\n`
  if (item.titleEn) {
    xml += `  <sorttitle>${escXml(item.titleEn)}</sorttitle>\n`
  }

  // IDs
  if (tmdbId) xml += `  <tmdbid>${tmdbId}</tmdbid>\n`
  if (imdbId) xml += `  <imdbid>${escXml(imdbId)}</imdbid>\n`

  // Rating
  if (rating > 0) xml += `  <rating>${rating.toFixed(1)}</rating>\n`
  if (item.doubanRating) xml += `  <doubanrating>${item.doubanRating.toFixed(1)}</doubanrating>\n`
  if (item.tmdbRating || enriched?.voteAverage) xml += `  <tmdbrating>${((item.tmdbRating || enriched?.voteAverage || 0) as number).toFixed(1)}</tmdbrating>\n`
  xml += `  <votes>0</votes>\n`

  // Year and dates
  if (year) xml += `  <year>${year}</year>\n`
  if (premiered) xml += `  <premiered>${escXml(premiered)}</premiered>\n`

  // Runtime
  if (runtime > 0) xml += `  <runtime>${runtime}</runtime>\n`

  // MPAA
  if (mpaa) xml += `  <mpaa>${escXml(mpaa)}</mpaa>\n`

  // Genres
  for (const genre of genres) {
    xml += `  <genre>${escXml(genre)}</genre>\n`
  }

  // Studios
  for (const studio of studios) {
    xml += `  <studio>${escXml(studio)}</studio>\n`
  }

  // Director
  if (director) xml += `  <director>${escXml(director)}</director>\n`

  // Credits (Cast)
  for (const actor of cast) {
    xml += `  <actor>${escXml(actor)}</actor>\n`
  }

  // Plot
  if (outline) xml += `  <plot>${escXml(outline)}</plot>\n`
  if (outline) xml += `  <outline>${escXml(outline.substring(0, 200))}</outline>\n`

  // Artwork references
  if (item.posterPath) xml += `  <thumb aspect="poster" preview="https://image.tmdb.org/t/p/w500${item.posterPath}">https://image.tmdb.org/t/p/original${item.posterPath}</thumb>\n`
  if (item.backdropPath) xml += `  <fanart url="https://image.tmdb.org/t/p/original${item.backdropPath}" />\n`

  // Unique IDs
  xml += '  <uniqueid type="tmdb" default="true">' + (tmdbId || '') + '</uniqueid>\n'
  if (imdbId) xml += '  <uniqueid type="imdb">' + escXml(imdbId) + '</uniqueid>\n'

  // User rating
  xml += `  <userrating>0</userrating>\n`
  xml += `  <playcount>0</playcount>\n`
  xml += `  <watched>false</watched>\n`

  xml += '</movie>'
  return xml
}

function generateTvShowNfo(item: MediaItemData, enriched: Record<string, unknown> | null): string {
  const title = item.titleCn || item.titleEn || ''
  const originalTitle = enriched?.originalName || enriched?.originalTitle || item.originalTitle || title
  const year = enriched?.year || item.year || ''
  const outline = enriched?.overview || item.overviewCn || ''
  const rating = item.doubanRating || item.tmdbRating || enriched?.voteAverage || 0
  const genres = (enriched?.genres as string[]) || []
  const studios = (enriched?.studios as string[]) || []
  const premiered = enriched?.premiered as string || ''
  const status = enriched?.status as string || ''
  const tmdbId = item.tmdbId || ''
  const imdbId = enriched?.imdbId || item.imdbId || ''
  const cast = (enriched?.cast as string[]) || []

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  xml += '<tvshow>\n'

  // Title
  xml += `  <title>${escXml(title)}</title>\n`
  xml += `  <originaltitle>${escXml(originalTitle)}</originaltitle>\n`
  if (item.titleEn) {
    xml += `  <sorttitle>${escXml(item.titleEn)}</sorttitle>\n`
  }

  // IDs
  if (tmdbId) xml += `  <tmdbid>${tmdbId}</tmdbid>\n`
  if (imdbId) xml += `  <imdbid>${escXml(imdbId)}</imdbid>\n`

  // Rating
  if (rating > 0) xml += `  <rating>${rating.toFixed(1)}</rating>\n`
  if (item.doubanRating) xml += `  <doubanrating>${item.doubanRating.toFixed(1)}</doubanrating>\n`
  if (item.tmdbRating || enriched?.voteAverage) xml += `  <tmdbrating>${((item.tmdbRating || enriched?.voteAverage || 0) as number).toFixed(1)}</tmdbrating>\n`
  xml += `  <votes>0</votes>\n`

  // Year and dates
  if (year) xml += `  <year>${year}</year>\n`
  if (premiered) xml += `  <premiered>${escXml(premiered)}</premiered>\n`
  if (premiered) xml += `  <ended>${status === 'Ended' ? 'true' : 'false'}</ended>\n`

  // Status
  if (status) xml += `  <status>${escXml(status)}</status>\n`

  // Genres
  for (const genre of genres) {
    xml += `  <genre>${escXml(genre)}</genre>\n`
  }

  // Studios
  for (const studio of studios) {
    xml += `  <studio>${escXml(studio)}</studio>\n`
  }

  // Credits
  for (const actor of cast) {
    xml += `  <actor>${escXml(actor)}</actor>\n`
  }

  // Plot
  if (outline) xml += `  <plot>${escXml(outline)}</plot>\n`
  if (outline) xml += `  <outline>${escXml(outline.substring(0, 200))}</outline>\n`

  // Artwork references
  if (item.posterPath) xml += `  <thumb aspect="poster" preview="https://image.tmdb.org/t/p/w500${item.posterPath}">https://image.tmdb.org/t/p/original${item.posterPath}</thumb>\n`
  if (item.backdropPath) xml += `  <fanart url="https://image.tmdb.org/t/p/original${item.backdropPath}" />\n`

  // Unique IDs
  xml += '  <uniqueid type="tmdb" default="true">' + (tmdbId || '') + '</uniqueid>\n'
  if (imdbId) xml += '  <uniqueid type="imdb">' + escXml(imdbId) + '</uniqueid>\n'

  xml += `  <userrating>0</userrating>\n`
  xml += `  <playcount>0</playcount>\n`

  xml += '</tvshow>'
  return xml
}

function generateNfoPath(item: MediaItemData): string {
  const title = item.titleCn || item.titleEn || 'Unknown'
  const year = item.year || ''
  const safeName = title.replace(/[\\/:*?"<>|]/g, '').trim()
  if (item.type === 'movie') {
    return `${safeName} (${year})${safeName ? '/movie.nfo' : '/movie.nfo'}`
  }
  return `${safeName} (${year})/tvshow.nfo`
}

// ============================================
// Write NFO to disk
// ============================================

async function getLibraryBasePath(mediaType: string): Promise<string | null> {
  try {
    const key = mediaType === 'tv' ? 'tv_library_path' : 'movie_library_path'
    const setting = await db.setting.findUnique({ where: { key } })
    return setting?.value || null
  } catch {
    return null
  }
}

async function writeNfoToDisk(item: MediaItemData, nfoContent: string): Promise<boolean> {
  try {
    const basePath = await getLibraryBasePath(item.type)
    if (!basePath) return false

    // Build the full filesystem path
    const title = item.titleCn || item.titleEn || 'Unknown'
    const year = item.year || ''
    const safeName = title.replace(/[\\/:*?"<>|]/g, '').trim()
    const folderName = year ? `${safeName} (${year})` : safeName
    const nfoFilename = item.type === 'movie' ? 'movie.nfo' : 'tvshow.nfo'
    const fullPath = join(basePath, folderName, nfoFilename)

    // Ensure parent directory exists
    const parentDir = dirname(fullPath)
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }

    // Write NFO file with UTF-8 BOM for better compatibility with Chinese players
    const bom = Buffer.from([0xEF, 0xBB, 0xBF])
    writeFileSync(fullPath, Buffer.concat([bom, Buffer.from(nfoContent, 'utf-8')]))

    // Update the NFO record with the actual filesystem path
    await db.nfoFile.update({
      where: { id: `${item.tmdbId || item.titleCn || 'unknown'}-main` },
      data: { filePath: fullPath },
    }).catch(() => {})

    console.log(`NFO written to disk: ${fullPath}`)
    return true
  } catch (error) {
    console.error('Failed to write NFO to disk:', error)
    return false
  }
}

function escXml(str: string | number | null | undefined): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================
// Episode-level NFO generation (TV shows)
// ============================================

async function generateEpisodeNfos(item: MediaItemData): Promise<number> {
  if (!item.seasons || item.seasons.length === 0) return 0

  const basePath = await getLibraryBasePath('tv')
  if (!basePath) return 0

  const title = item.titleCn || item.titleEn || 'Unknown'
  const safeName = title.replace(/[\\/:*?"<>|]/g, '').trim()
  const showDir = join(basePath, safeName)

  let count = 0

  for (const season of item.seasons) {
    if (!season.episodes || season.episodes.length === 0) continue

    const seasonNum = String(season.seasonNumber).padStart(2, '0')
    const seasonDir = join(showDir, `Season ${seasonNum}`)

    if (!existsSync(seasonDir)) {
      mkdirSync(seasonDir, { recursive: true })
    }

    for (const episode of season.episodes) {
      const epNum = String(episode.episodeNumber).padStart(2, '0')
      const nfoPath = join(seasonDir, `S${seasonNum}E${epNum}.nfo`)

      const epTitle = episode.titleCn || episode.titleEn || ''
      const epRating = 0 // Episode-level ratings can be added later
      const epAirDate = episode.airDate || ''
      const epOverview = episode.overview || ''

      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      xml += '<episodedetails>\n'
      xml += `  <title>${escXml(epTitle)}</title>\n`
      if (season.seasonNumber) xml += `  <season>${season.seasonNumber}</season>\n`
      if (episode.episodeNumber) xml += `  <episode>${episode.episodeNumber}</episode>\n`
      xml += `  <showtitle>${escXml(title)}</showtitle>\n`
      if (item.tmdbId) xml += `  <tmdbid>${item.tmdbId}</tmdbid>\n`
      if (epRating > 0) xml += `  <rating>${epRating.toFixed(1)}</rating>\n`
      if (epAirDate) xml += `  <aired>${escXml(epAirDate)}</aired>\n`
      if (epOverview) xml += `  <plot>${escXml(epOverview)}</plot>\n`
      xml += `  <playcount>0</playcount>\n`
      xml += `  <watched>false</watched>\n`
      xml += '</episodedetails>'

      try {
        const bom = Buffer.from([0xEF, 0xBB, 0xBF])
        writeFileSync(nfoPath, Buffer.concat([bom, Buffer.from(xml, 'utf-8')]))
        count++
      } catch (error) {
        console.error(`Failed to write episode NFO: ${nfoPath}`, error)
      }
    }
  }

  if (count > 0) {
    console.log(`Generated ${count} episode NFOs for: ${title}`)
  }

  return count
}

// ============================================
// Poster & Fanart Download
// ============================================

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original'

async function downloadArtwork(item: MediaItemData): Promise<boolean> {
  const basePath = await getLibraryBasePath(item.type)
  if (!basePath) return false

  const title = item.titleCn || item.titleEn || 'Unknown'
  const year = item.year || ''
  const safeName = title.replace(/[\\/:*?"<>|]/g, '').trim()
  const folderName = year ? `${safeName} (${year})` : safeName
  const targetDir = join(basePath, folderName)

  let downloaded = false

  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    // Download poster
    const posterPath = item.posterPath
    if (posterPath) {
      const posterUrl = `${TMDB_IMAGE_BASE}${posterPath}`
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000)
        const res = await fetch(posterUrl, { signal: controller.signal })
        clearTimeout(timeout)

        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          writeFileSync(join(targetDir, 'poster.jpg'), buffer)
          downloaded = true
          console.log(`Poster downloaded: ${targetDir}/poster.jpg`)
        }
      } catch (error) {
        console.error(`Failed to download poster for ${title}:`, error)
      }
    }

    // Download fanart
    const backdropPath = item.backdropPath
    if (backdropPath) {
      const fanartUrl = `${TMDB_IMAGE_BASE}${backdropPath}`
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000)
        const res = await fetch(fanartUrl, { signal: controller.signal })
        clearTimeout(timeout)

        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          writeFileSync(join(targetDir, 'fanart.jpg'), buffer)
          downloaded = true
          console.log(`Fanart downloaded: ${targetDir}/fanart.jpg`)
        }
      } catch (error) {
        console.error(`Failed to download fanart for ${title}:`, error)
      }
    }
  } catch (error) {
    console.error('Artwork download error:', error)
  }

  return downloaded
}
