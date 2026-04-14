import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const settings = await db.setting.findMany()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Settings get error:', error)
    return NextResponse.json([])
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    // Upsert each setting
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        await db.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Settings update error:', error)
    return NextResponse.json({ error: '保存设置失败' }, { status: 500 })
  }
}
