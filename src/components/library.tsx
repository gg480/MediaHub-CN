'use client'

import { useState, useEffect, useCallback } from 'react'
import { MediaItem, getPosterUrl, formatSize, STATUS_MAP } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Film, Tv, Search, Star, Calendar, Eye, Trash2,
  LayoutGrid, List, FolderOpen, ChevronDown, ChevronUp
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

export function Library() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQ, setSearchQ] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { setCurrentPage, setSelectedMediaId } = useAppStore()
  const { toast } = useToast()

  const loadMedia = useCallback(async () => {
    setLoading(true)
    try {
      const typeParam = filter !== 'all' ? `&mediaType=${filter}` : ''
      const res = await fetch(`/api/media?${typeParam}`)
      if (res.ok) {
        const data = await res.json()
        setMedia(Array.isArray(data) ? data : [])
      }
    } catch {}
    setLoading(false)
  }, [filter])

  useEffect(() => {
    const controller = new AbortController()
    const typeParam = filter !== 'all' ? `&mediaType=${filter}` : ''
    const run = async (signal: AbortSignal) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/media?${typeParam}`, { signal })
        if (res.ok) {
          const data = await res.json()
          setMedia(Array.isArray(data) ? data : [])
        }
      } catch {}
      setLoading(false)
    }
    run(controller.signal)
    return () => controller.abort()
  }, [filter])

  const deleteMedia = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/media/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: '已删除', description: `${title} 已从媒体库移除` })
        setMedia(prev => prev.filter(m => m.id !== id))
      }
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  const filtered = media.filter(m =>
    !searchQ || m.titleCn.includes(searchQ) || (m.titleEn || '').toLowerCase().includes(searchQ.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">媒体库</h2>
          <p className="text-muted-foreground mt-1">管理你的电影和剧集收藏</p>
        </div>
        <Button onClick={() => setCurrentPage('discover')}>
          <Film className="w-4 h-4 mr-2" /> 添加影视
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索媒体库..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="movie">🎬 电影</TabsTrigger>
            <TabsTrigger value="tv">📺 剧集</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-1">
          <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">媒体库为空</p>
          <p className="text-sm text-muted-foreground/70 mt-1">点击上方"添加影视"搜索并添加</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map(item => (
            <Card
              key={item.id}
              className="group cursor-pointer overflow-hidden border-0 shadow-sm hover:shadow-xl transition-all duration-300"
              onClick={() => setSelectedMediaId(item.id)}
            >
              <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                {item.posterPath ? (
                  <img
                    src={getPosterUrl(item.posterPath)}
                    alt={item.titleCn}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                    {item.type === 'movie' ? <Film className="w-12 h-12 opacity-30" /> : <Tv className="w-12 h-12 opacity-30" />}
                  </div>
                )}
                {/* Status Badge */}
                <div className="absolute top-2 left-2">
                  <Badge className={`text-[10px] px-1.5 py-0 h-5 border-0 ${STATUS_MAP[item.status]?.bgColor} ${STATUS_MAP[item.status]?.color}`}>
                    {STATUS_MAP[item.status]?.label}
                  </Badge>
                </div>
                {/* Monitored */}
                {item.monitored && (
                  <div className="absolute top-2 right-2">
                    <Eye className="w-4 h-4 text-emerald-400 drop-shadow" />
                  </div>
                )}
                {/* Rating */}
                {(item.tmdbRating || item.doubanRating) && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {(item.doubanRating || item.tmdbRating || 0).toFixed(1)}
                  </div>
                )}
                {/* Delete button */}
                <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="w-7 h-7"
                    onClick={(e) => { e.stopPropagation(); deleteMedia(item.id, item.titleCn) }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate">{item.titleCn}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Calendar className="w-3 h-3" />{item.year || '-'}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {item.type === 'movie' ? '电影' : '剧集'}
                  </Badge>
                  {item.type === 'tv' && item.seasons && (
                    <span className="text-xs text-muted-foreground">{item.seasons.length}季</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className="shadow-sm border-0 cursor-pointer" onClick={() => setSelectedMediaId(item.id)}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {item.posterPath ? (
                    <img src={getPosterUrl(item.posterPath, 'w92')} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.type === 'movie' ? <Film className="w-5 h-5 text-muted-foreground/30" /> : <Tv className="w-5 h-5 text-muted-foreground/30" />}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{item.titleCn}</p>
                    {item.titleEn && <span className="text-xs text-muted-foreground truncate hidden sm:inline">({item.titleEn})</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 border-0 ${STATUS_MAP[item.status]?.bgColor} ${STATUS_MAP[item.status]?.color}`}>
                      {STATUS_MAP[item.status]?.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{item.year || '-'}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {item.type === 'movie' ? '电影' : '剧集'}
                    </Badge>
                    {(item.tmdbRating || item.doubanRating) && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-500" />
                        {(item.doubanRating || item.tmdbRating || 0).toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.monitored && <Eye className="w-4 h-4 text-emerald-500" />}
                  <Button variant="ghost" size="icon" onClick={() => deleteMedia(item.id, item.titleCn)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
