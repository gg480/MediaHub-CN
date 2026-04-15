import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const subs = await db.subscription.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(subs)
  } catch (error) {
    console.error('Subscriptions list error:', error)
    return NextResponse.json({ error: '获取订阅列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { keyword, type, autoSearch, autoDownload, tmdbId, doubanId, rssUrl, rssInterval } = body

    if (!keyword && !tmdbId) {
      return NextResponse.json({ error: '请提供关键词或TMDB ID' }, { status: 400 })
    }

    const sub = await db.subscription.create({
      data: {
        type: type || 'movie',
        source: 'manual',
        keyword: keyword || null,
        tmdbId: tmdbId || null,
        doubanId: doubanId || null,
        enabled: true,
        autoSearch: autoSearch ?? true,
        autoDownload: autoDownload ?? false,
        rssUrl: rssUrl || null,
        rssInterval: rssInterval || 30,
      },
    })

    return NextResponse.json(sub, { status: 201 })
  } catch (error) {
    console.error('Subscription create error:', error)
    return NextResponse.json({ error: '创建订阅失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 })
    }

    await db.subscription.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Subscription delete error:', error)
    return NextResponse.json({ error: '删除订阅失败' }, { status: 500 })
  }
}
