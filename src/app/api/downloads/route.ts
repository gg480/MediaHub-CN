import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const downloads = await db.downloadTask.findMany({
      where,
      include: {
        mediaItem: { select: { id: true, titleCn: true, type: true } },
        indexer: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(downloads)
  } catch (error) {
    console.error('Downloads list error:', error)
    return NextResponse.json({ error: '获取下载列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, size, magnetUrl, torrentUrl, infoHash, mediaItemId, episodeId, indexerId, clientId, quality, resolution, codec, source, group, hasChineseSub, seeders, leechers } = body

    if (!title) {
      return NextResponse.json({ error: '缺少标题' }, { status: 400 })
    }

    const download = await db.downloadTask.create({
      data: {
        title,
        size: size || null,
        magnetUrl: magnetUrl || null,
        torrentUrl: torrentUrl || null,
        infoHash: infoHash || null,
        mediaItemId: mediaItemId || null,
        episodeId: episodeId || null,
        indexerId: indexerId || null,
        clientId: clientId || null,
        quality: quality || null,
        resolution: resolution || null,
        codec: codec || null,
        source: source || null,
        group: group || null,
        hasChineseSub: hasChineseSub ?? false,
        seeders: seeders || null,
        leechers: leechers || null,
        status: 'pending',
        progress: 0,
      },
    })

    return NextResponse.json(download, { status: 201 })
  } catch (error) {
    console.error('Download create error:', error)
    return NextResponse.json({ error: '创建下载任务失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 })
    }

    await db.downloadTask.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Download delete error:', error)
    return NextResponse.json({ error: '删除下载任务失败' }, { status: 500 })
  }
}
