import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
