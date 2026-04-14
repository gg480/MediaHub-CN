import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/notifications/[id] — 获取单个通知配置
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const notification = await db.notification.findUnique({ where: { id } })
    if (!notification) {
      return NextResponse.json({ error: '通知配置不存在' }, { status: 404 })
    }
    return NextResponse.json(notification)
  } catch (error) {
    console.error('获取通知配置失败:', error)
    return NextResponse.json({ error: '获取通知配置失败' }, { status: 500 })
  }
}

// PUT /api/notifications/[id] — 更新通知配置
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.notification.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '通知配置不存在' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.type !== undefined) updateData.type = body.type
    if (body.enabled !== undefined) updateData.enabled = body.enabled
    if (body.config !== undefined) {
      updateData.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config)
    }
    if (body.events !== undefined) {
      updateData.events = typeof body.events === 'string' ? body.events : body.events.join(',')
    }

    const notification = await db.notification.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(notification)
  } catch (error) {
    console.error('更新通知配置失败:', error)
    return NextResponse.json({ error: '更新通知配置失败' }, { status: 500 })
  }
}

// DELETE /api/notifications/[id] — 删除通知配置
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.notification.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '通知配置不存在' }, { status: 404 })
    }

    await db.notification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除通知配置失败:', error)
    return NextResponse.json({ error: '删除通知配置失败' }, { status: 500 })
  }
}
