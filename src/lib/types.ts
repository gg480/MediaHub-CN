// ============================================
// MediaHub-CN 类型定义
// ============================================

export interface MediaItem {
  id: string
  type: 'movie' | 'tv'
  titleCn: string
  titleEn?: string
  originalTitle?: string
  year?: number
  tmdbId?: number
  imdbId?: string
  doubanId?: string
  overviewCn?: string
  overviewEn?: string
  posterPath?: string
  backdropPath?: string
  posterUrl?: string
  backdropUrl?: string
  doubanRating?: number
  tmdbRating?: number
  status: 'wanted' | 'downloading' | 'downloaded' | 'organized' | 'missing'
  monitored: boolean
  qualityProfile?: string
  rootFolder?: string
  tags?: string
  lastSearchAt?: string
  addedAt: string
  createdAt: string
  updatedAt: string
  seasons?: Season[]
  downloads?: DownloadTask[]
}

export interface Season {
  id: string
  mediaItemId: string
  seasonNumber: number
  title?: string
  overview?: string
  monitored: boolean
  createdAt: string
  updatedAt: string
  episodes?: Episode[]
}

export interface Episode {
  id: string
  seasonId: string
  episodeNumber: number
  titleCn?: string
  titleEn?: string
  overview?: string
  airDate?: string
  status: 'wanted' | 'downloading' | 'downloaded' | 'organized' | 'missing'
  filePath?: string
  runtime?: number
  thumbnailPath?: string
  createdAt: string
  updatedAt: string
  downloads?: DownloadTask[]
}

export interface Indexer {
  id: string
  name: string
  enabled: boolean
  type: 'torznab' | 'newznab' | 'native_pt' | 'cardigann'
  protocol: 'torrent' | 'nzb'
  scheme: string
  host: string
  port?: number
  baseUrl?: string
  apiKey?: string
  uid?: string
  passkey?: string
  cookie?: string
  categories?: string
  searchPath?: string
  detailsPath?: string
  cardigannYml?: string
  vip: boolean
  priority: number
  tags?: string
  enableRss: boolean
  enableSearch: boolean
  enableAuto: boolean
  rateLimit: number
  testStatus?: 'success' | 'fail' | null
  testMessage?: string
  testResponseTime?: number
  lastTestAt?: string
  lastSearchAt?: string
  createdAt: string
  updatedAt: string
}

export interface DownloadClient {
  id: string
  name: string
  enabled: boolean
  type: 'qbittorrent' | 'transmission' | 'deluge'
  host: string
  port: number
  username?: string
  password?: string
  baseUrl?: string
  category?: string
  directory?: string
  tvCategory?: string
  movieCategory?: string
  tvDirectory?: string
  movieDirectory?: string
  priority: number
  testStatus?: 'success' | 'fail' | null
  testMessage?: string
  lastTestAt?: string
  createdAt: string
  updatedAt: string
}

export interface DownloadTask {
  id: string
  mediaItemId?: string
  episodeId?: string
  indexerId?: string
  clientId?: string
  mediaItem?: MediaItem
  indexer?: Pick<Indexer, 'id' | 'name'>
  client?: Pick<DownloadClient, 'id' | 'name' | 'type'>
  title: string
  size?: number
  magnetUrl?: string
  torrentUrl?: string
  infoHash?: string
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'imported' | 'queued'
  progress: number
  downloadSpeed?: number
  uploadSpeed?: number
  seeders?: number
  leechers?: number
  grabs?: number
  outputPath?: string
  quality?: string
  resolution?: string
  codec?: string
  source?: string
  audioCodec?: string
  group?: string
  hasChineseSub: boolean
  errorMessage?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface SearchResult {
  title: string
  size: number
  seeders: number
  leechers: number
  grabs: number
  publishDate: string
  indexerName: string
  indexerId?: string
  magnetUrl?: string
  torrentUrl?: string
  infoHash?: string
  quality?: string
  resolution?: string
  codec?: string
  source?: string
  audioCodec?: string
  group?: string
  category?: string
  hasChineseSub?: boolean
  imdbId?: string
  tmdbId?: number
}

export interface TmdbSearchResult {
  id: number
  title?: string
  name?: string
  overview?: string
  posterPath?: string
  backdropPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage: number
  mediaType: 'movie' | 'tv'
  genreIds?: number[]
  popularity?: number
}

export interface Subscription {
  id: string
  type: 'movie' | 'tv' | 'douban' | 'rss'
  source?: string
  keyword?: string
  tmdbId?: number
  doubanId?: string
  mediaItemId?: string
  qualityProfile?: string
  enabled: boolean
  autoSearch: boolean
  autoDownload: boolean
  rssUrl?: string
  rssInterval: number
  lastCheckAt?: string
  createdAt: string
  updatedAt: string
}

export interface Notification {
  id: string
  name: string
  type: 'wechat' | 'webhook' | 'telegram' | 'bark'
  enabled: boolean
  config: string
  events: string
  createdAt: string
  updatedAt: string
}

export interface Stats {
  totalMedia: number
  totalMovies: number
  totalTvShows: number
  downloaded: number
  downloading: number
  monitored: number
  indexerCount: number
  enabledIndexers: number
  subscriptionCount: number
  activeSubscriptions: number
}

export const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  wanted: { label: '想看', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  downloading: { label: '下载中', color: 'text-sky-700', bgColor: 'bg-sky-100' },
  downloaded: { label: '已下载', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  organized: { label: '已整理', color: 'text-violet-700', bgColor: 'bg-violet-100' },
  missing: { label: '缺失', color: 'text-red-700', bgColor: 'bg-red-100' },
  monitored: { label: '监控中', color: 'text-teal-700', bgColor: 'bg-teal-100' },
  pending: { label: '等待中', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  queued: { label: '排队中', color: 'text-sky-700', bgColor: 'bg-sky-100' },
  completed: { label: '已完成', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  failed: { label: '失败', color: 'text-red-700', bgColor: 'bg-red-100' },
  imported: { label: '已导入', color: 'text-violet-700', bgColor: 'bg-violet-100' },
}

// 中文PT站点模板
export const INDEXER_TEMPLATES = [
  { name: '馒头 M-Team', host: 'kp.m-team.cc', scheme: 'https', type: 'native_pt' as const, searchPath: '/api/torrent/search', categories: '401,402,404', priority: 30 },
  { name: 'HDSky', host: 'hdsky.me', scheme: 'https', type: 'torznab' as const, searchPath: '/api/torznab', categories: '401,402,404', priority: 25 },
  { name: 'CHDBits', host: 'chdbits.co', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 25 },
  { name: '观众 Audiences', host: 'audiences.me', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 25 },
  { name: 'TTG', host: 'totheglory.im', scheme: 'https', type: 'native_pt' as const, searchPath: '/browse.php', categories: '401,402', priority: 20 },
  { name: '草莓 PT', host: 'ptcafe.club', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 20 },
  { name: '北洋园 PT', host: 'pt.tju.edu.cn', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 15 },
  { name: 'OpenCD', host: 'open.cd', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 20 },
  { name: 'NJPT', host: 'njpt.bitpt.cn', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 15 },
  { name: '烧包 PT', host: 'ptsbao.club', scheme: 'https', type: 'native_pt' as const, searchPath: '/torrents.php', categories: '401,402', priority: 15 },
]

// TMDB 图片URL
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

export function getPosterUrl(path?: string | null, size = 'w500'): string {
  if (!path) return ''
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export function getBackdropUrl(path?: string | null, size = 'w1280'): string {
  if (!path) return ''
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

// 格式化文件大小
export function formatSize(bytes?: number | null): string {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

// 格式化速度
export function formatSpeed(bytesPerSec?: number | null): string {
  if (!bytesPerSec) return '-'
  return `${formatSize(bytesPerSec)}/s`
}

// 解析种子名中的质量信息
export function parseReleaseQuality(title: string): { quality?: string; resolution?: string; codec?: string; source?: string; group?: string; hasChineseSub?: boolean } {
  const result: { quality?: string; resolution?: string; codec?: string; source?: string; group?: string; hasChineseSub?: boolean } = {}

  // 分辨率
  if (/2160p|4K|UHD/i.test(title)) result.resolution = '2160p'
  else if (/1080p|FHD/i.test(title)) result.resolution = '1080p'
  else if (/1080i/i.test(title)) result.resolution = '1080i'
  else if (/720p|HD/i.test(title)) result.resolution = '720p'
  else if (/480p|SD/i.test(title)) result.resolution = '480p'

  // 编码
  if (/H\.?265|x265|HEVC/i.test(title)) result.codec = 'H265'
  else if (/H\.?264|x264|AVC/i.test(title)) result.codec = 'H264'
  else if (/AV1/i.test(title)) result.codec = 'AV1'

  // 来源
  if (/Remux/i.test(title)) result.source = 'Remux'
  else if (/BluRay|BLURAY|BDRip|BDR/i.test(title)) result.source = 'BluRay'
  else if (/WEB-?DL|WEBRip/i.test(title)) result.source = 'WebDL'
  else if (/HDTV|HDTVRip/i.test(title)) result.source = 'HDTV'
  else if (/DVDRip|DVD/i.test(title)) result.source = 'DVD'

  // 质量
  if (result.resolution === '2160p' && result.source === 'Remux') result.quality = '4K Remux'
  else if (result.resolution === '2160p') result.quality = '4K'
  else if (result.resolution === '1080p' && result.source === 'Remux') result.quality = '1080P Remux'
  else if (result.resolution === '1080p') result.quality = '1080P'
  else if (result.resolution === '720p') result.quality = '720P'

  // 中文字幕
  result.hasChineseSub = /[简繁]体|中文|双语|GB|BIG5|简日|繁日|简繁|CH[ST]|字幕组|Sub|中字/i.test(title)

  // 发布组
  const groupMatch = title.match(/-([A-Za-z0-9_.]+)(?:\.\w+)?$/)
  if (groupMatch) result.group = groupMatch[1]
  // 中文字幕组
  const cnGroupMatch = title.match(/\[([^\]]+)\]/)
  if (cnGroupMatch && !result.group) result.group = cnGroupMatch[1]

  return result
}
