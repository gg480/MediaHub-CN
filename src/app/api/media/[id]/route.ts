import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const media = await db.mediaItem.findUnique({
      where: { id },
      include: {
        seasons: {
          include: {
            episodes: {
              include: { downloads: true },
            },
          },
          orderBy: { seasonNumber: 'asc' },
        },
        downloads: true,
      },
    })

    if (!media) {
      return NextResponse.json({ error: '未找到该影视' }, { status: 404 })
    }

    return NextResponse.json(media)
  } catch (error) {
    console.error('Media get error:', error)
    return NextResponse.json({ error: '获取影视详情失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.mediaItem.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Media delete error:', error)
    return NextResponse.json({ error: '删除影视失败' }, { status: 500 })
  }
}
