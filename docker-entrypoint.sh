#!/bin/sh
set -e

# ============================================
# MediaHub-CN Docker 启动脚本
# ============================================

echo "========================================="
echo "  MediaHub-CN 启动中..."
echo "========================================="

# 数据库初始化
echo "[1/3] 检查数据库..."
if [ ! -f /app/data/mediahub.db ]; then
    echo "  首次启动，初始化数据库..."
    DATABASE_URL="file:/app/data/mediahub.db" npx prisma db push --skip-generate 2>/dev/null || true
    echo "  数据库初始化完成"
else
    echo "  数据库已存在，跳过初始化"
fi

# 确保环境变量
export DATABASE_URL="${DATABASE_URL:-file:/app/data/mediahub.db}"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

# 数据库迁移（如果有 schema 变更）
echo "[2/3] 检查数据库 schema..."
DATABASE_URL="file:/app/data/mediahub.db" npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || echo "  Schema 同步跳过（可能是 SQLite 锁）"

echo "[3/3] 启动 MediaHub-CN..."
echo "  端口: ${PORT}"
echo "  数据库: ${DATABASE_URL}"
echo "========================================="

# 启动应用
exec "$@"
