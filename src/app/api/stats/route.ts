import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const totalMedia = await db.mediaItem.count()
    const downloaded = await db.mediaItem.count({ where: { status: 'downloaded' } })
    const monitored = await db.mediaItem.count({ where: { monitored: true } })
    const totalMovies = await db.mediaItem.count({ where: { type: 'movie' } })
    const totalTvShows = await db.mediaItem.count({ where: { type: 'tv' } })
    const downloading = await db.downloadTask.count({ where: { status: 'downloading' } })
    const indexerCount = await db.indexer.count()
    const enabledIndexers = await db.indexer.count({ where: { enabled: true } })
    const subscriptionCount = await db.subscription.count()
    const activeSubscriptions = await db.subscription.count({ where: { enabled: true } })

    return NextResponse.json({
      totalMedia,
      downloaded,
      monitored,
      downloading,
      totalMovies,
      totalTvShows,
      indexerCount,
      enabledIndexers,
      subscriptionCount,
      activeSubscriptions,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: '获取统计数据失败' }, { status: 500 })
  }
}
