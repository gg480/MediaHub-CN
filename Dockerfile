# ============================================
# MediaHub-CN Docker Image
# 集成 Radarr + Sonarr + Prowlarr 的中文影视自动化管理工具
# ============================================

FROM oven/bun:1 AS base
WORKDIR /app

# --- 安装依赖 ---
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- 构建阶段 ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成 Prisma Client
RUN bunx prisma generate

# 构建 Next.js（standalone 输出）
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# --- 生产阶段 ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 安装 curl 用于健康检查
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 创建数据目录
RUN mkdir -p /app/data /app/config && \
    chown nextjs:nodejs /app/data /app/config

# 复制 standalone 输出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制 Prisma schema 和客户端（含 CLI 用于数据库初始化）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/get-platform ./node_modules/get-platform

# 复制启动脚本
COPY --chmod=755 docker-entrypoint.sh /app/docker-entrypoint.sh

# 切换到非root用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 数据持久化卷
VOLUME ["/app/data"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/system/status || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
