'use client'

import { useState, useCallback, useEffect } from 'react'
import { TmdbSearchResult, getPosterUrl } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Film, Tv, Plus, Star, Calendar, Loader2, TrendingUp, Flame } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface TrendingSection {
  label: string
  results: TmdbSearchResult[]
  loading: boolean
  error: string | null
}

const INITIAL_SECTION: TrendingSection = { label: '', results: [], loading: true, error: null }

export function Discover() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TmdbSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<TmdbSearchResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all')
  const { toast } = useToast()

  const [trendingMovies, setTrendingMovies] = useState<TrendingSection>({ ...INITIAL_SECTION, label: '热门电影' })
  const [trendingTv, setTrendingTv] = useState<TrendingSection>({ ...INITIAL_SECTION, label: '热门剧集' })
  const [popularMovies, setPopularMovies] = useState<TrendingSection>({ ...INITIAL_SECTION, label: '流行电影' })
  const [popularTv, setPopularTv] = useState<TrendingSection>({ ...INITIAL_SECTION, label: '流行剧集' })

  const [isSearchMode, setIsSearchMode] = useState(false)

  const loadTrendingSection = useCallback(async (
    type: 'movie' | 'tv',
    setter: React.Dispatch<React.SetStateAction<TrendingSection>>
  ) => {
    setter(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch(`/api/scrape/tmdb?trending=${type}`)
      if (res.ok) {
        const data = await res.json()
        setter(prev => ({
          ...prev,
          results: data.results || [],
          label: data.label || prev.label,
          loading: false,
        }))
      } else {
        const data = await res.json().catch(() => ({}))
        setter(prev => ({
          ...prev,
          loading: false,
          error: data.error || '加载失败',
        }))
      }
    } catch {
      setter(prev => ({
        ...prev,
        loading: false,
        error: '网络错误',
      }))
    }
  }, [])

  const loadPopularSection = useCallback(async (
    type: 'movie' | 'tv',
    setter: React.Dispatch<React.SetStateAction<TrendingSection>>
  ) => {
    setter(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch(`/api/scrape/tmdb?popular=${type}`)
      if (res.ok) {
        const data = await res.json()
        setter(prev => ({
          ...prev,
          results: data.results || [],
          label: data.label || prev.label,
          loading: false,
        }))
      } else {
        const data = await res.json().catch(() => ({}))
        setter(prev => ({
          ...prev,
          loading: false,
          error: data.error || '加载失败',
        }))
      }
    } catch {
      setter(prev => ({
        ...prev,
        loading: false,
        error: '网络错误',
      }))
    }
  }, [])

  // Load trending/popular content on mount
  useEffect(() => {
    loadTrendingSection('movie', setTrendingMovies)
    loadTrendingSection('tv', setTrendingTv)
    loadPopularSection('movie', setPopularMovies)
    loadPopularSection('tv', setPopularTv)
  }, [loadTrendingSection, loadPopularSection])

  const searchTmdb = useCallback(async (query: string) => {
    if (!query.trim()) {
      setIsSearchMode(false)
      return
    }
    setSearchLoading(true)
    setIsSearchMode(true)
    try {
      const res = await fetch(`/api/scrape/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.results || [])
      } else {
        const data = await res.json().catch(() => ({}))
        toast({
          title: '搜索失败',
          description: data.error || '无法连接到TMDB',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: '搜索失败', description: '网络错误', variant: 'destructive' })
    }
    setSearchLoading(false)
  }, [toast])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setIsSearchMode(false)
  }, [])

  const addMedia = useCallback(async (item: TmdbSearchResult) => {
    setAdding(true)
    try {
      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: item.id,
          mediaType: item.mediaType,
          title: item.title || item.name || '',
          titleCn: item.title || item.name || '',
          overview: item.overview || '',
          posterPath: item.posterPath || '',
          backdropPath: item.backdropPath || '',
          year: parseInt((item.releaseDate || item.firstAirDate || '').substring(0, 4)) || null,
          rating: item.voteAverage || null,
        }),
      })

      if (res.ok) {
        toast({ title: '添加成功', description: `${item.title || item.name} 已加入媒体库` })
        setSelectedMedia(null)
      } else {
        const data = await res.json()
        toast({ title: '添加失败', description: data.error || '未知错误', variant: 'destructive' })
      }
    } catch {
      toast({ title: '添加失败', description: '网络错误', variant: 'destructive' })
    }
    setAdding(false)
  }, [toast])

  const filteredResults = searchResults.filter(item =>
    filter === 'all' || item.mediaType === filter
  )

  // Render a media card
  const renderCard = (item: TmdbSearchResult) => (
    <Card
      key={`${item.mediaType}-${item.id}`}
      className="group cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-xl transition-all duration-300"
      onClick={() => setSelectedMedia(item)}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        {item.posterPath ? (
          <img
            src={getPosterUrl(item.posterPath)}
            alt={item.title || item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            {item.mediaType === 'movie' ? <Film className="w-12 h-12 opacity-30" /> : <Tv className="w-12 h-12 opacity-30" />}
          </div>
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <Button size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); addMedia(item) }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 添加
            </Button>
          </div>
        </div>
        {/* Rating badge */}
        {item.voteAverage > 0 && (
          <div className="absolute top-2 right-2 bg-black/70 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
            <Star className="w-3 h-3 fill-yellow-400" />
            {item.voteAverage.toFixed(1)}
          </div>
        )}
        {/* Type badge */}
        <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] px-1.5 py-0 h-5 bg-black/60 text-white border-0">
          {item.mediaType === 'movie' ? '电影' : '剧集'}
        </Badge>
      </div>
      <CardContent className="p-3">
        <p className="text-sm font-medium truncate">{item.title || item.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.releaseDate || item.firstAirDate
            ? (item.releaseDate || item.firstAirDate || '').substring(0, 4)
            : '-'}
        </p>
      </CardContent>
    </Card>
  )

  // Render a section (trending/popular row)
  const renderSection = (section: TrendingSection, icon: React.ReactNode) => {
    if (section.loading) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-lg font-semibold">{section.label}</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Skeleton key={i} className="w-32 flex-shrink-0 aspect-[2/3] rounded-xl" />
            ))}
          </div>
        </div>
      )
    }

    if (section.error) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-lg font-semibold">{section.label}</h3>
          </div>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{section.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                if (section.label.includes('热门')) {
                  loadTrendingSection(
                    section.label.includes('电影') ? 'movie' : 'tv',
                    section.label.includes('电影') ? setTrendingMovies : setTrendingTv
                  )
                } else {
                  loadPopularSection(
                    section.label.includes('电影') ? 'movie' : 'tv',
                    section.label.includes('电影') ? setPopularMovies : setPopularTv
                  )
                }
              }}
            >
              重试
            </Button>
          </div>
        </div>
      )
    }

    if (section.results.length === 0) return null

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-lg font-semibold">{section.label}</h3>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {section.results.map((item) => (
            <div key={`${item.mediaType}-${item.id}`} className="w-32 flex-shrink-0">
              {renderCard(item)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">发现</h2>
        <p className="text-muted-foreground mt-1">搜索 TMDB 查找电影和剧集，添加到你的媒体库</p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索电影或剧集名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchTmdb(searchQuery)}
            className="pl-10 h-11"
          />
        </div>
        <Button onClick={() => searchTmdb(searchQuery)} disabled={searchLoading} className="h-11 px-6">
          {searchLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
          搜索
        </Button>
        {isSearchMode && (
          <Button variant="outline" onClick={clearSearch} className="h-11">
            返回
          </Button>
        )}
      </div>

      {/* Filter (only in search mode) */}
      {isSearchMode && (
        <div className="flex gap-2">
          {(['all', 'movie', 'tv'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? '全部' : f === 'movie' ? '🎬 电影' : '📺 剧集'}
            </Button>
          ))}
        </div>
      )}

      {/* Search Results Mode */}
      {isSearchMode ? (
        searchLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
              <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
            ))}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-16">
            <Film className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">未找到相关结果</p>
            <p className="text-sm text-muted-foreground/70 mt-1">请尝试其他关键词</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredResults.map((item) => renderCard(item))}
          </div>
        )
      ) : (
        /* Default: Trending / Popular Sections */
        <div className="space-y-8">
          {renderSection(trendingMovies, <TrendingUp className="w-5 h-5 text-orange-500" />)}
          {renderSection(trendingTv, <TrendingUp className="w-5 h-5 text-orange-500" />)}
          {renderSection(popularMovies, <Flame className="w-5 h-5 text-red-500" />)}
          {renderSection(popularTv, <Flame className="w-5 h-5 text-red-500" />)}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={(open) => !open && setSelectedMedia(null)}>
        <DialogContent className="max-w-lg">
          {selectedMedia && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMedia.title || selectedMedia.name}</DialogTitle>
              </DialogHeader>
              <div className="flex gap-4 mt-2">
                <div className="w-32 flex-shrink-0">
                  {selectedMedia.posterPath ? (
                    <img
                      src={getPosterUrl(selectedMedia.posterPath)}
                      alt=""
                      className="w-full rounded-lg shadow-md"
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-muted rounded-lg flex items-center justify-center">
                      <Film className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {selectedMedia.voteAverage > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-500" />
                        {selectedMedia.voteAverage.toFixed(1)}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {selectedMedia.mediaType === 'movie' ? '电影' : '剧集'}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="w-3 h-3" />
                      {(selectedMedia.releaseDate || selectedMedia.firstAirDate || '').substring(0, 4) || '未知'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {selectedMedia.overview || '暂无简介'}
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => addMedia(selectedMedia)}
                    disabled={adding}
                  >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    添加到媒体库
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
