/**
 * Background Task Scheduler
 *
 * Automatically runs configured tasks at their specified intervals.
 * Designed to be initialized once from layout.tsx or a server component.
 * Uses in-memory setInterval with database-backed configuration and state.
 */

// Task definitions matching the API route
interface TaskConfig {
  id: string
  name: string
  type: string
  defaultIntervalMinutes: number
  defaultEnabled: boolean
}

const TASK_DEFINITIONS: TaskConfig[] = [
  { id: 'download_sync', name: '下载进度同步', type: 'download_sync', defaultIntervalMinutes: 5, defaultEnabled: true },
  { id: 'rss_check', name: '订阅RSS检查', type: 'subscription_check', defaultIntervalMinutes: 30, defaultEnabled: true },
  { id: 'health_check', name: '系统健康检查', type: 'health_check', defaultIntervalMinutes: 10, defaultEnabled: true },
  { id: 'file_organize', name: '自动文件整理', type: 'auto_organize', defaultIntervalMinutes: 60, defaultEnabled: false },
  { id: 'indexer_sync', name: '索引器同步', type: 'indexer_sync', defaultIntervalMinutes: 60, defaultEnabled: false },
]

// Track running timers for cleanup
const timers: Map<string, NodeJS.Timeout> = new Map()
let isInitialized = false

/**
 * Initialize the task scheduler. Safe to call multiple times.
 * Reads task configs from database and sets up intervals.
 */
export async function initTaskScheduler(): Promise<void> {
  if (isInitialized) return
  isInitialized = true

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  for (const taskDef of TASK_DEFINITIONS) {
    try {
      // Dynamically import db to avoid circular dependencies in client builds
      const { db } = await import('@/lib/db')
      const setting = await db.setting.findUnique({
        where: { key: `task_${taskDef.id}` },
      })

      let enabled = taskDef.defaultEnabled
      let intervalMinutes = taskDef.defaultIntervalMinutes

      if (setting) {
        try {
          const parsed = JSON.parse(setting.value)
          enabled = parsed.enabled ?? enabled
          intervalMinutes = parsed.intervalMinutes ?? intervalMinutes
        } catch {
          // Use defaults if JSON parse fails
        }
      }

      if (!enabled) {
        console.log(`[Scheduler] Task "${taskDef.name}" (${taskDef.id}) is disabled, skipping`)
        continue
      }

      // Minimum interval: 1 minute to prevent excessive API calls
      const effectiveInterval = Math.max(intervalMinutes, 1) * 60 * 1000

      // Schedule the task
      const timer = setInterval(
        () => executeTask(taskDef, baseUrl),
        effectiveInterval
      )
      timers.set(taskDef.id, timer)

      console.log(
        `[Scheduler] Task "${taskDef.name}" (${taskDef.id}) scheduled every ${intervalMinutes} min`
      )

      // Run each task once on startup (with a small delay to let the server warm up)
      setTimeout(() => executeTask(taskDef, baseUrl), 5000 + Math.random() * 10000)
    } catch (error) {
      console.error(`[Scheduler] Failed to initialize task "${taskDef.name}":`, error)
    }
  }

  console.log(`[Scheduler] Initialized with ${timers.size} active tasks`)
}

/**
 * Execute a single scheduled task
 */
async function executeTask(task: TaskConfig, baseUrl: string): Promise<void> {
  const startTime = Date.now()
  let success = false
  let message = ''

  try {
    switch (task.id) {
      case 'download_sync': {
        const res = await fetch(`${baseUrl}/api/downloads/action/sync`, {
          method: 'POST',
          signal: AbortSignal.timeout(30000),
        })
        const data = await res.json() as Record<string, unknown>
        success = res.ok
        message = String(data.message || (success ? 'success' : 'failed'))
        break
      }

      case 'rss_check': {
        const res = await fetch(`${baseUrl}/api/subscriptions/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkAll: true }),
          signal: AbortSignal.timeout(60000),
        })
        const data = await res.json() as Record<string, unknown>
        success = res.ok
        message = String(data.message || (success ? 'success' : 'failed'))
        break
      }

      case 'health_check': {
        const res = await fetch(`${baseUrl}/api/system/status`, {
          signal: AbortSignal.timeout(15000),
        })
        success = res.ok
        message = success ? 'healthy' : 'unhealthy'
        break
      }

      case 'file_organize': {
        const res = await fetch(`${baseUrl}/api/organize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'hardlink' }),
          signal: AbortSignal.timeout(60000),
        })
        const data = await res.json() as Record<string, unknown>
        success = res.ok
        message = String(data.message || (success ? 'success' : 'failed'))
        break
      }

      case 'indexer_sync': {
        const res = await fetch(`${baseUrl}/api/indexers`, {
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          const indexers = (await res.json()) as Array<{ id: string }>
          let tested = 0
          let ok = 0
          for (const idx of indexers.slice(0, 20)) {
            try {
              const testResp = await fetch(`${baseUrl}/api/indexers/${idx.id}/test`, {
                method: 'POST',
                signal: AbortSignal.timeout(10000),
              })
              const testData = await testResp.json() as Record<string, unknown>
              if (testData.success) ok++
            } catch { /* skip */ }
            tested++
          }
          success = true
          message = `${ok}/${tested} available`
        } else {
          success = false
          message = 'fetch failed'
        }
        break
      }

      default:
        return
    }
  } catch (error) {
    success = false
    message = error instanceof Error ? error.message : 'unknown error'
  }

  // Update last run time in database
  try {
    const { db } = await import('@/lib/db')
    const existing = await db.setting.findUnique({
      where: { key: `task_${task.id}` },
    })
    let currentValue: Record<string, unknown> = {}
    if (existing) {
      try { currentValue = JSON.parse(existing.value) } catch { currentValue = {} }
    }

    currentValue.lastRunAt = new Date().toISOString()
    currentValue.lastStatus = success ? 'success' : 'error'
    currentValue.lastMessage = message
    currentValue.lastDurationMs = Date.now() - startTime

    await db.setting.upsert({
      where: { key: `task_${task.id}` },
      create: { key: `task_${task.id}`, value: JSON.stringify(currentValue) },
      update: { value: JSON.stringify(currentValue) },
    })
  } catch {
    // Non-critical: don't let DB write failures break the scheduler
  }

  const duration = Date.now() - startTime
  const statusIcon = success ? '✓' : '✗'
  console.log(
    `[Scheduler] ${statusIcon} "${task.name}" completed in ${duration}ms — ${message}`
  )
}

/**
 * Stop all scheduled tasks (for cleanup / testing)
 */
export function stopTaskScheduler(): void {
  for (const [id, timer] of timers) {
    clearInterval(timer)
    console.log(`[Scheduler] Stopped task: ${id}`)
  }
  timers.clear()
  isInitialized = false
}

/**
 * Get the number of currently active scheduled tasks
 */
export function getActiveTaskCount(): number {
  return timers.size
}
