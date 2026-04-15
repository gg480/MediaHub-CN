'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { MediaItem, getPosterUrl, getBackdropUrl, formatSize, STATUS_MAP } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X, Star, Calendar, Film, Tv, Download, Eye,
  Search, Trash2, Loader2, Globe,
  FileText, RefreshCw
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function MediaDetail() {
  const { selectedMediaId, setSelectedMediaId, setCurrentPage, setInitialSearchQuery } = useAppStore()
  const [media, setMedia] = useState<MediaItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [doubanScraping, setDoubanScraping] = useState(false)
  const [nfoContent, setNfoContent] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const controller = new AbortController()
    const run = async (signal: AbortSignal) => {
      if (!selectedMediaId) return
      setLoading(true)
      try {
        const res = await fetch(`/api/media/${selectedMediaId}`, { signal })
        if (res.ok) {
          const data = await res.json()
          setMedia(data)
        }
      } catch {}
      setLoading(false)
    }
    run(controller.signal)
    return () => controller.abort()
  }, [selectedMediaId])

  const close = () => {
    setSelectedMediaId(null)
    setMedia(null)
    setNfoContent(null)
  }

  const scrapeMetadata = async () => {
    if (!selectedMediaId) return
    setScraping(true)
    try {
      const res = await fetch(`/api/scrape/nfo?mediaItemId=${selectedMediaId}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast({ title: '刮削完成', description: data.updated ? '元数据已更新' : '使用本地数据生成' })
        // Refresh media data
        try {
          const refreshRes = await fetch(`/api/media/${selectedMediaId}`)
          if (refreshRes.ok) setMedia(await refreshRes.json())
        } catch { /* ignore */ }
        setNfoContent(data.content)
      } else {
        const err = await res.json()
        toast({ title: '刮削失败', description: err.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: '刮削失败', variant: 'destructive' })
    }
    setScraping(false)
  }

  const scrapeDouban = async () => {
    if (!selectedMediaId) return
    setDoubanScraping(true)
    try {
      const res = await fetch(`/api/scrape/douban?mediaItemId=${selectedMediaId}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          toast({ title: '豆瓣刮削完成', description: data.doubanRating ? `豆瓣评分: ${data.doubanRating}` : '已更新元数据' })
          // Refresh media data
          try {
            const refreshRes = await fetch(`/api/media/${selectedMediaId}`)
            if (refreshRes.ok) setMedia(await refreshRes.json())
          } catch { /* ignore */ }
        } else {
          toast({ title: '豆瓣刮削失败', description: data.error, variant: 'destructive' })
        }
      } else {
        const err = await res.json()
        toast({ title: '豆瓣刮削失败', description: err.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: '豆瓣刮削失败', variant: 'destructive' })
    }
    setDoubanScraping(false)
  }

  const generateNfo = async () => {
    if (!selectedMediaId) return
    setScraping(true)
    try {
      const res = await fetch(`/api/scrape/nfo?mediaItemId=${selectedMediaId}`)
      if (res.ok) {
        const data = await res.json()
        setNfoContent(data.content)
        toast({ title: 'NFO已生成', description: `类型: ${data.type}` })
      }
    } catch {
      toast({ title: 'NFO生成失败', variant: 'destructive' })
    }
    setScraping(false)
  }

  const searchAndDownload = () => {
    if (media) {
      const title = media.titleEn || media.titleCn || ''
      setInitialSearchQuery(title)
      setSelectedMediaId(null)
      setMedia(null)
      setNfoContent(null)
      setCurrentPage('search')
    }
  }

  if (!selectedMediaId) return null

  return (
    <Dialog open={!!selectedMediaId} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        {loading ? (
          <div className="p-8">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <div className="flex gap-4">
              <Skeleton className="w-40 h-60 rounded-lg" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </div>
        ) : media ? (
          <ScrollArea className="max-h-[90vh]">
            {/* Hero Section */}
            <div className="relative">
              {media.backdropPath ? (
                <div
                  className="h-48 bg-cover bg-center"
                  style={{ backgroundImage: `url(${getBackdropUrl(media.backdropPath, 'w780')})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-r from-emerald-900/30 to-teal-900/30" />
              )}

              <div className="absolute top-3 right-3">
                <Button variant="ghost" size="icon" onClick={close} className="h-8 w-8 bg-black/30 hover:bg-black/50 text-white">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="relative -mt-24 px-6 pb-6 flex gap-5">
                {/* Poster */}
                <div className="w-36 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl border-2 border-background">
                  {media.posterPath ? (
                    <img src={getPosterUrl(media.posterPath)} alt={media.titleCn} className="w-full aspect-[2/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                      {media.type === 'movie' ? <Film className="w-12 h-12 text-muted-foreground/30" /> : <Tv className="w-12 h-12 text-muted-foreground/30" />}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 pt-16">
                  <h2 className="text-xl font-bold text-foreground">{media.titleCn}</h2>
                  {media.titleEn && (
                    <p className="text-sm text-muted-foreground mt-0.5">{media.titleEn}</p>
                  )}
                  {media.originalTitle && media.originalTitle !== media.titleEn && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">原名: {media.originalTitle}</p>
                  )}

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {media.year && (
                      <Badge variant="outline" className="gap-1">
                        <Calendar className="w-3 h-3" />{media.year}
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {media.type === 'movie' ? '电影' : '剧集'}
                    </Badge>
                    <Badge className={`${STATUS_MAP[media.status]?.bgColor} ${STATUS_MAP[media.status]?.color}`}>
                      {STATUS_MAP[media.status]?.label}
                    </Badge>
                    {media.monitored && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                        <Eye className="w-3 h-3" />监控中
                      </Badge>
                    )}
                  </div>

                  {/* Ratings */}
                  <div className="flex items-center gap-4 mt-3">
                    {media.tmdbRating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                        <span className="text-sm font-semibold">{media.tmdbRating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">TMDB</span>
                      </div>
                    )}
                    {media.doubanRating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-green-400 text-green-500" />
                        <span className="text-sm font-semibold">{media.doubanRating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">豆瓣</span>
                      </div>
                    )}
                    {media.imdbId && (
                      <span className="text-xs text-muted-foreground">IMDB: {media.imdbId}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 flex gap-2 flex-wrap">
              <Button onClick={searchAndDownload} className="bg-gradient-to-r from-emerald-600 to-teal-600">
                <Search className="w-4 h-4 mr-1" />搜索下载
              </Button>
              <Button onClick={scrapeMetadata} disabled={scraping} variant="outline">
                {scraping ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                刮削元数据
              </Button>
              <Button onClick={scrapeDouban} disabled={doubanScraping} variant="outline">
                {doubanScraping ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Star className="w-4 h-4 mr-1" />}
                豆瓣刮削
              </Button>
              <Button onClick={generateNfo} disabled={scraping} variant="outline">
                <FileText className="w-4 h-4 mr-1" />生成NFO
              </Button>
            </div>

            {/* Tabs */}
            <div className="px-6 mt-4 pb-6">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">简介</TabsTrigger>
                  <TabsTrigger value="seasons">
                    季集
                    {media.type === 'tv' && media.seasons && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{media.seasons.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="nfo">NFO</TabsTrigger>
                  <TabsTrigger value="downloads">
                    下载
                    {media.downloads && media.downloads.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{media.downloads.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {media.overviewCn || '暂无简介，点击"刮削元数据"从TMDB获取。'}
                  </p>
                  {media.tmdbId && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Globe className="w-3 h-3" />
                      <span>TMDB ID: {media.tmdbId}</span>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="seasons" className="mt-4">
                  {media.type === 'tv' && media.seasons && media.seasons.length > 0 ? (
                    <div className="space-y-4">
                      {media.seasons.filter(s => s.seasonNumber > 0).map((season) => (
                        <Card key={season.id} className="border-0 shadow-sm">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-sm">第 {season.seasonNumber} 季</h4>
                              <Badge variant="outline" className="text-[10px]">
                                {season.episodes?.length || 0} 集
                              </Badge>
                            </div>
                            {season.episodes && season.episodes.length > 0 ? (
                              <div className="space-y-1">
                                {season.episodes.map((ep) => (
                                  <div key={ep.id} className="flex items-center justify-between py-1 text-sm">
                                    <span className="text-muted-foreground">
                                      E{String(ep.episodeNumber).padStart(2, '0')}
                                      {ep.titleCn ? ` · ${ep.titleCn}` : ''}
                                    </span>
                                    <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 ${STATUS_MAP[ep.status]?.bgColor} ${STATUS_MAP[ep.status]?.color}`}>
                                      {STATUS_MAP[ep.status]?.label}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">暂无集信息</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {media.type === 'tv' ? '暂无季集信息' : '这是电影，没有季集信息'}
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="nfo" className="mt-4">
                  {nfoContent ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">NFO 文件预览（Kodi/Emby/极影视 兼容）</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(nfoContent)
                            toast({ title: '已复制', description: 'NFO内容已复制到剪贴板' })
                          }}
                        >
                          复制
                        </Button>
                      </div>
                      <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-auto max-h-80 font-mono leading-relaxed">
                        {nfoContent}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">暂未生成NFO文件</p>
                      <p className="text-xs mt-1">点击"生成NFO"或"刮削元数据"创建</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="downloads" className="mt-4">
                  {media.downloads && media.downloads.length > 0 ? (
                    <div className="space-y-2">
                      {media.downloads.map((dl) => (
                        <div key={dl.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{dl.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {dl.quality && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{dl.quality}</Badge>}
                              <span className="text-xs text-muted-foreground">{formatSize(dl.size)}</span>
                              {dl.indexer && <span className="text-xs text-muted-foreground">来源: {dl.indexer.name}</span>}
                            </div>
                          </div>
                          <Badge className={`text-[10px] px-1.5 py-0 h-5 border-0 ${STATUS_MAP[dl.status]?.bgColor} ${STATUS_MAP[dl.status]?.color}`}>
                            {STATUS_MAP[dl.status]?.label}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Download className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">暂无下载记录</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
