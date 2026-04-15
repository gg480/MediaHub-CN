'use client'

import { useState, useCallback } from 'react'
import { SearchResult, parseReleaseQuality, formatSize, STATUS_MAP } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search, Download, Copy, Filter, Loader2, ArrowUpDown,
  HardDrive, Users, Clock, CheckCircle
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

export function SearchPage() {
  const { initialSearchQuery, setInitialSearchQuery } = useAppStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [qualityFilter, setQualityFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('seeders')
  const { toast } = useToast()

  // Read initial query from store (set by media-detail "搜索下载" button)
  // Use a ref-based approach to avoid lint set-state-in-effect
  const _initialApplied = useState(false)
  if (initialSearchQuery && !_initialApplied[0]) {
    _initialApplied[1](true)
    setQuery(initialSearchQuery)
    setInitialSearchQuery(null)
  }

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(Array.isArray(data) ? data : data.results || [])
      }
    } catch {
      toast({ title: '搜索失败', description: '无法搜索索引器', variant: 'destructive' })
    }
    setLoading(false)
  }, [query, toast])

  const copyMagnet = (magnet?: string) => {
    if (!magnet) return
    navigator.clipboard.writeText(magnet)
    toast({ title: '已复制', description: '磁力链接已复制到剪贴板' })
  }

  const addDownload = async (result: SearchResult) => {
    try {
      const parsed = parseReleaseQuality(result.title)
      // Step 1: Create download task in DB
      const res = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: result.title,
          size: result.size,
          magnetUrl: result.magnetUrl,
          torrentUrl: result.torrentUrl,
          infoHash: result.infoHash,
          indexerId: result.indexerId,
          quality: parsed.quality || result.quality,
          resolution: parsed.resolution || result.resolution,
          codec: parsed.codec || result.codec,
          source: parsed.source || result.source,
          group: parsed.group || result.group,
          hasChineseSub: parsed.hasChineseSub ?? result.hasChineseSub ?? false,
          seeders: result.seeders,
          leechers: result.leechers,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast({ title: '添加失败', description: data.error, variant: 'destructive' })
        return
      }

      const task = await res.json()

      // Step 2: Send to download client automatically
      const sendRes = await fetch('/api/downloads/action/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadTaskId: task.id,
        }),
      })

      if (sendRes.ok) {
        const sendData = await sendRes.json()
        if (sendData.success) {
          toast({ title: '下载已开始', description: sendData.message })
        } else {
          toast({ title: '发送失败', description: sendData.message, variant: 'destructive' })
        }
      } else {
        const errData = await sendRes.json()
        toast({ title: '发送到客户端失败', description: errData.error || '请检查下载客户端配置', variant: 'destructive' })
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'destructive' })
    }
  }

  // Filter and sort
  let filtered = [...results]
  if (qualityFilter !== 'all') {
    filtered = filtered.filter(r => {
      const p = parseReleaseQuality(r.title)
      return p.resolution === qualityFilter || p.quality?.includes(qualityFilter)
    })
  }
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'seeders': return (b.seeders || 0) - (a.seeders || 0)
      case 'size': return (b.size || 0) - (a.size || 0)
      case 'date': return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      default: return 0
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">搜索</h2>
        <p className="text-muted-foreground mt-1">跨索引器搜索影视资源，自动聚合排序</p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="输入影视名称搜索...（支持中文名）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            className="pl-10 h-12 text-base"
          />
        </div>
        <Button onClick={doSearch} disabled={loading} size="lg" className="px-8">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
          搜索
        </Button>
      </div>

      {/* Filters */}
      {results.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>筛选：</span>
          </div>
          <Select value={qualityFilter} onValueChange={setQualityFilter}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue placeholder="画质" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部画质</SelectItem>
              <SelectItem value="2160p">4K</SelectItem>
              <SelectItem value="1080p">1080P</SelectItem>
              <SelectItem value="720p">720P</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 h-8">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seeders">做种数</SelectItem>
              <SelectItem value="size">文件大小</SelectItem>
              <SelectItem value="date">发布时间</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            共 {filtered.length} 条结果
          </span>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 && query ? (
        <div className="text-center py-16">
          <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">未找到结果</p>
          <p className="text-sm text-muted-foreground/70 mt-1">尝试不同的关键词或检查索引器配置</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">搜索影视资源</p>
          <p className="text-sm text-muted-foreground/70 mt-1">输入中文或英文片名，自动搜索所有已配置的索引器</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((result, i) => {
            const parsed = parseReleaseQuality(result.title)
            return (
              <Card key={`${result.infoHash || i}`} className="shadow-sm border-0 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-all">{result.title}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {parsed.quality && (
                          <Badge variant="secondary" className="text-[10px] h-5">{parsed.quality}</Badge>
                        )}
                        {parsed.codec && (
                          <Badge variant="outline" className="text-[10px] h-5">{parsed.codec}</Badge>
                        )}
                        {parsed.source && (
                          <Badge variant="outline" className="text-[10px] h-5">{parsed.source}</Badge>
                        )}
                        {parsed.hasChineseSub && (
                          <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 border-emerald-200">中字</Badge>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />{formatSize(result.size)}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />{result.seeders}↑ {result.leechers}↓
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(result.publishDate).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        来源：{result.indexerName}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button size="sm" onClick={() => addDownload(result)}>
                        <Download className="w-3.5 h-3.5 mr-1" /> 下载
                      </Button>
                      {result.magnetUrl && (
                        <Button size="sm" variant="outline" onClick={() => copyMagnet(result.magnetUrl)}>
                          <Copy className="w-3.5 h-3.5 mr-1" /> 磁力
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
