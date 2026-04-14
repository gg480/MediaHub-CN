import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/notifications — 获取通知列表
export async function GET() {
  try {
    const notifications = await db.notification.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(notifications)
  } catch (error) {
    console.error('获取通知列表失败:', error)
    return NextResponse.json({ error: '获取通知列表失败' }, { status: 500 })
  }
}

// POST /api/notifications — 创建通知配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, enabled = true, config, events } = body

    if (!name || !type || !config || !events) {
      return NextResponse.json({ error: '缺少必要参数（name/type/config/events）' }, { status: 400 })
    }

    const validTypes = ['wechat', 'webhook', 'telegram', 'bark']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `不支持的类型: ${type}，支持: ${validTypes.join(', ')}` }, { status: 400 })
    }

    // 验证 config JSON
    let parsedConfig: Record<string, string>
    try {
      parsedConfig = typeof config === 'string' ? JSON.parse(config) : config
    } catch {
      return NextResponse.json({ error: 'config 格式错误，需要合法JSON' }, { status: 400 })
    }

    // 验证必要配置字段
    const requiredFields: Record<string, string[]> = {
      webhook: ['webhook_url'],
      wechat: ['corp_id', 'agent_id', 'secret'],
      telegram: ['bot_token', 'chat_id'],
      bark: ['server_url', 'device_key'],
    }
    const required = requiredFields[type] || []
    const missing = required.filter((f) => !parsedConfig[f])
    if (missing.length > 0) {
      return NextResponse.json({ error: `缺少必要配置: ${missing.join(', ')}` }, { status: 400 })
    }

    const notification = await db.notification.create({
      data: {
        name,
        type,
        enabled,
        config: typeof config === 'string' ? config : JSON.stringify(config),
        events: typeof events === 'string' ? events : events.join(','),
      },
    })

    return NextResponse.json(notification, { status: 201 })
  } catch (error) {
    console.error('创建通知配置失败:', error)
    return NextResponse.json({ error: '创建通知配置失败' }, { status: 500 })
  }
}
