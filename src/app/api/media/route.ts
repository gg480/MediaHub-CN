import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const mediaType = searchParams.get('mediaType')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (mediaType) where.type = mediaType
    if (status) where.status = status

    const media = await db.mediaItem.findMany({
      where,
      include: {
        seasons: {
          include: {
            episodes: true,
          },
          orderBy: { seasonNumber: 'asc' },
        },
      },
      orderBy: { addedAt: 'desc' },
    })

    return NextResponse.json(media)
  } catch (error) {
    console.error('Media list error:', error)
    return NextResponse.json({ error: '获取影视列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tmdbId, mediaType, title, titleCn, overview, posterPath, backdropPath, year, rating, seasons } = body

    if (!tmdbId || !mediaType || !title) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
    }

    const existing = await db.mediaItem.findFirst({ where: { tmdbId } })
    if (existing) {
      return NextResponse.json({ error: '该影视已存在' }, { status: 409 })
    }

    const media = await db.mediaItem.create({
      data: {
        tmdbId,
        type: mediaType,
        titleCn: titleCn || title,
        titleEn: mediaType === 'movie' ? title : null,
        originalTitle: title,
        overviewCn: overview || null,
        posterPath: posterPath || null,
        backdropPath: backdropPath || null,
        year: year || null,
        tmdbRating: rating || null,
        status: 'wanted',
        monitored: true,
      },
    })

    // If TV show with seasons data
    if (mediaType === 'tv' && seasons && Array.isArray(seasons)) {
      for (const seasonData of seasons as { seasonNumber: number; episodes: { episodeNumber: number; titleCn?: string; overview?: string; airDate?: string }[] }[]) {
        const season = await db.season.create({
          data: {
            mediaItemId: media.id,
            seasonNumber: seasonData.seasonNumber,
            monitored: true,
          },
        })
        for (const epData of seasonData.episodes) {
          await db.episode.create({
            data: {
              seasonId: season.id,
              episodeNumber: epData.episodeNumber,
              titleCn: epData.titleCn || null,
              overview: epData.overview || null,
              airDate: epData.airDate || null,
              status: 'wanted',
            },
          })
        }
      }
    }

    return NextResponse.json(media, { status: 201 })
  } catch (error) {
    console.error('Media create error:', error)
    return NextResponse.json({ error: '创建影视失败' }, { status: 500 })
  }
}
