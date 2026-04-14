'use client'

import { useAppStore, type Page, PAGE_LABELS } from '@/lib/store'
import { Sidebar, MobileSidebar } from '@/components/sidebar'
import { Dashboard } from '@/components/dashboard'
import { Discover } from '@/components/discover'
import { SearchPage } from '@/components/search-page'
import { Library } from '@/components/library'
import { Subscribe } from '@/components/subscribe'
import { Downloads } from '@/components/downloads'
import { Indexers } from '@/components/indexers'
import { Settings } from '@/components/settings'
import { Button } from '@/components/ui/button'
import { Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { AnimatePresence, motion } from 'framer-motion'

function PageContent() {
  const { currentPage } = useAppStore()

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard />,
    discover: <Discover />,
    search: <SearchPage />,
    library: <Library />,
    subscribe: <Subscribe />,
    downloads: <Downloads />,
    indexers: <Indexers />,
    settings: <Settings />,
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentPage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
      >
        {pages[currentPage] ?? <Dashboard />}
      </motion.div>
    </AnimatePresence>
  )
}

export default function HomePage() {
  const { setSidebarOpen, currentPage } = useAppStore()
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Sidebar */}
      <MobileSidebar />

      {/* Main Content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">打开菜单</span>
          </Button>

          <h2 className="text-sm font-medium text-muted-foreground hidden sm:block">
            {PAGE_LABELS[currentPage]}
          </h2>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">切换主题</span>
          </Button>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <PageContent />
        </main>

        {/* Footer */}
        <footer className="border-t px-4 sm:px-6 py-3 text-center text-xs text-muted-foreground">
          MediaHub-CN v0.1.0 · 中文影视自动化管理工具 · 集成 Radarr + Sonarr + Prowlarr
        </footer>
      </div>
    </div>
  )
}
