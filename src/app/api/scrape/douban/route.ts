import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================
// Douban Scraping API
// GET /api/scrape/douban?q=xxx&type=movie
// GET /api/scrape/douban?id=xxx (douban movie/subject ID)
// POST /api/scrape/douban?mediaItemId=xxx (scrape & save to media item)
// ============================================

const DOUBAN_SEARCH_URL = 'https://movie.douban.com/j/subject_suggest'
const DOUBAN_DETAIL_URL = 'https://movie.douban.com/j/subject_abstract'
const DOUBAN_CELEBRITY_URL = 'https://movie.douban.com/j/celebrities'

interface DoubanSetting {
  value: string | null
}

async function getProxyHost(): Promise<string> {
  const setting = await db.setting.findUnique({ where: { key: 'proxy_host' } })
  return setting?.value || ''
}

async function getDoubanCookie(): Promise<string> {
  const setting = await db.setting.findUnique({ where: { key: 'douban_cookie' } })
  return setting?.value || ''
}

async function fetchWithProxy(url: string, cookie: string): Promise<Response> {
  const proxyHost = await getProxyHost()
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://movie.douban.com/',
  }

  if (cookie) {
    headers['Cookie'] = cookie
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    })
    clearTimeout(timeout)
    return res
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

// ============================================
// GET: Search or get detail
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const query = searchParams.get('q')
    const doubanId = searchParams.get('id')
    const type = searchParams.get('type') || 'movie'
    const cookie = await getDoubanCookie()

    // Search mode
    if (query && !doubanId) {
      return handleSearch(query, type, cookie)
    }

    // Detail mode by douban ID
    if (doubanId) {
      return handleDetail(doubanId, cookie)
    }

    return NextResponse.json({ error: '请提供搜索关键词或豆瓣ID' }, { status: 400 })
  } catch (error) {
    console.error('Douban scrape GET error:', error)
    return NextResponse.json({ error: '豆瓣刮削失败' }, { status: 500 })
  }
}

// ============================================
// POST: Scrape douban metadata and save to media item
// ============================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const mediaItemId = searchParams.get('mediaItemId')
    const body = await request.json()
    const { doubanId: bodyDoubanId, title: searchTitle } = body || {}

    if (!mediaItemId) {
      return NextResponse.json({ error: '缺少媒体ID' }, { status: 400 })
    }

    // Find the media item
    const mediaItem = await db.mediaItem.findUnique({ where: { id: mediaItemId } })
    if (!mediaItem) {
      return NextResponse.json({ error: '媒体项不存在' }, { status: 404 })
    }

    const cookie = await getDoubanCookie()

    // Determine douban ID to use
    let targetDoubanId = bodyDoubanId || mediaItem.doubanId || ''
    let detail: Record<string, unknown> | null = null

    if (targetDoubanId) {
      // Direct fetch by douban ID
      const detailRes = await handleDetail(targetDoubanId, cookie)
      if (detailRes.status === 200) {
        detail = (await detailRes.json()) as Record<string, unknown>
      }
    } else {
      // Search by title
      const searchTitle = searchTitle || mediaItem.titleCn || mediaItem.titleEn || ''
      if (!searchTitle) {
        return NextResponse.json({ error: '没有可用的搜索标题' }, { status: 400 })
      }

      const searchRes = await handleSearch(searchTitle, mediaItem.type, cookie)
      if (searchRes.status === 200) {
        const searchData = (await searchRes.json()) as { results?: unknown[] }
        if (searchData.results && searchData.results.length > 0) {
          const firstResult = searchData.results[0] as Record<string, unknown>
          targetDoubanId = String(firstResult.id || '')
          if (targetDoubanId) {
            const detailRes = await handleDetail(targetDoubanId, cookie)
            if (detailRes.status === 200) {
              detail = (await detailRes.json()) as Record<string, unknown>
            }
          }
        } else {
          return NextResponse.json({
            success: false,
            error: '豆瓣未找到匹配结果',
            updated: false,
          })
        }
      }
    }

    if (!detail) {
      return NextResponse.json({ error: '获取豆瓣详情失败', success: false }, { status: 500 })
    }

    // Update media item with douban data
    const updateData: Record<string, unknown> = {
      doubanId: targetDoubanId,
    }

    // Extract rating
    if (detail.rating) {
      const ratingValue = Number(detail.rating)
      if (!isNaN(ratingValue) && ratingValue > 0) {
        updateData.doubanRating = ratingValue
      }
    }

    // Extract Chinese overview
    if (detail.abstract && typeof detail.abstract === 'string') {
      updateData.overviewCn = detail.abstract
    }

    // Extract Chinese title
    if (detail.title && typeof detail.title === 'string') {
      if (!updateData.overviewCn) {
        // If we have a Chinese title, use it
      }
      if (mediaItem.titleEn) {
        updateData.titleCn = detail.title
      }
    }

    // Extract original title
    if (detail.origin_title && typeof detail.origin_title === 'string') {
      updateData.originalTitle = detail.origin_title
    }

    // Extract year
    if (detail.year) {
      updateData.year = parseInt(String(detail.year), 10)
    }

    // Extract douban poster URL
    if (detail.pic && typeof detail.pic === 'object') {
      const picObj = detail.pic as Record<string, unknown>
      if (picObj.large || picObj.normal) {
        updateData.posterUrl = String(picObj.large || picObj.normal)
      }
    }

    await db.mediaItem.update({
      where: { id: mediaItemId },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      updated: true,
      doubanId: targetDoubanId,
      doubanRating: updateData.doubanRating,
      data: detail,
    })
  } catch (error) {
    console.error('Douban scrape POST error:', error)
    return NextResponse.json({ error: '豆瓣刮削失败' }, { status: 500 })
  }
}

// ============================================
// Search handler
// ============================================

async function handleSearch(query: string, type: string, cookie: string) {
  try {
    const searchUrl = `${DOUBAN_SEARCH_URL}?q=${encodeURIComponent(query)}`
    const res = await fetchWithProxy(searchUrl, cookie)

    if (!res.ok) {
      // Douban might block direct API access without cookie
      if (res.status === 403 || res.status === 401) {
        return NextResponse.json({
          results: [],
          message: '豆瓣需要Cookie才能访问，请在设置中配置豆瓣Cookie',
          needsCookie: true,
        })
      }
      return NextResponse.json({ error: `豆瓣搜索失败: HTTP ${res.status}` }, { status: res.status })
    }

    const data = await res.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ results: [], message: '未找到结果' })
    }

    // Map results
    const results = data.map((item: Record<string, unknown>) => ({
      id: item.id || '',
      title: item.title || '',
      type: item.type === 'tv' ? 'tv' : 'movie',
      year: item.year || '',
      rating: item.rate || item.rating || '',
      url: item.url || '',
      pic: item.pic || '',
      sub_title: item.sub_title || '',
    }))

    // Filter by type if specified
    const filtered = type && type !== 'all'
      ? results.filter((r: { type: string }) => r.type === type || r.type === 'movie')
      : results

    return NextResponse.json({ results: filtered.slice(0, 10) })
  } catch (error) {
    console.error('Douban search error:', error)
    return NextResponse.json({ error: '豆瓣搜索出错', results: [] }, { status: 500 })
  }
}

// ============================================
// Detail handler
// ============================================

async function handleDetail(doubanId: string, cookie: string) {
  try {
    const detailUrl = `${DOUBAN_DETAIL_URL}?id=${doubanId}`
    const res = await fetchWithProxy(detailUrl, cookie)

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        return NextResponse.json({
          error: '豆瓣需要Cookie才能访问',
          needsCookie: true,
        }, { status: 403 })
      }
      return NextResponse.json({ error: `获取详情失败: HTTP ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Douban detail error:', error)
    return NextResponse.json({ error: '获取豆瓣详情出错' }, { status: 500 })
  }
}

// ============================================
// Batch rating lookup
// GET /api/scrape/douban?action=ratings&ids=xxx,yyy,zzz
// ============================================

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const action = searchParams.get('action')

    if (action !== 'ratings') {
      return NextResponse.json({ error: '不支持的操作' }, { status: 400 })
    }

    const body = await request.json()
    const { mediaItemIds } = body as { mediaItemIds?: string[] }

    if (!mediaItemIds || !Array.isArray(mediaItemIds)) {
      return NextResponse.json({ error: '缺少媒体ID列表' }, { status: 400 })
    }

    const cookie = await getDoubanCookie()
    const results: Array<{
      mediaItemId: string
      doubanRating?: number
      doubanId?: string
      error?: string
    }> = []

    for (const mediaItemId of mediaItemIds.slice(0, 10)) {
      try {
        const mediaItem = await db.mediaItem.findUnique({ where: { id: mediaItemId } })
        if (!mediaItem) {
          results.push({ mediaItemId, error: '不存在' })
          continue
        }

        if (mediaItem.doubanId) {
          // Already has douban ID, fetch rating directly
          const detailRes = await handleDetail(mediaItem.doubanId, cookie)
          if (detailRes.status === 200) {
            const detail = (await detailRes.json()) as Record<string, unknown>
            const rating = Number(detail.rating || 0)
            if (rating > 0) {
              await db.mediaItem.update({
                where: { id: mediaItemId },
                data: { doubanRating: rating },
              })
              results.push({ mediaItemId, doubanRating: rating, doubanId: mediaItem.doubanId })
            } else {
              results.push({ mediaItemId, doubanRating: 0, doubanId: mediaItem.doubanId })
            }
          } else {
            results.push({ mediaItemId, error: '获取详情失败' })
          }
        } else {
          // Search by Chinese title
          const title = mediaItem.titleCn || mediaItem.titleEn || ''
          if (!title) {
            results.push({ mediaItemId, error: '无标题' })
            continue
          }

          const searchRes = await handleSearch(title, mediaItem.type, cookie)
          if (searchRes.status === 200) {
            const searchData = (await searchRes.json()) as { results?: Array<{ id: string; rating: string | number; title: string }> }
            if (searchData.results && searchData.results.length > 0) {
              const first = searchData.results[0]
              const rating = Number(first.rating || 0)
              if (rating > 0) {
                await db.mediaItem.update({
                  where: { id: mediaItemId },
                  data: {
                    doubanRating: rating,
                    doubanId: first.id,
                  },
                })
                results.push({ mediaItemId, doubanRating: rating, doubanId: first.id })
              } else {
                results.push({ mediaItemId, doubanRating: 0, doubanId: first.id })
              }
            } else {
              results.push({ mediaItemId, error: '未找到' })
            }
          } else {
            results.push({ mediaItemId, error: '搜索失败' })
          }
        }

        // Rate limit: delay between requests
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (err) {
        results.push({ mediaItemId, error: String(err) })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Douban batch rating error:', error)
    return NextResponse.json({ error: '批量获取豆瓣评分失败' }, { status: 500 })
  }
}
