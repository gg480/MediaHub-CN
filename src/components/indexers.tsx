'use client'

import { useEffect, useState, useCallback } from 'react'
import { Server, Plus, Trash2, Loader2, Zap, Globe, Key, Cookie, Tag, TestTube, Power, PowerOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Indexer } from '@/lib/types'
import { INDEXER_TEMPLATES } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const defaultIndexer: Partial<Indexer> = {
  name: '',
  enabled: true,
  type: 'torznab',
  protocol: 'torrent',
  scheme: 'https',
  host: '',
  port: 443,
  baseUrl: '',
  apiKey: '',
  categories: '',
  uid: '',
  passkey: '',
  cookie: '',
  vip: false,
  useInternal: false,
  searchPath: '',
  detailsPath: '',
  priority: 25,
  tags: '',
  enableRss: true,
  enableSearch: true,
  enableAuto: true,
  rateLimit: 10,
}

export function Indexers() {
  const [indexers, setIndexers] = useState<Indexer[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<Partial<Indexer>>({ ...defaultIndexer })
  const [testing, setTesting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const fetchIndexers = useCallback(async () => {
    try {
      const res = await fetch('/api/indexers')
      if (res.ok) {
        const data = await res.json()
        setIndexers(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Failed to fetch indexers:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchIndexers() }, [fetchIndexers])

  const handleAdd = async () => {
    if (!form.name || !form.host) {
      toast({ title: '请填写必填字段', description: '名称和地址为必填', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/indexers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast({ title: '添加成功', description: `${form.name} 已添加` })
        setAddOpen(false)
        setForm({ ...defaultIndexer })
        fetchIndexers()
      } else {
        const err = await res.json()
        toast({ title: '添加失败', description: err.error ?? '', variant: 'destructive' })
      }
    } catch {
      toast({ title: '添加失败', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/indexers/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: '连接成功', description: data.message ?? '索引器连接正常' })
      } else {
        toast({ title: '连接失败', description: data.message ?? data.error ?? '无法连接到索引器', variant: 'destructive' })
      }
      fetchIndexers()
    } catch {
      toast({ title: '测试失败', description: '网络错误', variant: 'destructive' })
    } finally {
      setTesting(null)
    }
  }

  const handleToggle = async (indexer: Indexer) => {
    try {
      const res = await fetch(`/api/indexers/${indexer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !indexer.enabled }),
      })
      if (res.ok) {
        toast({ title: indexer.enabled ? '已禁用' : '已启用' })
        fetchIndexers()
      }
    } catch {
      toast({ title: '操作失败', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/indexers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: '已删除' })
        fetchIndexers()
      }
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  const applyTemplate = (tpl: typeof INDEXER_TEMPLATES[number]) => {
    setForm({
      ...defaultIndexer,
      name: tpl.name,
      host: tpl.host,
      scheme: tpl.scheme,
      type: tpl.type,
      searchPath: tpl.searchPath,
      categories: tpl.categories,
      priority: tpl.priority,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">索引器</h2>
          <p className="text-muted-foreground">配置种子站和资源索引器（替代 Prowlarr）</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <Button onClick={() => setAddOpen(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
            <Plus className="h-4 w-4 mr-1" />
            添加索引器
          </Button>
          <DialogContent className="sm:max-w-[650px] max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>添加索引器</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-4">
                {/* Quick-add templates */}
                <div>
                  <Label className="text-xs text-muted-foreground">快速添加 - 国内常用站点模板</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {INDEXER_TEMPLATES.map((tpl) => (
                      <Button key={tpl.name} size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyTemplate(tpl)}>
                        <Zap className="h-3 w-3 mr-1 text-yellow-500" />
                        {tpl.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Form */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>名称 *</Label>
                    <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="站点名称" />
                  </div>
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Indexer['type'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="torznab">Torznab</SelectItem>
                        <SelectItem value="newznab">Newznab</SelectItem>
                        <SelectItem value="native_pt">原生PT站</SelectItem>
                        <SelectItem value="cardigann">Cardigann</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>协议</Label>
                    <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v as 'torrent' | 'nzb' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="torrent">Torrent</SelectItem>
                        <SelectItem value="nzb">NZB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Scheme</Label>
                    <Select value={form.scheme} onValueChange={(v) => setForm({ ...form, scheme: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="http">HTTP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>地址 *</Label>
                    <Input value={form.host ?? ''} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>端口</Label>
                    <Input type="number" value={form.port ?? ''} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || undefined })} placeholder="443" />
                  </div>
                  <div className="space-y-2">
                    <Label>API基础路径</Label>
                    <Input value={form.baseUrl ?? ''} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="/api" />
                  </div>
                  <div className="space-y-2">
                    <Label>搜索路径</Label>
                    <Input value={form.searchPath ?? ''} onChange={(e) => setForm({ ...form, searchPath: e.target.value })} placeholder="/api/torrent/search" />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label><Key className="h-3 w-3 inline mr-1" />API Key</Label>
                    <Input value={form.apiKey ?? ''} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="API密钥" />
                  </div>
                  <div className="space-y-2">
                    <Label>UID</Label>
                    <Input value={form.uid ?? ''} onChange={(e) => setForm({ ...form, uid: e.target.value })} placeholder="用户ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Passkey</Label>
                    <Input type="password" value={form.passkey ?? ''} onChange={(e) => setForm({ ...form, passkey: e.target.value })} placeholder="Passkey" />
                  </div>
                  <div className="space-y-2">
                    <Label><Cookie className="h-3 w-3 inline mr-1" />Cookie</Label>
                    <Input value={form.cookie ?? ''} onChange={(e) => setForm({ ...form, cookie: e.target.value })} placeholder="Cookie字符串" />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label><Tag className="h-3 w-3 inline mr-1" />分类ID</Label>
                    <Input value={form.categories ?? ''} onChange={(e) => setForm({ ...form, categories: e.target.value })} placeholder="401,402,403" />
                  </div>
                  <div className="space-y-2">
                    <Label>优先级</Label>
                    <Input type="number" value={form.priority ?? 25} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 25 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>频率限制（秒/次）</Label>
                    <Input type="number" value={form.rateLimit ?? 10} onChange={(e) => setForm({ ...form, rateLimit: parseInt(e.target.value) || 10 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>详情页路径</Label>
                    <Input value={form.detailsPath ?? ''} onChange={(e) => setForm({ ...form, detailsPath: e.target.value })} placeholder="/details.php" />
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.vip ?? false} onCheckedChange={(v) => setForm({ ...form, vip: v })} />
                    <Label className="text-sm">VIP账号</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.enableRss ?? true} onCheckedChange={(v) => setForm({ ...form, enableRss: v })} />
                    <Label className="text-sm">启用RSS</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.enableSearch ?? true} onCheckedChange={(v) => setForm({ ...form, enableSearch: v })} />
                    <Label className="text-sm">启用搜索</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.enableAuto ?? true} onCheckedChange={(v) => setForm({ ...form, enableAuto: v })} />
                    <Label className="text-sm">自动搜索</Label>
                  </div>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
              <Button onClick={handleAdd} disabled={saving} className="bg-gradient-to-r from-emerald-600 to-teal-600">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                添加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Indexer Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-0 shadow-sm"><CardContent className="p-6"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-3/4 mt-3" /></CardContent></Card>
          ))}
        </div>
      ) : indexers.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Server className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">暂无索引器</p>
              <p className="text-sm mt-1">添加索引器以开始搜索资源</p>
              <Button className="mt-4 bg-gradient-to-r from-emerald-600 to-teal-600" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />添加索引器
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {indexers.map((indexer) => (
            <Card key={indexer.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className={cn('h-4 w-4', indexer.enabled ? 'text-emerald-600' : 'text-muted-foreground')} />
                    <h3 className="font-semibold text-sm">{indexer.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={indexer.enabled ? 'default' : 'secondary'} className={cn('text-[10px] px-1.5 py-0', indexer.enabled ? 'bg-emerald-600' : '')}>
                      {indexer.enabled ? '已启用' : '已禁用'}
                    </Badge>
                    {indexer.testStatus === 'success' && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-0">正常</Badge>
                    )}
                    {indexer.testStatus === 'fail' && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-0">失败</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {indexer.scheme}://{indexer.host}{indexer.port && indexer.port !== 443 && indexer.port !== 80 ? `:${indexer.port}` : ''}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>类型: {indexer.type}</span>
                    <span>·</span>
                    <span>优先级: {indexer.priority}</span>
                    {indexer.vip && <><span>·</span><Badge className="text-[10px] px-1 py-0 bg-yellow-100 text-yellow-700 border-0">VIP</Badge></>}
                  </div>
                  {indexer.testMessage && (
                    <p className={cn('text-[11px]', indexer.testStatus === 'success' ? 'text-green-600' : 'text-red-600')}>
                      {indexer.testMessage}
                    </p>
                  )}
                </div>
                <Separator className="my-3" />
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleToggle(indexer)}>
                    {indexer.enabled ? <><PowerOff className="h-3 w-3 mr-1" />禁用</> : <><Power className="h-3 w-3 mr-1 text-emerald-600" />启用</>}
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={testing === indexer.id} onClick={() => handleTest(indexer.id)}>
                      {testing === indexer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}测试
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(indexer.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
