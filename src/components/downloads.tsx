'use client'

import { useState, useEffect, useCallback } from 'react'
import { DownloadTask, formatSize, formatSpeed, STATUS_MAP } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Download, Trash2, Play, CheckCircle, XCircle,
  Clock, ArrowDown, ArrowUp, HardDrive, Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function Downloads() {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const { toast } = useToast()

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/downloads')
      if (res.ok) {
        const data = await res.json()
        setTasks(Array.isArray(data) ? data : [])
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let syncCounter = 0

    const run = async (signal: AbortSignal) => {
      try {
        // Sync progress from download clients every 3rd refresh (every 15s)
        syncCounter++
        if (syncCounter % 3 === 1) {
          await fetch('/api/downloads/action/sync', {
            method: 'POST',
            signal,
          }).catch(() => {})
        }

        const res = await fetch('/api/downloads', { signal })
        if (res.ok) {
          const data = await res.json()
          setTasks(Array.isArray(data) ? data : [])
        }
      } catch {}
      setLoading(false)
    }

    run(controller.signal)
    const interval = setInterval(() => run(controller.signal), 5000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  const deleteTask = async (id: string) => {
    try {
      const res = await fetch(`/api/downloads/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: '已删除' })
        setTasks(prev => prev.filter(t => t.id !== id))
      } else {
        const data = await res.json()
        toast({ title: '删除失败', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: '删除失败', description: '网络错误', variant: 'destructive' })
    }
  }

  const activeTasks = tasks.filter(t => ['pending', 'downloading', 'queued'].includes(t.status))
  const historyTasks = tasks.filter(t => ['completed', 'failed', 'imported'].includes(t.status))

  const renderTask = (task: DownloadTask) => (
    <Card key={task.id} className="shadow-sm border-0">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            task.status === 'downloading' ? 'bg-sky-100' :
            task.status === 'completed' || task.status === 'imported' ? 'bg-emerald-100' :
            task.status === 'failed' ? 'bg-red-100' : 'bg-amber-100'
          }`}>
            {task.status === 'downloading' ? <Download className="w-5 h-5 text-sky-600" /> :
             task.status === 'completed' || task.status === 'imported' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> :
             task.status === 'failed' ? <XCircle className="w-5 h-5 text-red-600" /> :
             <Clock className="w-5 h-5 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{task.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={`text-[10px] px-1.5 py-0 h-5 border-0 ${STATUS_MAP[task.status]?.bgColor} ${STATUS_MAP[task.status]?.color}`}>
                {STATUS_MAP[task.status]?.label || task.status}
              </Badge>
              {task.quality && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{task.quality}</Badge>}
              {task.hasChineseSub && <Badge className="text-[10px] px-1 py-0 h-4 bg-emerald-100 text-emerald-700 border-emerald-200">中字</Badge>}
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <HardDrive className="w-3 h-3" />{formatSize(task.size)}
              </span>
              {task.indexer && (
                <span className="text-xs text-muted-foreground">
                  来源: {task.indexer.name}
                </span>
              )}
            </div>
            {/* Progress bar for active downloads */}
            {['downloading', 'pending', 'queued'].includes(task.status) && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{(task.progress * 100).toFixed(1)}%</span>
                  <div className="flex items-center gap-2">
                    {task.downloadSpeed ? (
                      <span className="flex items-center gap-0.5"><ArrowDown className="w-3 h-3 text-sky-500" />{formatSpeed(task.downloadSpeed)}</span>
                    ) : null}
                    {task.uploadSpeed ? (
                      <span className="flex items-center gap-0.5"><ArrowUp className="w-3 h-3 text-emerald-500" />{formatSpeed(task.uploadSpeed)}</span>
                    ) : null}
                    {task.seeders !== undefined && (
                      <span>做种: {task.seeders}</span>
                    )}
                  </div>
                </div>
                <Progress value={task.progress * 100} className="h-1.5" />
              </div>
            )}
            {task.errorMessage && (
              <p className="text-xs text-red-500 mt-1">{task.errorMessage}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)} className="flex-shrink-0">
            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">下载</h2>
          <p className="text-muted-foreground mt-1">管理下载任务，监控下载进度</p>
        </div>
        <Button onClick={loadTasks} variant="outline" size="sm">
          <Loader2 className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active" className="gap-1">
            下载中 <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">{activeTasks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            历史 <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">{historyTasks.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : activeTasks.length === 0 ? (
            <div className="text-center py-16">
              <Download className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">没有正在下载的任务</p>
              <p className="text-sm text-muted-foreground/70 mt-1">在搜索页找到资源后点击下载</p>
            </div>
          ) : (
            <div className="space-y-2">{activeTasks.map(renderTask)}</div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : historyTasks.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">暂无历史记录</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar">
              {historyTasks.map(renderTask)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
