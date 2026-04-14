import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Mock search across indexers - returns simulated results
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({ results: [] })
    }

    // Get enabled indexers
    const indexers = await db.indexer.findMany({ where: { enabled: true } })

    // Generate mock search results based on the query
    // In production, this would actually query each indexer
    const mockResults = generateMockResults(query, indexers)

    return NextResponse.json({ results: mockResults, total: mockResults.length })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: '搜索失败' }, { status: 500 })
  }
}

function generateMockResults(query: string, indexers: { name: string; id: string }[]) {
  const indexerNames = indexers.length > 0 ? indexers.map(i => i.name) : ['HDSky', 'M-Team', 'CHDBits']
  const indexerIds = indexers.length > 0 ? indexers.map(i => i.id) : ['1', '2', '3']

  const qualities = ['4K', '1080P', '1080P', '720P', '1080P Remux', '4K Remux']
  const codecs = ['H265', 'H264', 'H264', 'H265', 'H264', 'H265']
  const sources = ['BluRay', 'WebDL', 'WebDL', 'HDTV', 'BluRay', 'Remux']
  const groups = ['CASO', '豌豆字幕组', 'CMCT', 'PTHome', 'WiKi', 'CHD']

  const results = []
  const numResults = 8 + Math.floor(Math.random() * 8)

  for (let i = 0; i < numResults; i++) {
    const qIdx = i % qualities.length
    const idxIdx = i % indexerNames.length
    const hasSub = Math.random() > 0.4

    results.push({
      title: `${query}.${new Date().getFullYear()}.${qualities[qIdx]}.${sources[qIdx]}.${codecs[qIdx]}${hasSub ? '-简繁双语' : ''}-${groups[i % groups.length]}`,
      size: Math.floor(Math.random() * 30000000000) + 1000000000, // 1GB to 31GB
      seeders: Math.floor(Math.random() * 200) + 1,
      leechers: Math.floor(Math.random() * 30),
      grabs: Math.floor(Math.random() * 500) + 10,
      publishDate: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000).toISOString(),
      indexerName: indexerNames[idxIdx],
      indexerId: indexerIds[idxIdx],
      quality: qualities[qIdx],
      resolution: qualities[qIdx].includes('4K') ? '2160p' : qualities[qIdx].includes('720') ? '720p' : '1080p',
      codec: codecs[qIdx],
      source: sources[qIdx],
      group: groups[i % groups.length],
      hasChineseSub: hasSub,
      magnetUrl: `magnet:?xt=urn:btih:${Math.random().toString(36).substring(2, 42).toUpperCase()}`,
    })
  }

  // Sort by seeders descending
  results.sort((a, b) => b.seeders - a.seeders)
  return results
}
