import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const clients = await db.downloadClient.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Download clients list error:', error)
    return NextResponse.json({ error: '获取下载客户端列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, host, port, username, password, baseUrl, category, directory } = body

    if (!name || !type || !host || !port) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
    }

    const client = await db.downloadClient.create({
      data: {
        name,
        type,
        host,
        port: parseInt(String(port)),
        username: username || null,
        password: password || null,
        baseUrl: baseUrl || null,
        category: category || null,
        directory: directory || null,
        enabled: true,
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Download client create error:', error)
    return NextResponse.json({ error: '创建下载客户端失败' }, { status: 500 })
  }
}
