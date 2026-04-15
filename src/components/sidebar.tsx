'use client'

import { useAppStore, type Page } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Compass,
  Search,
  Library,
  Bell,
  Download,
  Server,
  Settings,
  Film,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const NAV_ITEMS: { page: Page; label: string; icon: React.ElementType }[] = [
  { page: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { page: 'discover', label: '发现', icon: Compass },
  { page: 'search', label: '搜索', icon: Search },
  { page: 'library', label: '媒体库', icon: Library },
  { page: 'subscribe', label: '订阅', icon: Bell },
  { page: 'downloads', label: '下载', icon: Download },
  { page: 'indexers', label: '索引器', icon: Server },
  { page: 'settings', label: '设置', icon: Settings },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentPage, setCurrentPage } = useAppStore()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
          <Film className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">MediaHub</h1>
          <p className="text-[11px] text-slate-400 -mt-0.5">中文影视搜刮管理</p>
        </div>
      </div>

      <Separator className="bg-slate-700/50 mx-4" />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.page
            return (
              <button
                key={item.page}
                onClick={() => {
                  setCurrentPage(item.page)
                  onNavigate?.()
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600/90 to-teal-600/90 text-white shadow-md shadow-emerald-900/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className={cn('w-[18px] h-[18px]', isActive ? 'text-white' : 'text-slate-400')} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="px-6 py-4">
        <Separator className="bg-slate-700/50 mb-4" />
        <div className="text-xs text-slate-500">
          <p>MediaHub-CN v1.0.0</p>
          <p className="mt-1">🇨🇳 面向中国用户</p>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 border-r border-slate-800">
      <NavContent />
    </aside>
  )
}

export function MobileSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetContent side="left" className="w-72 p-0 bg-slate-900 border-slate-800">
        <SheetHeader className="sr-only">
          <SheetTitle>导航菜单</SheetTitle>
        </SheetHeader>
        <div className="absolute top-3 right-3">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <NavContent onNavigate={() => setSidebarOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
