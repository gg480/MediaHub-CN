# MediaHub-CN 开发工作日志

## 项目概述
MediaHub-CN — 集成 Radarr + Sonarr + Prowlarr 的中文影视自动化管理工具

## 开发进度追踪

---
Task ID: 0
Agent: Main Coordinator
Task: 项目状态审计与开发计划制定

Work Log:
- 审计了现有全部代码文件
- 前端8个页面组件已存在：Dashboard, Discover, Search, Library, Subscribe, Downloads, Indexers, Settings
- 后端API路由已存在但多为stub/mock实现
- Prisma schema完整定义了11个模型
- 识别了关键Bug：Dashboard useEffect误用、Indexer schema不匹配(useInternal字段)、缺失API路由

Stage Summary:
- 前端UI框架完成度约70%，需补充媒体详情页等
- 后端API完成度约30%，核心功能均为mock
- 需要实现的核心：TMDB真实API、Torznab搜索、qBittorrent下载、NFO生成、文件整理

---
Task ID: 3
Agent: TMDB API Integration Agent
Task: 实现真实 TMDB API 集成

Work Log:
- 重写了 `/api/scrape/search/route.ts` 为完整 TMDB 代理：
  - `GET /api/scrape/search?q=xxx` — 多类型搜索（multi-search），同时搜索电影和剧集
  - `GET /api/scrape/search?tmdbId=123&mediaType=movie` — 获取电影详情（含演职员、视频）
  - `GET /api/scrape/search?tmdbId=123&mediaType=tv` — 获取剧集详情（含季/集信息、演职员、视频）
  - 支持中英文语言参数（language: zh-CN / en-US）
  - 从数据库 Setting 表读取 `tmdb_api_key`，或从环境变量 `TMDB_API_KEY` 获取
  - 支持从数据库 Setting 表读取 `proxy_host` 代理配置
  - 10秒请求超时保护
  - 全中文错误消息

- 创建了 `/api/scrape/tmdb/route.ts` 用于附加 TMDB 操作：
  - `GET /api/scrape/tmdb?trending=movie` — 获取本周热门电影
  - `GET /api/scrape/tmdb?trending=tv` — 获取本周热门剧集
  - `GET /api/scrape/tmdb?popular=movie` — 获取流行电影
  - `GET /api/scrape/tmdb?popular=tv` — 获取流行剧集
  - 统一的响应格式，包含 label 字段标识中文分类名
  - 同样支持代理配置和超时保护

- 更新了 Discover 页面组件（`/src/components/discover.tsx`）：
  - 页面加载时自动显示4个横向滚动区域：热门电影、热门剧集、流行电影、流行剧集
  - 搜索时切换到搜索结果视图，清除搜索后返回默认推荐视图
  - 添加"返回"按钮从搜索模式回到推荐模式
  - 每个区域有独立的加载骨架屏和错误重试机制
  - 使用 TrendingUp 和 Flame 图标区分热门与流行内容
  - 修复了 react-hooks/immutability 和 react-hooks/refs lint 错误

- 代码质量检查：
  - 本任务涉及的3个文件均通过 lint 检查
  - 其他组件（downloads.tsx, library.tsx, subscribe.tsx）存在预先的 lint 问题，不在本任务范围内

Stage Summary:
- TMDB API 集成完成，搜索、详情、热门、流行4类接口全部实现
- Discover 页面默认展示热门/流行内容，搜索功能正常
- 所有 API 密钥仅服务端使用，不暴露到客户端
- 后端 API 完成度提升至约 50%

---
Task ID: 1
Agent: Cron Iteration Agent (Round 1)
Task: Bug修复 + NFO生成 + 媒体详情页

Work Log:
- 修复了3个 `react-hooks/set-state-in-effect` lint错误：
  - downloads.tsx: useEffect内联fetch+setInterval实现，避免直接调用setState函数
  - library.tsx: useEffect内联fetch实现，以filter为依赖
  - subscribe.tsx: useEffect内联fetch实现
  - media-detail.tsx: useEffect内联fetch实现
- 移除了 indexers.tsx 中不存在的 `useInternal` 字段
- 移除了 indexers API route 中的 `useInternal` 字段，补充了 enableRss/enableSearch/enableAuto/rateLimit 字段
- 创建了 `/api/indexers/[id]/test/route.ts` — 索引器连接测试API：
  - Torznab/Newznab: 测试caps端点，检查XML响应
  - Native PT: 测试站点连通性，通过Cookie检测登录状态
  - Cardigann: 基本连通性测试
  - 更新索引器的testStatus/testMessage/testResponseTime/lastTestAt字段
- 创建了 `/api/download-clients/[id]/test/route.ts` — 下载客户端连接测试：
  - qBittorrent: 测试WebUI API版本端点，支持认证登录
  - Transmission: 测试RPC端点（409=需要CSRF令牌但服务可达）
  - Deluge: 测试JSON RPC端点
  - 更新客户端的testStatus/testMessage/lastTestAt字段
- 创建了 `/api/download-clients/[id]/route.ts` — DELETE方法
- 实现了 `/api/scrape/nfo/route.ts` — NFO生成API：
  - GET: 读取本地数据生成NFO
  - POST: 从TMDB刮削元数据后生成NFO
  - 电影NFO: Kodi/Emby/极影视兼容XML格式（tmdbid/imdbid/评分/导演/演员/海报等）
  - 剧集NFO: tvshow格式（tmdbid/季集信息/状态等）
  - 支持doubanRating自定义字段
  - 自动保存NFO记录到数据库NfoFile表
- 实现了 `media-detail.tsx` 媒体详情页组件：
  - 全屏Dialog弹窗，带backdrop背景图+poster
  - 评分展示（TMDB+豆瓣双评分）
  - 4个Tab：简介、季集（仅剧集）、NFO预览、下载记录
  - "刮削元数据"按钮：调用TMDB API更新元数据+生成NFO
  - "生成NFO"按钮：使用本地数据生成NFO
  - "搜索下载"按钮：跳转到搜索页
  - NFO XML预览+复制功能
- 更新了store.ts添加selectedMediaId/setSelectedMediaId状态
- 更新了page.tsx引入MediaDetail全局弹窗
- 更新了library.tsx点击卡片打开详情弹窗
- 所有代码通过bun run lint检查（0 errors, 0 warnings）

Stage Summary:
- Lint从3 errors降为0 errors
- 索引器测试和下载客户端测试API全部实现
- NFO生成功能完整（电影+剧集，Kodi/Emby/极影视兼容）
- 媒体详情页功能完整（刮削、NFO预览、季集管理）
- 整体完成度提升至约65%

---
Task ID: 2
Agent: Cron Iteration Agent (Round 2)
Task: 下载集成 + 订阅自动搜索 + 文件整理

Work Log:
- 审计了现有代码状态：dev server 正常运行，lint 0 errors
- 搜索引擎API已在Round 1中完整实现（Torznab跨索引器查询+评分+去重）
- 本次聚焦3个核心功能模块：

### 1. 下载客户端集成（qBittorrent/Transmission）
- 创建 `/api/downloads/[id]/route.ts` — 下载任务CRUD：
  - GET: 获取单个下载任务详情（含关联的mediaItem/indexer/client）
  - PUT: 更新下载任务状态/进度/速度，自动设置startedAt/completedAt时间戳
  - DELETE: 删除任务，同时尝试从下载客户端删除种子
- 创建 `/api/downloads/action/send/route.ts` — 发送到下载客户端：
  - qBittorrent: 完整认证流程 + 磁力链接/种子文件上传双模式
  - Transmission: CSRF Session ID 管理 + RPC认证 + torrent-add调用
  - 自动选择分类和保存路径（根据mediaType区分电影/剧集目录）
  - 自动更新DownloadTask状态为downloading
  - 重复种子检测（qBittorrent Fails / Transmission torrent-duplicate）
- 创建 `/api/downloads/action/sync/route.ts` — 下载进度同步：
  - 从qBittorrent获取种子列表（progress/dlspeed/upspeed/seeders/state）
  - 从Transmission获取种子列表（percentDone/rateDownload/rateUpload/status）
  - 自动更新数据库中的进度、速度、做种数
  - 完成时自动更新MediaItem状态为downloaded
  - 超时任务自动标记为failed（5分钟未发送）
- 更新 `search-page.tsx` — 点击"下载"后自动发送到下载客户端：
  - Step 1: 创建DownloadTask记录
  - Step 2: 自动调用 /api/downloads/action/send 发送到客户端
  - 显示详细的成功/失败toast消息
- 更新 `downloads.tsx` — 实时进度同步：
  - 每15秒自动调用 /api/downloads/action/sync 同步进度
  - 每5秒刷新下载列表
  - 修复deleteTask API路径为 `/api/downloads/${id}`

### 2. 订阅自动搜索
- 重写 `/api/subscriptions/check/route.ts` — 真实订阅检查实现：
  - 从订阅获取关键词，支持中文名自动转英文名搜索
  - 跨索引器搜索（复用搜索引擎逻辑）
  - 评分过滤（score >= 30的最低质量门槛）
  - 自动下载最佳结果（autoDownload启用时）
  - 重复检测（避免重复下载相同种子）
  - 速率限制检查（遵守rssInterval间隔）
  - 返回top 5搜索结果概览

### 3. 文件整理模块
- 创建 `/api/organize/route.ts` — 媒体文件自动整理：
  - POST: 执行文件整理（支持hardlink/move/copy/dryrun四种模式）
  - GET: 获取整理设置
  - PUT: 更新整理设置
  - 硬链接优先策略（跨文件系统自动降级为复制）
  - 智能媒体类型检测（从标题识别电影/剧集）
  - 自动构建标准目录结构：电影 `Title (Year)/`，剧集 `Title/Season XX/`
  - 字幕文件自动跟随整理
  - 自动跳过sample文件（< 50MB）
  - 完成后更新DownloadTask状态为imported，MediaItem状态为organized

Stage Summary:
- 下载客户端集成完整（qBittorrent + Transmission 双客户端支持）
- 下载流程闭环：搜索 → 创建任务 → 自动发送到客户端 → 实时进度同步 → 完成状态更新
- 订阅自动搜索可用（关键词搜索 + 质量评分 + 自动下载）
- 文件整理模块可用（硬链接优先 + 智能命名 + 字幕跟随）
- 整体完成度提升至约80%
- 下一步优先级：豆瓣刮削、通知推送、完善Settings页面
