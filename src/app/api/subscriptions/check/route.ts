import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Check/trigger a subscription search
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少订阅ID' }, { status: 400 })
    }

    const sub = await db.subscription.findUnique({ where: { id } })
    if (!sub) {
      return NextResponse.json({ error: '订阅不存在' }, { status: 404 })
    }

    // Update last check time
    await db.subscription.update({
      where: { id },
      data: { lastCheckAt: new Date() },
    })

    return NextResponse.json({ success: true, message: '已触发检查' })
  } catch (error) {
    console.error('Subscription check error:', error)
    return NextResponse.json({ error: '检查失败' }, { status: 500 })
  }
}
