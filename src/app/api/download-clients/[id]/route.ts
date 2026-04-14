import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    if (body.port) body.port = parseInt(String(body.port))

    const client = await db.downloadClient.update({
      where: { id },
      data: body,
    })

    return NextResponse.json(client)
  } catch (error) {
    console.error('Download client update error:', error)
    return NextResponse.json({ error: '更新下载客户端失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.downloadClient.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Download client delete error:', error)
    return NextResponse.json({ error: '删除下载客户端失败' }, { status: 500 })
  }
}
