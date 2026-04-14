'use client'

import { useEffect, useState, useCallback } from 'react'
import { Settings as SettingsIcon, Save, Plus, Trash2, Loader2, Server, Info, Key, FolderOpen, RefreshCw, Bell, Activity, Play, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DownloadClient } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface OrganizeSettings {
  movieLibraryPath: string
  tvLibraryPath: string
  organizeMode: string
}

interface NotificationChannel {
  id: string
  name: string
  type: 'wechat' | 'webhook' | 'telegram' | 'bark'
  enabled: boolean
  config: string
  events: string
  createdAt: string
}

interface SystemStatus {
  status: string
  version: string
  uptime: { formatted: string }
  database: { status: string; latencyMs: number }
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number; usagePercent: number }
  stats: Record<string, number>
  clients: Array<{ name: string; type: string; status: string }>
}

interface ScheduledTask {
  id: string
  name: string
  type: string
  enabled: boolean
  intervalMinutes: number
  lastRunAt: string | null
  nextRunAt: string | null
  lastStatus: string | null
}

const defaultClient: Partial<DownloadClient> = {
  name: '',
  enabled: true,
  type: 'qbittorrent',
  host: 'localhost',
  port: 8080,
  username: '',
  password: '',
  baseUrl: '',
  category: '',
  directory: '',
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  webhook: 'Webhook',
  wechat: '企业微信',
  telegram: 'Telegram',
  bark: 'Bark',
}

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  webhook: '🔗',
  wechat: '💬',
  telegram: '✈️',
  bark: '🐕',
}

const EVENT_OPTIONS = [
  { value: 'download_start', label: '下载开始' },
  { value: 'download_complete', label: '下载完成' },
  { value: 'download_fail', label: '下载失败' },
  { value: 'organize_complete', label: '整理完成' },
  { value: 'new_media', label: '新媒体入库' },
  { value: 'search_fail', label: '搜索失败' },
  { value: 'health_alert', label: '系统告警' },
  { value: '*', label: '全部事件' },
]

interface AppSettings {
  tmdbApiKey?: string
  defaultQualityProfile?: string
  defaultDownloadPath?: string
  autoSearch?: boolean
  autoDownload?: boolean
  indexerSyncInterval?: number
  doubanCookie?: string
  proxyHost?: string
  movieLibraryPath?: string
  tvLibraryPath?: string
  organizeMode?: string
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>({})
  const [clients, setClients] = useState<DownloadClient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [clientForm, setClientForm] = useState<Partial<DownloadClient>>({ ...defaultClient })
  const [clientSaving, setClientSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [doubanTesting, setDoubanTesting] = useState(false)
  const [organizeSettings, setOrganizeSettings] = useState<OrganizeSettings>({ movieLibraryPath: '/media/movies', tvLibraryPath: '/media/tv', organizeMode: 'hardlink' })

  // 通知相关状态
  const [notifications, setNotifications] = useState<NotificationChannel[]>([])
  const [addNotifOpen, setAddNotifOpen] = useState(false)
  const [notifForm, setNotifForm] = useState({
    name: '',
    type: 'webhook' as NotificationChannel['type'],
    enabled: true,
    config: {} as Record<string, string>,
    events: ['download_complete', 'download_fail'] as string[],
  })
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifTesting, setNotifTesting] = useState<string | null>(null)
  const [notifDeleting, setNotifDeleting] = useState<string | null>(null)

  // 系统状态
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [runningTask, setRunningTask] = useState<string | null>(null)

  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, clientsRes, organizeRes, notifRes, statusRes, tasksRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/download-clients'),
        fetch('/api/organize'),
        fetch('/api/notifications'),
        fetch('/api/system/status').catch(() => null),
        fetch('/api/system/tasks').catch(() => null),
      ])
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        if (Array.isArray(data)) {
          const obj: Record<string, string> = {}
          for (const item of data) { obj[item.key] = item.value }
          setSettings({
            tmdbApiKey: obj.tmdb_api_key,
            defaultQualityProfile: obj.default_quality_profile,
            defaultDownloadPath: obj.default_download_path,
            autoSearch: obj.auto_search === 'true',
            autoDownload: obj.auto_download === 'true',
            indexerSyncInterval: parseInt(obj.indexer_sync_interval || '60'),
            doubanCookie: obj.douban_cookie,
            proxyHost: obj.proxy_host,
            movieLibraryPath: obj.movie_library_path,
            tvLibraryPath: obj.tv_library_path,
            organizeMode: obj.organize_mode,
          })
        }
      }
      if (clientsRes.ok) {
        const data = await clientsRes.json()
        setClients(Array.isArray(data) ? data : [])
      }
      if (organizeRes.ok) {
        const data = await organizeRes.json()
        setOrganizeSettings({
          movieLibraryPath: data.movieLibraryPath || '/media/movies',
          tvLibraryPath: data.tvLibraryPath || '/media/tv',
          organizeMode: data.organizeMode || 'hardlink',
        })
      }
      if (notifRes.ok) {
        const data = await notifRes.json()
        setNotifications(Array.isArray(data) ? data : [])
      }
      if (statusRes?.ok) {
        setSystemStatus(await statusRes.json())
      }
      if (tasksRes?.ok) {
        setTasks(await tasksRes.json())
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const saveSettings = async () => {
    setSaving(true)
    try {
      await Promise.all([
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdb_api_key: settings.tmdbApiKey,
            default_quality_profile: settings.defaultQualityProfile,
            default_download_path: settings.defaultDownloadPath,
            auto_search: String(settings.autoSearch ?? false),
            auto_download: String(settings.autoDownload ?? false),
            indexer_sync_interval: String(settings.indexerSyncInterval ?? 60),
            douban_cookie: settings.doubanCookie,
            proxy_host: settings.proxyHost,
          }),
        }),
        fetch('/api/organize', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(organizeSettings),
        }),
      ])
      toast({ title: '设置已保存' })
    } catch {
      toast({ title: '保存失败', variant: 'destructive' })
    }
    setSaving(false)
  }

  const testDouban = async () => {
    setDoubanTesting(true)
    try {
      const res = await fetch('/api/scrape/douban?q=test')
      if (res.ok) {
        const data = await res.json()
        if (data.needsCookie) {
          toast({ title: '需要Cookie', description: '豆瓣需要Cookie才能访问，请先配置', variant: 'destructive' })
        } else if (data.error) {
          toast({ title: '连接失败', description: data.error, variant: 'destructive' })
        } else {
          toast({ title: '豆瓣连接正常', description: `找到 ${data.results?.length || 0} 条结果` })
        }
      } else {
        toast({ title: '连接失败', description: `HTTP ${res.status}`, variant: 'destructive' })
      }
    } catch {
      toast({ title: '测试失败', variant: 'destructive' })
    }
    setDoubanTesting(false)
  }

  const addClient = async () => {
    if (!clientForm.name || !clientForm.host) {
      toast({ title: '请填写必填字段', variant: 'destructive' })
      return
    }
    setClientSaving(true)
    try {
      const res = await fetch('/api/download-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientForm),
      })
      if (res.ok) {
        toast({ title: '添加成功' })
        setAddClientOpen(false)
        setClientForm({ ...defaultClient })
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: '添加失败', description: err.error ?? '', variant: 'destructive' })
      }
    } catch {
      toast({ title: '添加失败', variant: 'destructive' })
    }
    setClientSaving(false)
  }

  const testClient = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/download-clients/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: '连接成功', description: data.message })
      } else {
        toast({ title: '连接失败', description: data.message ?? data.error, variant: 'destructive' })
      }
      fetchData()
    } catch {
      toast({ title: '测试失败', description: '网络错误', variant: 'destructive' })
    }
    setTesting(null)
  }

  const deleteClient = async (id: string) => {
    try {
      const res = await fetch(`/api/download-clients/${id}`, { method: 'DELETE' })
      if (res.ok) { toast({ title: '已删除' }); fetchData() }
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  // === 通知管理 ===
  const getNotifConfigFields = (type: string) => {
    switch (type) {
      case 'webhook': return [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.example.com/...' }]
      case 'wechat': return [
        { key: 'corp_id', label: '企业ID', placeholder: 'ww...' },
        { key: 'agent_id', label: 'Agent ID', placeholder: '1000002' },
        { key: 'secret', label: 'Secret', placeholder: '应用Secret' },
      ]
      case 'telegram': return [
        { key: 'bot_token', label: 'Bot Token', placeholder: '123456:ABC-DEF...' },
        { key: 'chat_id', label: 'Chat ID', placeholder: '-100123456789' },
      ]
      case 'bark': return [
        { key: 'server_url', label: 'Bark 服务器', placeholder: 'https://api.day.app' },
        { key: 'device_key', label: '设备 Key', placeholder: '设备推送Key' },
      ]
      default: return []
    }
  }

  const addNotification = async () => {
    if (!notifForm.name) {
      toast({ title: '请填写名称', variant: 'destructive' })
      return
    }
    const fields = getNotifConfigFields(notifForm.type)
    const missing = fields.filter((f) => !notifForm.config[f.key])
    if (missing.length > 0) {
      toast({ title: `请填写: ${missing.map((m) => m.label).join(', ')}`, variant: 'destructive' })
      return
    }
    setNotifSaving(true)
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: notifForm.name,
          type: notifForm.type,
          enabled: notifForm.enabled,
          config: notifForm.config,
          events: notifForm.events,
        }),
      })
      if (res.ok) {
        toast({ title: '通知渠道已添加' })
        setAddNotifOpen(false)
        setNotifForm({ name: '', type: 'webhook', enabled: true, config: {}, events: ['download_complete', 'download_fail'] })
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: '添加失败', description: err.error ?? '', variant: 'destructive' })
      }
    } catch {
      toast({ title: '添加失败', variant: 'destructive' })
    }
    setNotifSaving(false)
  }

  const testNotification = async (id: string) => {
    setNotifTesting(id)
    try {
      const res = await fetch(`/api/notifications/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast({ title: '测试成功', description: data.message })
      } else {
        toast({ title: '测试失败', description: data.message ?? data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: '测试失败', variant: 'destructive' })
    }
    setNotifTesting(null)
  }

  const deleteNotification = async (id: string) => {
    setNotifDeleting(id)
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
      if (res.ok) { toast({ title: '已删除' }); fetchData() }
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
    setNotifDeleting(null)
  }

  const toggleNotifEnabled = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      fetchData()
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  // === 定时任务 ===
  const runTask = async (taskId: string) => {
    setRunningTask(taskId)
    try {
      const res = await fetch('/api/system/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      if (res.ok) {
        toast({ title: '任务已执行' })
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: '执行失败', description: err.error ?? '', variant: 'destructive' })
      }
    } catch {
      toast({ title: '执行失败', variant: 'destructive' })
    }
    setRunningTask(null)
  }

  const toggleTask = async (taskId: string, enabled: boolean) => {
    try {
      await fetch('/api/system/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, enabled }),
      })
      fetchData()
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  const refreshSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status')
      if (res.ok) setSystemStatus(await res.json())
    } catch {
      // silent
    }
  }

  const clientTypeLabels: Record<string, string> = {
    qbittorrent: 'qBittorrent',
    transmission: 'Transmission',
    deluge: 'Deluge',
  }

  const configFields = getNotifConfigFields(notifForm.type)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">设置</h2>
        <p className="text-muted-foreground">系统配置、通知推送和下载客户端管理</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">通用</TabsTrigger>
          <TabsTrigger value="download">下载</TabsTrigger>
          <TabsTrigger value="notify">通知</TabsTrigger>
          <TabsTrigger value="system">系统</TabsTrigger>
          <TabsTrigger value="tasks">任务</TabsTrigger>
        </TabsList>

        {/* === 通用设置 === */}
        <TabsContent value="general" className="space-y-6 mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><SettingsIcon className="h-4 w-4" />通用设置</CardTitle>
              <CardDescription>配置 TMDB API、豆瓣刮削和默认行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Key className="h-3 w-3" />TMDB API Key</Label>
                    <Input type="password" value={settings.tmdbApiKey ?? ''} onChange={(e) => setSettings({ ...settings, tmdbApiKey: e.target.value })} placeholder="输入TMDB API密钥" />
                    <p className="text-[11px] text-muted-foreground">用于搜索影视信息和获取海报，可在 themoviedb.org 免费申请</p>
                  </div>
                  <div className="space-y-2">
                    <Label>豆瓣 Cookie（可选）</Label>
                    <div className="flex gap-2">
                      <Input type="password" value={settings.doubanCookie ?? ''} onChange={(e) => setSettings({ ...settings, doubanCookie: e.target.value })} placeholder="用于豆瓣刮削" className="flex-1" />
                      <Button size="sm" variant="outline" disabled={doubanTesting} onClick={testDouban}>
                        {doubanTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">用于获取豆瓣评分和中文简介，非必需。点击测试按钮验证连接</p>
                  </div>
                  <div className="space-y-2">
                    <Label>代理地址（可选）</Label>
                    <Input value={settings.proxyHost ?? ''} onChange={(e) => setSettings({ ...settings, proxyHost: e.target.value })} placeholder="http://proxy:7890" />
                    <p className="text-[11px] text-muted-foreground">用于访问 TMDB 等国外 API</p>
                  </div>
                  <div className="space-y-2">
                    <Label>默认画质配置</Label>
                    <Select value={settings.defaultQualityProfile ?? 'any'} onValueChange={(v) => setSettings({ ...settings, defaultQualityProfile: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">任意画质</SelectItem>
                        <SelectItem value="4k">4K Ultra HD</SelectItem>
                        <SelectItem value="1080p">1080P Full HD</SelectItem>
                        <SelectItem value="720p">720P HD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />默认下载路径</Label>
                    <Input value={settings.defaultDownloadPath ?? ''} onChange={(e) => setSettings({ ...settings, defaultDownloadPath: e.target.value })} placeholder="/downloads/movies" />
                  </div>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch checked={settings.autoSearch ?? false} onCheckedChange={(v) => setSettings({ ...settings, autoSearch: v })} />
                      <Label className="text-sm">自动搜索</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={settings.autoDownload ?? false} onCheckedChange={(v) => setSettings({ ...settings, autoDownload: v })} />
                      <Label className="text-sm">自动下载</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>文件整理</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">电影库路径</p>
                        <Input value={organizeSettings.movieLibraryPath} onChange={(e) => setOrganizeSettings({ ...organizeSettings, movieLibraryPath: e.target.value })} placeholder="/media/movies" />
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">剧集库路径</p>
                        <Input value={organizeSettings.tvLibraryPath} onChange={(e) => setOrganizeSettings({ ...organizeSettings, tvLibraryPath: e.target.value })} placeholder="/media/tv" />
                      </div>
                    </div>
                    <Select value={organizeSettings.organizeMode} onValueChange={(v) => setOrganizeSettings({ ...organizeSettings, organizeMode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hardlink">硬链接（推荐，NAS省空间）</SelectItem>
                        <SelectItem value="copy">复制</SelectItem>
                        <SelectItem value="move">移动</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveSettings} disabled={saving} className="bg-gradient-to-r from-emerald-600 to-teal-600">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}保存设置
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 下载客户端 === */}
        <TabsContent value="download" className="space-y-6 mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4" />下载客户端</CardTitle>
                  <CardDescription>配置 qBittorrent、Transmission 或 Deluge</CardDescription>
                </div>
                <Button size="sm" onClick={() => setAddClientOpen(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600">
                  <Plus className="h-3.5 w-3.5 mr-1" />添加客户端
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : clients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Server className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">暂无下载客户端</p>
                  <p className="text-xs mt-1">添加下载客户端以开始下载资源</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', client.enabled ? 'bg-emerald-100' : 'bg-muted')}>
                          <Server className={cn('h-4 w-4', client.enabled ? 'text-emerald-600' : 'text-muted-foreground')} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{client.name}</p>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{clientTypeLabels[client.type] ?? client.type}</Badge>
                            {client.testStatus === 'success' && <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-0">已连接</Badge>}
                            {client.testStatus === 'fail' && <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-0">连接失败</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{client.host}:{client.port}{client.directory && ` · ${client.directory}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={testing === client.id} onClick={() => testClient(client.id)}>
                          {testing === client.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '测试'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteClient(client.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 通知推送 === */}
        <TabsContent value="notify" className="space-y-6 mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" />通知推送</CardTitle>
                  <CardDescription>配置下载完成、整理完成等事件的通知渠道</CardDescription>
                </div>
                <Button size="sm" onClick={() => setAddNotifOpen(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600">
                  <Plus className="h-3.5 w-3.5 mr-1" />添加通知
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">暂无通知渠道</p>
                  <p className="text-xs mt-1">添加通知渠道以接收下载和整理事件推送</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => {
                    const parsedEvents = n.events.split(',').map((e) => e.trim())
                    const eventLabels = parsedEvents.map((e) => EVENT_OPTIONS.find((o) => o.value === e)?.label || e)
                    return (
                      <div key={n.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-lg', n.enabled ? 'bg-blue-100' : 'bg-muted')}>
                            {NOTIFICATION_TYPE_ICONS[n.type] || '🔗'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{n.name}</p>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{NOTIFICATION_TYPE_LABELS[n.type]}</Badge>
                              {n.enabled ? <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-0">启用</Badge> : <Badge className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 border-0">禁用</Badge>}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">事件: {eventLabels.join(', ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleNotifEnabled(n.id, !n.enabled)}>
                            <Switch checked={n.enabled} className="h-4 w-7" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={notifTesting === n.id} onClick={() => testNotification(n.id)}>
                            {notifTesting === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '测试'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={notifDeleting === n.id} onClick={() => deleteNotification(n.id)}>
                            {notifDeleting === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 系统状态 === */}
        <TabsContent value="system" className="space-y-6 mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />系统状态</CardTitle>
                  <CardDescription>实时系统运行状况</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={refreshSystemStatus}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!systemStatus ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <div className="space-y-4">
                  {/* 核心状态 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-[11px] text-muted-foreground">运行时间</p>
                      <p className="text-lg font-semibold">{systemStatus.uptime.formatted}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-[11px] text-muted-foreground">数据库</p>
                      <div className="flex items-center gap-1.5">
                        {systemStatus.database.status === 'healthy' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                        <span className="text-sm font-medium">{systemStatus.database.status === 'healthy' ? '正常' : '异常'}</span>
                        <span className="text-[11px] text-muted-foreground">({systemStatus.database.latencyMs}ms)</span>
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-[11px] text-muted-foreground">内存使用</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-semibold">{systemStatus.memory.heapUsedMB}</span>
                        <span className="text-xs text-muted-foreground">/ {systemStatus.memory.heapTotalMB} MB</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', systemStatus.memory.usagePercent > 80 ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${systemStatus.memory.usagePercent}%` }} />
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-[11px] text-muted-foreground">响应时间</p>
                      <p className="text-lg font-semibold">{systemStatus.responseTimeMs}ms</p>
                    </div>
                  </div>

                  {/* 统计概览 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '媒体库', value: systemStatus.stats.mediaItems ?? 0 },
                      { label: '下载中', value: systemStatus.stats.downloading ?? 0 },
                      { label: '监控中', value: systemStatus.stats.monitored ?? 0 },
                      { label: '索引器', value: `${systemStatus.stats.enabledIndexers ?? 0}/${systemStatus.stats.indexers ?? 0}` },
                      { label: '订阅', value: systemStatus.stats.activeSubscriptions ?? 0 },
                      { label: '通知', value: systemStatus.stats.notifications ?? 0 },
                    ].map((item) => (
                      <div key={item.label} className="text-center rounded-lg border p-2.5">
                        <p className="text-[11px] text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-semibold">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* 下载客户端状态 */}
                  {(systemStatus.clients ?? []).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">下载客户端状态</p>
                      <div className="space-y-1.5">
                        {systemStatus.clients.map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-sm rounded-md border px-3 py-2">
                            <div className="flex items-center gap-2">
                              {c.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : c.status === 'fail' ? <XCircle className="h-3.5 w-3.5 text-red-500" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span>{c.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1">{c.type}</Badge>
                            </div>
                            <span className={cn('text-[11px]', c.status === 'success' ? 'text-green-600' : c.status === 'fail' ? 'text-red-600' : 'text-muted-foreground')}>
                              {c.status === 'success' ? '已连接' : c.status === 'fail' ? '连接失败' : '未测试'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Info className="h-4 w-4" />系统信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">应用版本</span><span>MediaHub-CN v1.0.0</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">运行环境</span><span>Next.js 16 + TypeScript</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">数据库</span><span>SQLite (Prisma)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">下载客户端</span><span>{clients.length} 个</span></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 定时任务 === */}
        <TabsContent value="tasks" className="space-y-6 mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />定时任务</CardTitle>
              <CardDescription>管理自动化定时任务</CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', task.enabled ? 'bg-emerald-100' : 'bg-muted')}>
                          <Activity className={cn('h-4 w-4', task.enabled ? 'text-emerald-600' : 'text-muted-foreground')} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{task.name}</p>
                            {task.enabled ? <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-0">启用</Badge> : <Badge className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 border-0">禁用</Badge>}
                            {task.lastStatus === 'success' && task.lastRunAt && <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-0">上次成功</Badge>}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            间隔: {task.intervalMinutes}分钟
                            {task.lastRunAt && ` · 上次: ${new Date(task.lastRunAt).toLocaleString('zh-CN')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleTask(task.id, !task.enabled)}>
                          <Switch checked={task.enabled} className="h-4 w-7" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={runningTask === task.id} onClick={() => runTask(task.id)}>
                          {runningTask === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-0.5" />}
                          运行
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Client Dialog */}
      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加下载客户端</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>名称 *</Label><Input value={clientForm.name ?? ''} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} placeholder="客户端名称" /></div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={clientForm.type} onValueChange={(v) => setClientForm({ ...clientForm, type: v as DownloadClient['type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qbittorrent">qBittorrent</SelectItem>
                  <SelectItem value="transmission">Transmission</SelectItem>
                  <SelectItem value="deluge">Deluge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2"><Label>地址 *</Label><Input value={clientForm.host ?? ''} onChange={(e) => setClientForm({ ...clientForm, host: e.target.value })} placeholder="localhost" /></div>
              <div className="space-y-2"><Label>端口</Label><Input type="number" value={clientForm.port ?? 8080} onChange={(e) => setClientForm({ ...clientForm, port: parseInt(e.target.value) || 8080 })} /></div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2"><Label>用户名</Label><Input value={clientForm.username ?? ''} onChange={(e) => setClientForm({ ...clientForm, username: e.target.value })} placeholder="admin" /></div>
              <div className="space-y-2"><Label>密码</Label><Input type="password" value={clientForm.password ?? ''} onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>下载目录</Label><Input value={clientForm.directory ?? ''} onChange={(e) => setClientForm({ ...clientForm, directory: e.target.value })} placeholder="/downloads" /></div>
            <div className="flex items-center gap-2"><Switch checked={clientForm.enabled ?? true} onCheckedChange={(v) => setClientForm({ ...clientForm, enabled: v })} /><Label className="text-sm">启用</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddClientOpen(false)}>取消</Button>
            <Button onClick={addClient} disabled={clientSaving} className="bg-gradient-to-r from-emerald-600 to-teal-600">
              {clientSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Notification Dialog */}
      <Dialog open={addNotifOpen} onOpenChange={setAddNotifOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加通知渠道</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称 *</Label>
              <Input value={notifForm.name} onChange={(e) => setNotifForm({ ...notifForm, name: e.target.value })} placeholder="例如: 家庭群通知" />
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={notifForm.type} onValueChange={(v) => setNotifForm({ ...notifForm, type: v as NotificationChannel['type'], config: {} })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(NOTIFICATION_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {configFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input
                  value={notifForm.config[field.key] ?? ''}
                  onChange={(e) => setNotifForm({ ...notifForm, config: { ...notifForm.config, [field.key]: e.target.value } })}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label>触发事件</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {EVENT_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 cursor-pointer hover:bg-accent/50">
                    <input
                      type="checkbox"
                      checked={notifForm.events.includes(opt.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNotifForm({ ...notifForm, events: [...notifForm.events, opt.value] })
                        } else {
                          setNotifForm({ ...notifForm, events: notifForm.events.filter((ev) => ev !== opt.value) })
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-xs">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={notifForm.enabled} onCheckedChange={(v) => setNotifForm({ ...notifForm, enabled: v })} />
              <Label className="text-sm">启用</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNotifOpen(false)}>取消</Button>
            <Button onClick={addNotification} disabled={notifSaving} className="bg-gradient-to-r from-emerald-600 to-teal-600">
              {notifSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
