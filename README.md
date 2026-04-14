# MediaHub-CN

集成 Radarr + Sonarr + Prowlarr 的中文影视自动化管理工具，专为极空间 NAS 等 Docker 环境优化。

## 功能特性

- **搜索聚合**：跨索引器搜索（Torznab/Newznab/PT 站点），质量评分自动排序
- **自动下载**：qBittorrent / Transmission 双客户端支持，一键推送种子
- **媒体管理**：TMDB + 豆瓣双源元数据刮削，Kodi/Emby/极影视兼容 NFO 生成
- **智能整理**：硬链接优先文件整理，自动构建标准目录结构
- **订阅监控**：关键词订阅，定时自动搜索匹配资源
- **通知推送**：支持企业微信 / Telegram / Bark / Webhook
- **系统监控**：实时健康状态面板，定时任务管理

## 快速部署

### Docker Compose（推荐）

```bash
# 克隆仓库
git clone https://github.com/gg480/MediaHub-CN.git
cd MediaHub-CN

# 复制环境变量
cp .env.example .env
# 编辑 .env 配置 TMDB API Key 等

# 启动
docker compose up -d

# 初始化种子数据
docker compose exec mediahub-cn bun run prisma/seed.ts
```

访问 `http://你的IP:3000` 进入管理界面。

### 手动开发

```bash
# 安装依赖
bun install

# 初始化数据库
bun run db:push

# 填充种子数据（可选）
bun run prisma/seed.ts

# 启动开发服务
bun run dev
```

## 配置说明

首次使用请按以下顺序配置：

1. **设置页面** → 填写 TMDB API Key（[免费申请](https://www.themoviedb.org/settings/api)）
2. **索引器页面** → 添加 PT 站点索引器（支持 Torznab 标准和原生 PT 站点）
3. **下载客户端** → 添加 qBittorrent 或 Transmission 连接信息
4. **订阅页面** → 添加想看的影视订阅，开启自动搜索

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| 后端 | Next.js API Routes, Prisma ORM, SQLite |
| 部署 | Docker, Docker Compose |

## 目录结构

```
src/
├── app/
│   ├── api/              # API 路由
│   │   ├── docs/         # API 文档
│   │   ├── downloads/    # 下载管理
│   │   ├── indexers/     # 索引器管理
│   │   ├── media/        # 媒体库
│   │   ├── notifications/# 通知推送
│   │   ├── organize/     # 文件整理
│   │   ├── scrape/       # 刮削（TMDB/豆瓣/NFO）
│   │   ├── search/       # 搜索引擎
│   │   ├── settings/     # 系统设置
│   │   ├── subscriptions/# 订阅管理
│   │   └── system/       # 系统状态/定时任务
│   ├── layout.tsx
│   └── page.tsx
├── components/           # 页面组件
│   ├── dashboard.tsx
│   ├── discover.tsx
│   ├── search-page.tsx
│   ├── library.tsx
│   ├── downloads.tsx
│   ├── subscribe.tsx
│   ├── indexers.tsx
│   ├── settings.tsx
│   └── media-detail.tsx
├── hooks/                # 自定义 Hooks
└── lib/                  # 工具库
    ├── db.ts             # Prisma 数据库
    ├── store.ts          # Zustand 状态
    ├── types.ts          # TypeScript 类型
    └── utils.ts          # 工具函数
prisma/
├── schema.prisma         # 数据模型
└── seed.ts               # 种子数据
```

## API 文档

启动后访问 `/api/docs` 获取完整 API 接口文档。

## License

MIT
