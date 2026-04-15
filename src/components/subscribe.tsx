'use client'

import { useState, useEffect } from 'react'
import { Subscription, STATUS_MAP } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Bell, Plus, Trash2, RefreshCw, Rss, Film, Tv, Globe,
  Loader2, Clock, CheckCircle, Search as SearchIcon
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

export function Subscribe() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ keyword: '', type: 'movie' as const, autoSearch: true, autoDownload: false })
  const [adding, setAdding] = useState(false)
  const { setCurrentPage } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    const controller = new AbortController()
    const run = async (signal: AbortSignal) => {
      setLoading(true)
      try {
        const res = await fetch('/api/subscriptions', { signal })
        if (res.ok) {
          const data = await res.json()
          setSubs(Array.isArray(data) ? data : [])
        }
      } catch {}
      setLoading(false)
    }
    run(controller.signal)
    return () => controller.abort()
  }, [])

  const refreshSubs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/subscriptions')
      if (res.ok) {
        const data = await res.json()
        setSubs(Array.isArray(data) ? data : [])
      }
    } catch {}
    setLoading(false)
  }

  const addSub = async () => {
    setAdding(true)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (res.ok) {
        toast({ title: '订阅已创建' })
        setShowAdd(false)
        refreshSubs()
      } else {
        const data = await res.json()
        toast({ title: '创建失败', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: '创建失败', variant: 'destructive' })
    }
    setAdding(false)
  }

  const deleteSub = async (id: string) => {
    try {
      const res = await fetch(`/api/subscriptions?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: '已删除' })
        setSubs(prev => prev.filter(s => s.id !== id))
      }
    } catch {}
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">订阅</h2>
          <p className="text-muted-foreground mt-1">管理影视订阅，自动追新片新剧</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-2" /> 新建订阅
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : subs.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">暂无订阅</p>
          <p className="text-sm text-muted-foreground/70 mt-1">创建订阅后，系统将自动监控并搜索新资源</p>
          <Button className="mt-4" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> 创建第一个订阅
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {subs.map(sub => (
            <Card key={sub.id} className="shadow-sm border-0">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${sub.type === 'movie' ? 'bg-orange-100' : 'bg-violet-100'}`}>
                  {sub.type === 'movie' ? <Film className="w-5 h-5 text-orange-600" /> : <Tv className="w-5 h-5 text-violet-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{sub.keyword || `TMDB#${sub.tmdbId}`}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                      {sub.type === 'movie' ? '电影' : sub.type === 'tv' ? '剧集' : sub.type === 'douban' ? '豆瓣' : 'RSS'}
                    </Badge>
                    {sub.enabled ? (
                      <Badge className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 text-emerald-700 border-emerald-200">活跃</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">暂停</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {sub.autoSearch && <span className="flex items-center gap-0.5"><SearchIcon className="w-3 h-3" />自动搜索</span>}
                    {sub.autoDownload && <span className="flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />自动下载</span>}
                    {sub.lastCheckAt && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        上次检查: {new Date(sub.lastCheckAt).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => {
                    fetch(`/api/subscriptions/check?id=${sub.id}`, { method: 'POST' })
                      .then(() => toast({ title: '检查中...' }))
                  }}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteSub(sub.id)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建订阅</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>关键词</Label>
              <Input
                placeholder="输入影视名称..."
                value={addForm.keyword}
                onChange={(e) => setAddForm(f => ({ ...f, keyword: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={addForm.type} onValueChange={(v) => setAddForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">🎬 电影</SelectItem>
                  <SelectItem value="tv">📺 剧集</SelectItem>
                  <SelectItem value="douban">🅰️ 豆瓣想看</SelectItem>
                  <SelectItem value="rss">📡 RSS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>自动搜索</Label>
              <Switch
                checked={addForm.autoSearch}
                onCheckedChange={(v) => setAddForm(f => ({ ...f, autoSearch: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>自动下载</Label>
              <Switch
                checked={addForm.autoDownload}
                onCheckedChange={(v) => setAddForm(f => ({ ...f, autoDownload: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={addSub} disabled={adding || !addForm.keyword}>
              {adding && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
