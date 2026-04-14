import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const indexer = await db.indexer.update({
      where: { id },
      data: body,
    })

    return NextResponse.json(indexer)
  } catch (error) {
    console.error('Indexer update error:', error)
    return NextResponse.json({ error: '更新索引器失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.indexer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Indexer delete error:', error)
    return NextResponse.json({ error: '删除索引器失败' }, { status: 500 })
  }
}
