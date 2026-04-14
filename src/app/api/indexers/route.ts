import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const indexers = await db.indexer.findMany({
      orderBy: { priority: 'desc' },
    })
    return NextResponse.json(indexers)
  } catch (error) {
    console.error('Indexer list error:', error)
    return NextResponse.json({ error: '获取索引器列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, protocol, scheme, host, port, baseUrl, apiKey, categories, uid, passkey, cookie, vip, searchPath, detailsPath, priority, tags, enableRss, enableSearch, enableAuto, rateLimit } = body

    if (!name || !host) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
    }

    const indexer = await db.indexer.create({
      data: {
        name,
        protocol: protocol || 'torrent',
        scheme: scheme || 'https',
        host,
        port: port || null,
        baseUrl: baseUrl || null,
        apiKey: apiKey || null,
        categories: categories || null,
        uid: uid || null,
        passkey: passkey || null,
        cookie: cookie || null,
        vip: vip || false,
        searchPath: searchPath || null,
        detailsPath: detailsPath || null,
        priority: priority || 25,
        tags: tags || null,
        enableRss: enableRss ?? true,
        enableSearch: enableSearch ?? true,
        enableAuto: enableAuto ?? true,
        rateLimit: rateLimit || 10,
        enabled: true,
      },
    })

    return NextResponse.json(indexer, { status: 201 })
  } catch (error) {
    console.error('Indexer create error:', error)
    return NextResponse.json({ error: '创建索引器失败' }, { status: 500 })
  }
}
