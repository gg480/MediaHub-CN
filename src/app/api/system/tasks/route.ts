import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 定时任务定义（内存中，基于 Setting 存储）
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

// GET /api/system/tasks — 获取定时任务列表
export async function GET() {
  try {
    // 从设置中读取任务配置
    const taskSettings = await db.setting.findMany({
      where: { key: { startsWith: 'task_' } },
    })

    // 默认任务定义
    const defaultTasks: ScheduledTask[] = [
      { id: 'rss_check', name: '订阅RSS检查', type: 'subscription_check', enabled: true, intervalMinutes: 30, lastRunAt: null, nextRunAt: null, lastStatus: null },
      { id: 'download_sync', name: '下载进度同步', type: 'download_sync', enabled: true, intervalMinutes: 5, lastRunAt: null, nextRunAt: null, lastStatus: null },
      { id: 'file_organize', name: '自动文件整理', type: 'auto_organize', enabled: false, intervalMinutes: 60, lastRunAt: null, nextRunAt: null, lastStatus: null },
      { id: 'health_check', name: '系统健康检查', type: 'health_check', enabled: true, intervalMinutes: 10, lastRunAt: null, nextRunAt: null, lastStatus: null },
      { id: 'indexer_sync', name: '索引器同步', type: 'indexer_sync', enabled: false, intervalMinutes: 60, lastRunAt: null, nextRunAt: null, lastStatus: null },
    ]

    // 合并设置
    const tasks = defaultTasks.map((task) => {
      const setting = taskSettings.find((s) => s.key === `task_${task.id}`)
      if (setting) {
        try {
          const parsed = JSON.parse(setting.value)
          return {
            ...task,
            enabled: parsed.enabled ?? task.enabled,
            intervalMinutes: parsed.intervalMinutes ?? task.intervalMinutes,
            lastRunAt: parsed.lastRunAt || null,
            lastStatus: parsed.lastStatus || null,
          }
        } catch {
          return task
        }
      }
      return task
    })

    // 计算 nextRunAt
    const now = new Date()
    const result = tasks.map((t) => ({
      ...t,
      nextRunAt: t.lastRunAt
        ? new Date(new Date(t.lastRunAt).getTime() + t.intervalMinutes * 60000).toISOString()
        : now.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('获取定时任务列表失败:', error)
    return NextResponse.json({ error: '获取定时任务列表失败' }, { status: 500 })
  }
}

// PUT /api/system/tasks — 更新定时任务
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId, enabled, intervalMinutes } = body

    if (!taskId) {
      return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
    }

    const validIds = ['rss_check', 'download_sync', 'file_organize', 'health_check', 'indexer_sync']
    if (!validIds.includes(taskId)) {
      return NextResponse.json({ error: `无效的任务ID: ${taskId}` }, { status: 400 })
    }

    const existing = await db.setting.findUnique({ where: { key: `task_${taskId}` } })
    let currentValue: Record<string, unknown> = {}
    if (existing) {
      try {
        currentValue = JSON.parse(existing.value)
      } catch {
        currentValue = {}
      }
    }

    if (enabled !== undefined) currentValue.enabled = enabled
    if (intervalMinutes !== undefined) currentValue.intervalMinutes = intervalMinutes

    await db.setting.upsert({
      where: { key: `task_${taskId}` },
      create: { key: `task_${taskId}`, value: JSON.stringify(currentValue) },
      update: { value: JSON.stringify(currentValue) },
    })

    return NextResponse.json({ success: true, taskId, config: currentValue })
  } catch (error) {
    console.error('更新定时任务失败:', error)
    return NextResponse.json({ error: '更新定时任务失败' }, { status: 500 })
  }
}

// POST /api/system/tasks/run — 手动运行任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId } = body

    if (!taskId) {
      return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })
    }

    // 根据任务类型执行对应逻辑
    let result: Record<string, unknown> = {}

    switch (taskId) {
      case 'rss_check': {
        // 触发订阅检查
        const subCheckResp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/subscriptions/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkAll: true }),
        })
        result = await subCheckResp.json() as Record<string, unknown>
        break
      }
      case 'download_sync': {
        // 触发下载同步
        const syncResp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/downloads/action/sync`, {
          method: 'POST',
        })
        result = await syncResp.json() as Record<string, unknown>
        break
      }
      case 'health_check': {
        const healthResp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/system/status`)
        result = await healthResp.json() as Record<string, unknown>
        break
      }
      case 'file_organize': {
        // 触发文件整理
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const organizeResp = await fetch(`${baseUrl}/api/organize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'hardlink' }),
        })
        result = await organizeResp.json() as Record<string, unknown>
        break
      }
      case 'indexer_sync': {
        // 触发索引器同步 - 重新拉取所有索引器的状态
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const indexersResp = await fetch(`${baseUrl}/api/indexers`)
        if (indexersResp.ok) {
          const indexers = (await indexersResp.json()) as Array<{ id: string }>
          let tested = 0
          let ok = 0
          for (const idx of indexers.slice(0, 20)) {
            try {
              const testResp = await fetch(`${baseUrl}/api/indexers/${idx.id}/test`, { method: 'POST' })
              const testData = await testResp.json() as Record<string, unknown>
              if (testData.success) ok++
            } catch { /* skip */ }
            tested++
          }
          result = { message: `索引器同步完成: ${ok}/${tested} 个可用`, tested, ok }
        } else {
          result = { message: '获取索引器列表失败' }
        }
        break
      }
      default:
        return NextResponse.json({ error: `未知任务: ${taskId}` }, { status: 400 })
    }

    // 更新最后运行时间
    const existing = await db.setting.findUnique({ where: { key: `task_${taskId}` } })
    let currentValue: Record<string, unknown> = {}
    if (existing) {
      try {
        currentValue = JSON.parse(existing.value)
      } catch {
        currentValue = {}
      }
    }
    currentValue.lastRunAt = new Date().toISOString()
    currentValue.lastStatus = 'success'

    await db.setting.upsert({
      where: { key: `task_${taskId}` },
      create: { key: `task_${taskId}`, value: JSON.stringify(currentValue) },
      update: { value: JSON.stringify(currentValue) },
    })

    return NextResponse.json({ success: true, taskId, result })
  } catch (error) {
    console.error('执行定时任务失败:', error)
    return NextResponse.json({ error: '执行定时任务失败' }, { status: 500 })
  }
}
