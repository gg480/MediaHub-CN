// ============================================
// MediaHub-CN 数据库种子数据
// 运行: bun run prisma/seed.ts
// ============================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始填充种子数据...\n')

  // 1. 系统设置
  console.log('  [1/5] 初始化系统设置...')
  const settings = [
    { key: 'tmdb_api_key', value: '' },
    { key: 'default_quality_profile', value: 'any' },
    { key: 'default_download_path', value: '/downloads' },
    { key: 'auto_search', value: 'true' },
    { key: 'auto_download', value: 'false' },
    { key: 'indexer_sync_interval', value: '60' },
    { key: 'douban_cookie', value: '' },
    { key: 'proxy_host', value: '' },
    { key: 'movie_library_path', value: '/media/movies' },
    { key: 'tv_library_path', value: '/media/tv' },
    { key: 'organize_mode', value: 'hardlink' },
    { key: 'movie_naming_pattern', value: '{title} ({year})/{title} ({year})' },
    { key: 'tv_naming_pattern', value: '{title}/Season {season}/{title} - S{season:02d}E{episode:02d}' },
    { key: 'rss_check_enabled', value: 'true' },
    { key: 'rss_check_interval', value: '30' },
    { key: 'download_sync_enabled', value: 'true' },
    { key: 'download_sync_interval', value: '5' },
    { key: 'auto_organize_enabled', value: 'false' },
    { key: 'auto_organize_interval', value: '60' },
    { key: 'health_check_enabled', value: 'true' },
    { key: 'health_check_interval', value: '10' },
  ]
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: s,
      update: { value: s.value },
    })
  }
  console.log(`    已创建 ${settings.length} 个系统设置`)

  // 2. 示例索引器模板
  console.log('  [2/5] 添加示例索引器...')
  const indexerTemplates = [
    { name: '馒头 M-Team', type: 'torznab', host: 'kp.m-team.cc', scheme: 'https', port: 443, baseUrl: '/api/torznab', apiKey: '', categories: '401,402,404', priority: 30, enableRss: true, enableSearch: true, enableAuto: true, rateLimit: 15, vip: false, tags: 'PT,高清' },
    { name: 'HDSky', type: 'torznab', host: 'hdsky.me', scheme: 'https', port: 443, baseUrl: '/api/torznab', apiKey: '', categories: '401,402,404', priority: 25, enableRss: true, enableSearch: true, enableAuto: true, rateLimit: 10, vip: false, tags: 'PT,高清' },
    { name: 'CHDBits', type: 'native_pt', host: 'chdbits.co', scheme: 'https', port: 443, searchPath: '/torrents.php', apiKey: '', categories: '401,402', priority: 25, enableRss: true, enableSearch: true, enableAuto: false, rateLimit: 20, vip: false, tags: 'PT,经典' },
    { name: '观众 Audiences', type: 'native_pt', host: 'audiences.me', scheme: 'https', port: 443, searchPath: '/torrents.php', apiKey: '', categories: '401,402', priority: 25, enableRss: true, enableSearch: true, enableAuto: false, rateLimit: 15, vip: false, tags: 'PT,综合' },
    { name: 'TTG', type: 'native_pt', host: 'totheglory.im', scheme: 'https', port: 443, searchPath: '/browse.php', apiKey: '', categories: '401,402', priority: 20, enableRss: true, enableSearch: true, enableAuto: false, rateLimit: 30, vip: false, tags: 'PT,综合' },
    { name: 'OpenCD', type: 'native_pt', host: 'open.cd', scheme: 'https', port: 443, searchPath: '/torrents.php', apiKey: '', categories: '401,402', priority: 20, enableRss: true, enableSearch: true, enableAuto: false, rateLimit: 15, vip: false, tags: 'PT,音乐,综艺' },
    { name: 'JPTV', type: 'native_pt', host: 'jpst.it', scheme: 'https', port: 443, searchPath: '/torrents.php', apiKey: '', categories: '401,402,403', priority: 15, enableRss: true, enableSearch: true, enableAuto: false, rateLimit: 20, vip: false, tags: 'PT,日剧' },
  ]
  for (const tpl of indexerTemplates) {
    const existing = await prisma.indexer.findFirst({ where: { name: tpl.name } })
    if (!existing) {
      await prisma.indexer.create({ data: { ...tpl, enabled: false } })
      console.log(`    添加索引器: ${tpl.name}`)
    } else {
      console.log(`    跳过（已存在）: ${tpl.name}`)
    }
  }

  // 3. 示例下载客户端模板
  console.log('  [3/5] 添加示例下载客户端...')
  const clientTemplates = [
    { name: 'qBittorrent', type: 'qbittorrent', host: 'localhost', port: 8080, username: 'admin', password: '', directory: '/downloads', category: '', movieCategory: 'movies', tvCategory: 'tv', priority: 1 },
    { name: 'Transmission', type: 'transmission', host: 'localhost', port: 9091, username: '', password: '', directory: '/downloads', category: '', movieCategory: 'movies', tvCategory: 'tv', priority: 2 },
  ]
  for (const tpl of clientTemplates) {
    const existing = await prisma.downloadClient.findFirst({ where: { name: tpl.name } })
    if (!existing) {
      await prisma.downloadClient.create({ data: { ...tpl, enabled: false } })
      console.log(`    添加客户端: ${tpl.name}`)
    } else {
      console.log(`    跳过（已存在）: ${tpl.name}`)
    }
  }

  // 4. 示例订阅
  console.log('  [4/5] 添加示例订阅...')
  const subscriptionTemplates = [
    { type: 'movie', source: 'tmdb', keyword: '沙丘', qualityProfile: '4k', autoSearch: true, autoDownload: false, rssInterval: 30 },
    { type: 'tv', source: 'tmdb', keyword: '三体', qualityProfile: '1080p', autoSearch: true, autoDownload: false, rssInterval: 30 },
    { type: 'movie', source: 'douban', keyword: '奥本海默', qualityProfile: 'any', autoSearch: true, autoDownload: false, rssInterval: 60 },
  ]
  for (const tpl of subscriptionTemplates) {
    const existing = await prisma.subscription.findFirst({ where: { keyword: tpl.keyword } })
    if (!existing) {
      await prisma.subscription.create({ data: { ...tpl, enabled: false } })
      console.log(`    添加订阅: ${tpl.keyword}`)
    } else {
      console.log(`    跳过（已存在）: ${tpl.keyword}`)
    }
  }

  // 5. 统计
  console.log('  [5/5] 统计数据...')
  const stats = {
    mediaItems: await prisma.mediaItem.count(),
    indexers: await prisma.indexer.count(),
    clients: await prisma.downloadClient.count(),
    subscriptions: await prisma.subscription.count(),
    downloads: await prisma.downloadTask.count(),
  }
  console.log(`    媒体库: ${stats.mediaItems} | 索引器: ${stats.indexers} | 客户端: ${stats.clients} | 订阅: ${stats.subscriptions} | 下载: ${stats.downloads}`)

  console.log('\n✅ 种子数据填充完成！')
  console.log('提示: 索引器和下载客户端默认禁用，请在设置页面配置后启用')
}

main()
  .catch((e) => {
    console.error('种子数据填充失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
