'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Stats, STATUS_MAP } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Film, CheckCircle, Eye, Download, Tv, Server, Bell,
  TrendingUp, HardDrive
} from 'lucide-react'

export function Dashboard() {
  const { setCurrentPage } = useAppStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentDownloads, setRecentDownloads] = useState<any[]>([])

  // Fetch stats
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/stats')
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch {}
      try {
        const res = await fetch('/api/downloads?limit=5')
        if (res.ok) {
          const data = await res.json()
          setRecentDownloads(Array.isArray(data) ? data : [])
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const statCards = [
    { label: '总影视数', value: stats?.totalMedia || 0, icon: Film, color: 'from-emerald-500 to-teal-500', page: 'library' as const },
    { label: '电影', value: stats?.totalMovies || 0, icon: Film, color: 'from-orange-500 to-amber-500', page: 'library' as const },
    { label: '剧集', value: stats?.totalTvShows || 0, icon: Tv, color: 'from-violet-500 to-purple-500', page: 'library' as const },
    { label: '已下载', value: stats?.downloaded || 0, icon: CheckCircle, color: 'from-green-500 to-emerald-500', page: 'library' as const },
    { label: '监控中', value: stats?.monitored || 0, icon: Eye, color: 'from-sky-500 to-cyan-500', page: 'subscribe' as const },
    { label: '下载中', value: stats?.downloading || 0, icon: Download, color: 'from-blue-500 to-indigo-500', page: 'downloads' as const },
    { label: '索引器', value: stats?.enabledIndexers || 0, icon: Server, color: 'from-rose-500 to-pink-500', page: 'indexers' as const },
    { label: '订阅', value: stats?.subscriptionCount || 0, icon: Bell, color: 'from-yellow-500 to-orange-500', page: 'subscribe' as const },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">仪表盘</h2>
        <p className="text-muted-foreground mt-1">MediaHub-CN 影视管理系统概览</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card
              key={card.label}
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border-0 shadow-sm overflow-hidden group"
              onClick={() => setCurrentPage(card.page)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                    {loading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold mt-1">{card.value}</p>
                    )}
                  </div>
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Downloads */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-semibold">最近下载</h3>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentDownloads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Download className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无下载记录</p>
                <p className="text-xs mt-1">添加影视后即可开始下载</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentDownloads.map((dl: any) => (
                  <div key={dl.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{dl.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {dl.quality && <span className="mr-2">{dl.quality}</span>}
                        {dl.indexer?.name && <span>来源: {dl.indexer.name}</span>}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_MAP[dl.status]?.bgColor || 'bg-slate-100'} ${STATUS_MAP[dl.status]?.color || 'text-slate-600'}`}>
                      {STATUS_MAP[dl.status]?.label || dl.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <HardDrive className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-semibold">快速操作</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCurrentPage('search')}
                className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 transition-all duration-200 text-left group"
              >
                <p className="font-semibold text-emerald-800">🔍 搜索影视</p>
                <p className="text-xs text-emerald-600 mt-1">跨索引器搜索资源</p>
              </button>
              <button
                onClick={() => setCurrentPage('indexers')}
                className="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-all duration-200 text-left"
              >
                <p className="font-semibold text-orange-800">🌐 配置索引器</p>
                <p className="text-xs text-orange-600 mt-1">添加PT站点</p>
              </button>
              <button
                onClick={() => setCurrentPage('discover')}
                className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 transition-all duration-200 text-left"
              >
                <p className="font-semibold text-violet-800">🎬 发现新片</p>
                <p className="text-xs text-violet-600 mt-1">浏览热门影视</p>
              </button>
              <button
                onClick={() => setCurrentPage('settings')}
                className="p-4 rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 hover:from-sky-100 hover:to-cyan-100 transition-all duration-200 text-left"
              >
                <p className="font-semibold text-sky-800">⚙️ 系统设置</p>
                <p className="text-xs text-sky-600 mt-1">下载客户端/刮削</p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
