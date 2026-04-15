import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, type, host, port, username, password, baseUrl, enabled, movieCategory, movieSavePath, tvCategory, tvSavePath } = body

    // Build update data with only provided fields
    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (type !== undefined) data.type = type
    if (host !== undefined) data.host = host
    if (port !== undefined) data.port = Number(port)
    if (username !== undefined) data.username = username
    if (password !== undefined) data.password = password
    if (baseUrl !== undefined) data.baseUrl = baseUrl
    if (enabled !== undefined) data.enabled = enabled
    if (movieCategory !== undefined) data.movieCategory = movieCategory
    if (movieSavePath !== undefined) data.movieSavePath = movieSavePath
    if (tvCategory !== undefined) data.tvCategory = tvCategory
    if (tvSavePath !== undefined) data.tvSavePath = tvSavePath

    const client = await db.downloadClient.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, client })
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
