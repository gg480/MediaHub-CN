import { create } from 'zustand'

export type Page = 'dashboard' | 'discover' | 'search' | 'library' | 'subscribe' | 'downloads' | 'indexers' | 'settings'

interface AppState {
  currentPage: Page
  setCurrentPage: (page: Page) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  selectedMediaId: string | null
  setSelectedMediaId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setCurrentPage: (page) => set({ currentPage: page, sidebarOpen: false }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectedMediaId: null,
  setSelectedMediaId: (id) => set({ selectedMediaId: id }),
}))

export const PAGE_LABELS: Record<Page, string> = {
  dashboard: '仪表盘',
  discover: '发现',
  search: '搜索',
  library: '媒体库',
  subscribe: '订阅',
  downloads: '下载',
  indexers: '索引器',
  settings: '设置',
}
