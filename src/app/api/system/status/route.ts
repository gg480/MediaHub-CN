import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/system/status — 系统健康状态
export async function GET() {
  try {
    const startTime = Date.now()

    // 1. 数据库连接检查
    let dbStatus: { status: string; latencyMs: number }
    try {
      const dbStart = Date.now()
      await db.$queryRaw`SELECT 1`
      dbStatus = { status: 'healthy', latencyMs: Date.now() - dbStart }
    } catch {
      dbStatus = { status: 'error', latencyMs: 0 }
    }

    // 2. 各模块统计数据
    const [
      mediaCount,
      downloadingCount,
      monitoredCount,
      indexerCount,
      enabledIndexerCount,
      activeSubscriptions,
      activeDownloads,
      notificationCount,
      nfoCount,
    ] = await Promise.all([
      db.mediaItem.count(),
      db.mediaItem.count({ where: { status: 'downloading' } }),
      db.mediaItem.count({ where: { monitored: true } }),
      db.indexer.count(),
      db.indexer.count({ where: { enabled: true } }),
      db.subscription.count({ where: { enabled: true } }),
      db.downloadTask.count({ where: { status: { in: ['downloading', 'queued', 'pending'] } } }),
      db.notification.count({ where: { enabled: true } }),
      db.nfoFile.count(),
    ])

    // 3. 下载客户端状态
    const clients = await db.downloadClient.findMany({
      where: { enabled: true },
      select: { id: true, name: true, type: true, host: true, testStatus: true, lastTestAt: true },
    })

    // 4. 索引器状态
    const indexers = await db.indexer.findMany({
      select: { id: true, name: true, enabled: true, testStatus: true, lastTestAt: true, lastSearchAt: true },
      orderBy: { priority: 'desc' },
    })

    // 5. 最近活动
    const recentDownloads = await db.downloadTask.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, progress: true, updatedAt: true },
    })

    const recentNfoScrapes = await db.nfoFile.findMany({
      orderBy: { lastScrapedAt: 'desc' },
      take: 5,
      select: { id: true, nfoType: true, scrapedFrom: true, lastScrapedAt: true, mediaItem: { select: { titleCn: true } } },
    })

    // 6. 系统运行时间
    const uptimeMs = process.uptime() * 1000
    const uptimeHours = Math.floor(uptimeMs / 3600000)
    const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000)

    // 7. 内存使用
    const memUsage = process.memoryUsage()
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
    const memRssMB = Math.round(memUsage.rss / 1024 / 1024)

    const totalLatency = Date.now() - startTime

    return NextResponse.json({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      responseTimeMs: totalLatency,
      uptime: {
        hours: uptimeHours,
        minutes: uptimeMinutes,
        formatted: `${uptimeHours}h ${uptimeMinutes}m`,
      },
      database: dbStatus,
      memory: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        usagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      stats: {
        mediaItems: mediaCount,
        downloading: downloadingCount,
        monitored: monitoredCount,
        activeDownloads,
        indexers: indexerCount,
        enabledIndexers: enabledIndexerCount,
        activeSubscriptions,
        notifications: notificationCount,
        nfoFiles: nfoCount,
      },
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        host: c.host,
        status: c.testStatus || 'untested',
        lastTestAt: c.lastTestAt,
      })),
      indexers: indexers.map((i) => ({
        id: i.id,
        name: i.name,
        enabled: i.enabled,
        status: i.testStatus || 'untested',
        lastTestAt: i.lastTestAt,
        lastSearchAt: i.lastSearchAt,
      })),
      recentActivity: {
        downloads: recentDownloads,
        nfoScrapes: recentNfoScrapes.map((n) => ({
          id: n.id,
          type: n.nfoType,
          source: n.scrapedFrom,
          mediaTitle: n.mediaItem?.titleCn || '未知',
          scrapedAt: n.lastScrapedAt,
        })),
      },
    })
  } catch (error) {
    console.error('系统状态检查失败:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: '系统状态检查失败',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
