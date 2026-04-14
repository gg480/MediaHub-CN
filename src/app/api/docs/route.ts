import { NextResponse } from 'next/server'

// GET /api/docs — API 文档
export async function GET() {
  const docs = {
    name: 'MediaHub-CN API',
    version: '1.0.0',
    description: '中文影视自动化管理工具 API 接口文档',
    baseUrl: '/api',
    timestamp: new Date().toISOString(),

    endpoints: [
      // === 仪表盘 ===
      {
        method: 'GET',
        path: '/api/stats',
        description: '获取仪表盘统计数据',
        params: [],
        response: '{ totalMedia, totalMovies, totalTvShows, downloaded, downloading, monitored, indexerCount, enabledIndexers, subscriptionCount, activeSubscriptions }',
      },

      // === 媒体库 ===
      {
        method: 'GET',
        path: '/api/media',
        description: '获取媒体库列表（分页、筛选）',
        params: ['page?: number', 'limit?: number', 'type?: movie|tv', 'status?: wanted|downloading|downloaded|organized', 'search?: string'],
        response: '{ items: MediaItem[], total: number, page: number, limit: number }',
      },
      {
        method: 'POST',
        path: '/api/media',
        description: '添加新媒体到库',
        params: ['body: { type, titleCn, titleEn?, tmdbId?, qualityProfile?, rootFolder? }'],
        response: 'MediaItem',
      },
      {
        method: 'GET',
        path: '/api/media/[id]',
        description: '获取单个媒体详情（含季集信息）',
        params: ['id: string'],
        response: 'MediaItem (含 seasons.episodes)',
      },
      {
        method: 'PUT',
        path: '/api/media/[id]',
        description: '更新媒体信息',
        params: ['id: string', 'body: { titleCn?, monitored?, status?, qualityProfile? }'],
        response: 'MediaItem',
      },
      {
        method: 'DELETE',
        path: '/api/media/[id]',
        description: '从库中删除媒体',
        params: ['id: string'],
        response: '{ success: true }',
      },

      // === 搜索 ===
      {
        method: 'GET',
        path: '/api/search',
        description: '跨索引器搜索资源',
        params: ['q: string (搜索关键词)', 'type?: movie|tv', 'indexerId?: string', 'limit?: number'],
        response: '{ results: SearchResult[], total: number, indexers: number }',
      },

      // === 刮削 ===
      {
        method: 'GET',
        path: '/api/scrape/search',
        description: 'TMDB 搜索/详情代理',
        params: ['q?: string (关键词)', 'tmdbId?: number', 'mediaType?: movie|tv', 'language?: zh-CN|en-US'],
        response: 'TMDB 搜索结果或详情',
      },
      {
        method: 'GET',
        path: '/api/scrape/tmdb',
        description: 'TMDB 热门/流行数据',
        params: ['trending?: movie|tv', 'popular?: movie|tv'],
        response: '{ items: TmdbResult[], label: string }',
      },
      {
        method: 'GET',
        path: '/api/scrape/douban',
        description: '豆瓣搜索/详情',
        params: ['q?: string (关键词)', 'id?: string (豆瓣ID)', 'mediaItemId?: string (自动刮削保存)'],
        response: '豆瓣搜索结果或详情',
      },
      {
        method: 'POST',
        path: '/api/scrape/douban',
        description: '豆瓣刮削并保存到媒体项',
        params: ['body: { mediaItemId: string }'],
        response: '{ success: true, doubanId, doubanRating }',
      },
      {
        method: 'GET',
        path: '/api/scrape/nfo',
        description: '生成 NFO 文件',
        params: ['mediaItemId?: string'],
        response: '{ nfoContent: string, mediaTitle: string }',
      },
      {
        method: 'POST',
        path: '/api/scrape/nfo',
        description: '从TMDB刮削后生成NFO',
        params: ['body: { mediaItemId: string, scrapeFrom?: tmdb|local }'],
        response: '{ success: true, nfoId: string }',
      },

      // === 下载 ===
      {
        method: 'GET',
        path: '/api/downloads',
        description: '获取下载任务列表',
        params: ['page?: number', 'limit?: number', 'status?: pending|downloading|completed|failed'],
        response: '{ items: DownloadTask[], total: number }',
      },
      {
        method: 'POST',
        path: '/api/downloads',
        description: '创建下载任务',
        params: ['body: { title, magnetUrl?, torrentUrl?, size?, mediaItemId?, indexerId?, clientId? }'],
        response: 'DownloadTask',
      },
      {
        method: 'GET',
        path: '/api/downloads/[id]',
        description: '获取单个下载任务详情',
        params: ['id: string'],
        response: 'DownloadTask (含 mediaItem, indexer, client)',
      },
      {
        method: 'DELETE',
        path: '/api/downloads/[id]',
        description: '删除下载任务',
        params: ['id: string'],
        response: '{ success: true }',
      },
      {
        method: 'POST',
        path: '/api/downloads/action/send',
        description: '发送种子到下载客户端',
        params: ['body: { downloadId: string, clientId?: string }'],
        response: '{ success: true, clientName: string }',
      },
      {
        method: 'POST',
        path: '/api/downloads/action/sync',
        description: '从下载客户端同步进度',
        params: [],
        response: '{ synced: number, failed: number, clients: number }',
      },

      // === 索引器 ===
      {
        method: 'GET',
        path: '/api/indexers',
        description: '获取索引器列表',
        params: ['page?: number', 'limit?: number'],
        response: '{ items: Indexer[], total: number }',
      },
      {
        method: 'POST',
        path: '/api/indexers',
        description: '添加索引器',
        params: ['body: { name, type, host, port?, apiKey?, categories?, ... }'],
        response: 'Indexer',
      },
      {
        method: 'PUT',
        path: '/api/indexers/[id]',
        description: '更新索引器配置',
        params: ['id: string', 'body: { ...Indexer }'],
        response: 'Indexer',
      },
      {
        method: 'DELETE',
        path: '/api/indexers/[id]',
        description: '删除索引器',
        params: ['id: string'],
        response: '{ success: true }',
      },
      {
        method: 'POST',
        path: '/api/indexers/[id]/test',
        description: '测试索引器连接',
        params: ['id: string'],
        response: '{ success: boolean, message: string, responseTime: number }',
      },

      // === 下载客户端 ===
      {
        method: 'GET',
        path: '/api/download-clients',
        description: '获取下载客户端列表',
        params: [],
        response: 'DownloadClient[]',
      },
      {
        method: 'POST',
        path: '/api/download-clients',
        description: '添加下载客户端',
        params: ['body: { name, type, host, port, username?, password?, ... }'],
        response: 'DownloadClient',
      },
      {
        method: 'DELETE',
        path: '/api/download-clients/[id]',
        description: '删除下载客户端',
        params: ['id: string'],
        response: '{ success: true }',
      },
      {
        method: 'POST',
        path: '/api/download-clients/[id]/test',
        description: '测试下载客户端连接',
        params: ['id: string'],
        response: '{ success: boolean, message: string }',
      },

      // === 订阅 ===
      {
        method: 'GET',
        path: '/api/subscriptions',
        description: '获取订阅列表',
        params: ['page?: number', 'limit?: number'],
        response: '{ items: Subscription[], total: number }',
      },
      {
        method: 'POST',
        path: '/api/subscriptions',
        description: '创建订阅',
        params: ['body: { type, keyword?, tmdbId?, doubanId?, qualityProfile?, autoSearch?, autoDownload? }'],
        response: 'Subscription',
      },
      {
        method: 'DELETE',
        path: '/api/subscriptions/[id]',
        description: '删除订阅',
        params: ['id: string'],
        response: '{ success: true }',
      },
      {
        method: 'POST',
        path: '/api/subscriptions/check',
        description: '执行订阅检查（自动搜索匹配资源）',
        params: ['body: { checkAll?: boolean, subscriptionId?: string }'],
        response: '{ checked: number, matched: number, downloaded: number, results: [...] }',
      },

      // === 文件整理 ===
      {
        method: 'POST',
        path: '/api/organize',
        description: '执行文件整理',
        params: ['body: { mediaItemId?, downloadTaskId?, mode?: hardlink|move|copy|dryrun }'],
        response: '{ success: true, organized: number, total: number, results: [...] }',
      },
      {
        method: 'GET',
        path: '/api/organize',
        description: '获取文件整理设置',
        params: [],
        response: '{ movieLibraryPath, tvLibraryPath, organizeMode }',
      },
      {
        method: 'PUT',
        path: '/api/organize',
        description: '更新文件整理设置',
        params: ['body: { movieLibraryPath?, tvLibraryPath?, organizeMode? }'],
        response: '{ success: true }',
      },

      // === 通知 ===
      {
        method: 'GET',
        path: '/api/notifications',
        description: '获取通知渠道列表',
        params: [],
        response: 'Notification[]',
      },
      {
        method: 'POST',
        path: '/api/notifications',
        description: '创建通知渠道',
        params: ['body: { name, type: wechat|webhook|telegram|bark, config, events }'],
        response: 'Notification',
      },
      {
        method: 'PUT',
        path: '/api/notifications/[id]',
        description: '更新通知渠道',
        params: ['id: string', 'body: { name?, enabled?, config?, events? }'],
        response: 'Notification',
      },
      {
        method: 'DELETE',
        path: '/api/notifications/[id]',
        description: '删除通知渠道',
        params: ['id: string'],
        response: '{ success: true }',
      },
      {
        method: 'POST',
        path: '/api/notifications/[id]/test',
        description: '测试通知渠道',
        params: ['id: string'],
        response: '{ success: boolean, message: string }',
      },
      {
        method: 'POST',
        path: '/api/notifications/action/send',
        description: '触发事件通知（按事件名分发到所有匹配渠道）',
        params: ['body: { event: string, body: string, mediaTitle?, title? }'],
        response: '{ event, dispatched, success, failed, results }',
      },

      // === 系统 ===
      {
        method: 'GET',
        path: '/api/system/status',
        description: '系统健康状态',
        params: [],
        response: '{ status, version, uptime, database, memory, stats, clients, indexers, recentActivity }',
      },
      {
        method: 'GET',
        path: '/api/system/tasks',
        description: '获取定时任务列表',
        params: [],
        response: 'ScheduledTask[]',
      },
      {
        method: 'PUT',
        path: '/api/system/tasks',
        description: '更新定时任务配置',
        params: ['body: { taskId: string, enabled?, intervalMinutes? }'],
        response: '{ success: true, taskId, config }',
      },
      {
        method: 'POST',
        path: '/api/system/tasks',
        description: '手动执行定时任务',
        params: ['body: { taskId: string }'],
        response: '{ success: true, taskId, result }',
      },

      // === 设置 ===
      {
        method: 'GET',
        path: '/api/settings',
        description: '获取所有系统设置',
        params: [],
        response: 'Setting[]',
      },
      {
        method: 'PUT',
        path: '/api/settings',
        description: '批量更新系统设置',
        params: ['body: { tmdb_api_key?, proxy_host?, auto_search?, ... }'],
        response: '{ success: true }',
      },
    ],

    // 事件类型（通知用）
    events: {
      download_start: '下载任务开始',
      download_complete: '下载任务完成',
      download_fail: '下载任务失败',
      organize_complete: '文件整理完成',
      organize_fail: '文件整理失败',
      new_media: '新媒体入库',
      search_fail: '搜索失败',
      health_alert: '系统异常告警',
      '*': '接收所有事件',
    },

    // 通知渠道类型
    notificationTypes: [
      { type: 'webhook', description: '通用 Webhook', requiredConfig: ['webhook_url'] },
      { type: 'wechat', description: '企业微信', requiredConfig: ['corp_id', 'agent_id', 'secret'] },
      { type: 'telegram', description: 'Telegram Bot', requiredConfig: ['bot_token', 'chat_id'] },
      { type: 'bark', description: 'Bark (iOS)', requiredConfig: ['server_url', 'device_key'] },
    ],

    // 索引器类型
    indexerTypes: [
      { type: 'torznab', description: 'Torznab/Newznab 标准 API' },
      { type: 'newznab', description: 'Newznab 标准 API' },
      { type: 'native_pt', description: 'PT 站点原生接口' },
      { type: 'cardigann', description: 'Cardigann 定义引擎' },
    ],

    // 下载客户端类型
    downloadClientTypes: [
      { type: 'qbittorrent', description: 'qBittorrent', defaultPort: 8080 },
      { type: 'transmission', description: 'Transmission', defaultPort: 9091 },
      { type: 'deluge', description: 'Deluge', defaultPort: 8112 },
    ],
  }

  return NextResponse.json(docs)
}
