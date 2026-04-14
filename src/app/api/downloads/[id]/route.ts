import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const task = await db.downloadTask.findUnique({
      where: { id },
      include: {
        mediaItem: { select: { id: true, titleCn: true, type: true } },
        indexer: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, type: true } },
      },
    })

    if (!task) {
      return NextResponse.json({ error: '下载任务不存在' }, { status: 404 })
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error('Download task get error:', error)
    return NextResponse.json({ error: '获取下载任务失败' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, progress, downloadSpeed, uploadSpeed, outputPath, errorMessage, clientId } = body

    const task = await db.downloadTask.findUnique({ where: { id } })
    if (!task) {
      return NextResponse.json({ error: '下载任务不存在' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (progress !== undefined) updateData.progress = progress
    if (downloadSpeed !== undefined) updateData.downloadSpeed = downloadSpeed
    if (uploadSpeed !== undefined) updateData.uploadSpeed = uploadSpeed
    if (outputPath !== undefined) updateData.outputPath = outputPath
    if (errorMessage !== undefined) updateData.errorMessage = errorMessage
    if (clientId !== undefined) updateData.clientId = clientId

    // Auto-set timestamps based on status
    if (status === 'downloading' && !task.startedAt) {
      updateData.startedAt = new Date()
    }
    if (status === 'completed') {
      updateData.completedAt = new Date()
      updateData.progress = 1
    }
    if (status === 'failed') {
      updateData.completedAt = new Date()
    }

    const updated = await db.downloadTask.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Download task update error:', error)
    return NextResponse.json({ error: '更新下载任务失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const task = await db.downloadTask.findUnique({ where: { id } })

    if (!task) {
      return NextResponse.json({ error: '下载任务不存在' }, { status: 404 })
    }

    // If task has an active download client, try to remove from client
    if (task.clientId && task.infoHash && ['pending', 'downloading', 'queued'].includes(task.status)) {
      try {
        const client = await db.downloadClient.findUnique({ where: { id: task.clientId } })
        if (client && client.enabled) {
          await removeFromClient(client, task.infoHash).catch(() => {})
        }
      } catch {}
    }

    await db.downloadTask.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Download task delete error:', error)
    return NextResponse.json({ error: '删除下载任务失败' }, { status: 500 })
  }
}

// ============================================
// Client communication helpers
// ============================================

interface ClientRecord {
  id: string
  type: string
  host: string
  port: number
  username?: string | null
  password?: string | null
  baseUrl?: string | null
  category?: string | null
  directory?: string | null
  tvCategory?: string | null
  movieCategory?: string | null
  tvDirectory?: string | null
  movieDirectory?: string | null
}

function buildClientUrl(client: ClientRecord): string {
  const scheme = client.host.startsWith('localhost') || client.host.startsWith('127.0') ? 'http' : 'http'
  const base = client.baseUrl || ''
  return `${scheme}://${client.host}:${client.port}${base}`
}

async function removeFromClient(client: ClientRecord, infoHash: string): Promise<void> {
  if (client.type === 'qbittorrent') {
    const baseUrl = buildClientUrl(client)
    // Authenticate
    if (client.username && client.password) {
      await fetch(`${baseUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(client.username!)}&password=${encodeURIComponent(client.password!)}`,
      }).catch(() => {})
    }
    // Delete torrent
    await fetch(`${baseUrl}/api/v2/torrents/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${infoHash}&deleteFiles=true`,
    }).catch(() => {})
  }
}
