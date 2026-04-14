'use client'

import { useEffect, useState, useCallback } from 'react'
import { Settings as SettingsIcon, Save, Plus, Trash2, Loader2, Server, Info, Key, FolderOpen, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { DownloadClient } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface OrganizeSettings {
  movieLibraryPath: string
  tvLibraryPath: string
  organizeMode: string
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
  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, clientsRes, organizeRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/download-clients'),
        fetch('/api/organize'),
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

  const clientTypeLabels: Record<string, string> = {
    qbittorrent: 'qBittorrent',
    transmission: 'Transmission',
    deluge: 'Deluge',
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">设置</h2>
        <p className="text-muted-foreground">系统配置和下载客户端管理</p>
      </div>

      {/* General Settings */}
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
              <Button onClick={saveSettings} disabled={saving} className="bg-gradient-to-r from-emerald-600 to-teal-600">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}保存设置
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Download Clients */}
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

      {/* File Organization */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FolderOpen className="h-4 w-4" />文件整理</CardTitle>
          <CardDescription>配置下载完成后的文件自动整理规则</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>电影库路径</Label>
            <Input value={organizeSettings.movieLibraryPath} onChange={(e) => setOrganizeSettings({ ...organizeSettings, movieLibraryPath: e.target.value })} placeholder="/media/movies" />
            <p className="text-[11px] text-muted-foreground">下载完成后电影文件将整理到此目录，如 Title (Year)/</p>
          </div>
          <div className="space-y-2">
            <Label>剧集库路径</Label>
            <Input value={organizeSettings.tvLibraryPath} onChange={(e) => setOrganizeSettings({ ...organizeSettings, tvLibraryPath: e.target.value })} placeholder="/media/tv" />
            <p className="text-[11px] text-muted-foreground">下载完成后剧集文件将整理到此目录，如 Title/Season XX/</p>
          </div>
          <div className="space-y-2">
            <Label>整理模式</Label>
            <Select value={organizeSettings.organizeMode} onValueChange={(v) => setOrganizeSettings({ ...organizeSettings, organizeMode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hardlink">硬链接（推荐，NAS省空间）</SelectItem>
                <SelectItem value="copy">复制</SelectItem>
                <SelectItem value="move">移动</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">硬链接模式节省磁盘空间，跨文件系统时自动降级为复制</p>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Info className="h-4 w-4" />系统信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">应用版本</span><span>MediaHub-CN v0.1.0</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">运行环境</span><span>Next.js 16 + TypeScript</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">数据库</span><span>SQLite (Prisma)</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">下载客户端</span><span>{clients.length} 个</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
