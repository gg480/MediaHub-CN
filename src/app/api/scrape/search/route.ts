import { NextRequest, NextResponse } from 'next/server'

const TMDB_API_BASE = 'https://api.themoviedb.org/3'

async function getTmdbApiKey(): Promise<string | null> {
  try {
    const { db } = await import('@/lib/db')
    const setting = await db.setting.findUnique({ where: { key: 'tmdb_api_key' } })
    return setting?.value || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const query = searchParams.get('q')
    const mediaType = searchParams.get('mediaType') || 'movie'
    const tmdbId = searchParams.get('tmdbId')

    const apiKey = await getTmdbApiKey()
    // Use a default demo key or environment variable
    const key = apiKey || process.env.TMDB_API_KEY || ''

    if (!key) {
      // Return mock data if no API key configured
      return NextResponse.json({
        results: getMockSearchResults(query || '', mediaType),
        source: 'mock'
      })
    }

    if (tmdbId) {
      // Get specific media details
      const endpoint = mediaType === 'tv' ? `tv/${tmdbId}` : `movie/${tmdbId}`
      const res = await fetch(`${TMDB_API_BASE}/${endpoint}?api_key=${key}&language=zh-CN&append_to_response=${mediaType === 'tv' ? 'credits' : 'credits'}`)
      if (!res.ok) {
        return NextResponse.json({ error: 'TMDB API 请求失败' }, { status: res.status })
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    if (!query) {
      return NextResponse.json({ results: [], source: 'tmdb' })
    }

    // Search TMDB
    const type = mediaType === 'tv' ? 'tv' : 'movie'
    const res = await fetch(`${TMDB_API_BASE}/search/${type}?api_key=${key}&language=zh-CN&query=${encodeURIComponent(query)}&page=1`)

    if (!res.ok) {
      return NextResponse.json({ error: 'TMDB 搜索失败' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ...data, source: 'tmdb' })
  } catch (error) {
    console.error('Scrape search error:', error)
    return NextResponse.json({ error: '刮削搜索失败' }, { status: 500 })
  }
}

function getMockSearchResults(query: string, mediaType: string) {
  const mockMovies = [
    { id: 603, title: '黑客帝国', name: undefined, overview: '一名黑客发现了他所处的现实世界的真相...', posterPath: '/hEp6vD6ILt3C4s8N8T0BBo3gBqc.jpg', backdropPath: '/fHV2H5MDIp0hXeJnW7Rp5dX7E7Z.jpg', releaseDate: '1999-03-31', firstAirDate: undefined, voteAverage: 8.2, mediaType: 'movie' },
    { id: 27205, title: '盗梦空间', name: undefined, overview: '一个熟练的盗梦者，他能够潜入人们的梦境中窃取秘密...', posterPath: '/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg', backdropPath: '/s2bT29y0ngXxxu2QBCzGXxmIlZ9.jpg', releaseDate: '2010-07-16', firstAirDate: undefined, voteAverage: 8.4, mediaType: 'movie' },
    { id: 155, title: '黑暗骑士', name: undefined, overview: '蝙蝠侠与小丑之间的终极对决...', posterPath: '/qJ2tW6WMUDux911BTUgMe1nS1oV.jpg', backdropPath: '/nMKdUUepR0i5zn0y1T4CsSB5ez.jpg', releaseDate: '2008-07-18', firstAirDate: undefined, voteAverage: 8.5, mediaType: 'movie' },
    { id: 278, title: '肖申克的救赎', name: undefined, overview: '被冤枉的银行家安迪在监狱中找到自由...', posterPath: '/9cjIGRjChCU7uSXkNbuZfbWMCnC.jpg', backdropPath: '/kXfq7QxgNqHQR7R7XjtK9Q6v8Uo.jpg', releaseDate: '1994-09-23', firstAirDate: undefined, voteAverage: 8.7, mediaType: 'movie' },
    { id: 680, title: '低俗小说', name: undefined, overview: '几个相互关联的犯罪故事...', posterPath: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', backdropPath: '/6eHnf9PY4jS5kxbORxSPG5QTtJf.jpg', releaseDate: '1994-10-14', firstAirDate: undefined, voteAverage: 8.5, mediaType: 'movie' },
    { id: 792307, title: '流浪地球2', name: undefined, overview: '太阳即将毁灭，人类在地球表面建造出巨大的推进器...', posterPath: '/gYbZulME0BcjJxPYi3fK6Ne8zFh.jpg', backdropPath: '/qNVzEumuXGH7hNqqbCsoDKC3bCj.jpg', releaseDate: '2023-01-22', firstAirDate: undefined, voteAverage: 7.8, mediaType: 'movie' },
  ]

  const mockTv = [
    { id: 1399, title: undefined, name: '权力的游戏', overview: '七大王国之间为争夺铁王座而展开的争斗...', posterPath: '/7WUHnWGx5OO145IRxPDUkQSh4C7.jpg', backdropPath: '/9pAeOqQj5Fpc44M4UxEPFWJk9e3.jpg', releaseDate: undefined, firstAirDate: '2011-04-17', voteAverage: 8.5, mediaType: 'tv' },
    { id: 1396, title: undefined, name: '绝命毒师', overview: '一位化学老师发现自己患了肺癌后开始制造冰毒...', posterPath: '/ztkUQFLlC19CCMYHW73WxxWgMD5.jpg', backdropPath: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg', releaseDate: undefined, firstAirDate: '2008-01-20', voteAverage: 8.9, mediaType: 'tv' },
    { id: 100088, title: undefined, name: '庆余年', overview: '一个年轻的秘密特工在古代世界中生存...', posterPath: '/cDzE3mj3m3NcEh0sVq9XbFJhVRj.jpg', backdropPath: '/5P8Sm2z2eS4VrM3RPvI4g4oF9oL.jpg', releaseDate: undefined, firstAirDate: '2019-11-26', voteAverage: 8.0, mediaType: 'tv' },
    { id: 94997, title: undefined, name: '鱿鱼游戏', overview: '数百名为生活所困的人接受了一个神秘的生存游戏邀请...', posterPath: '/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg', backdropPath: '/sgxawbFB5PmclV5k2IVeYcMCYq1.jpg', releaseDate: undefined, firstAirDate: '2021-09-17', voteAverage: 7.8, mediaType: 'tv' },
    { id: 76479, title: undefined, name: '三体', overview: '一个秘密军事项目向外星文明发送信号，由此引发了地球文明与三体文明之间的博弈...', posterPath: '/nW8gBFCFlbXm3XZcRacgQf3nkG8.jpg', backdropPath: '/4X5qGWrY1yN5K0n6D0D0j0bJ2n0.jpg', releaseDate: undefined, firstAirDate: '2024-03-21', voteAverage: 7.6, mediaType: 'tv' },
    { id: 84958, title: undefined, name: '洛基', overview: '洛基在逃脱后陷入了一个由时间变异管理局管理的新世界...', posterPath: '/voHU2ua1nFOsp0FJmxkhQ6F6sAW.jpg', backdropPath: '/kYgQzzjNis5jJalYtIHgrom0gOx.jpg', releaseDate: undefined, firstAirDate: '2021-06-09', voteAverage: 8.1, mediaType: 'tv' },
  ]

  if (!query) return mediaType === 'tv' ? mockTv : mockMovies

  const list = mediaType === 'tv' ? mockTv : mockMovies
  return list.filter(item =>
    (item.title || item.name || '').toLowerCase().includes(query.toLowerCase())
  )
}
