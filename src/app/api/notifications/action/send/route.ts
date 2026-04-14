import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 事件标题映射
const EVENT_TITLES: Record<string, string> = {
  download_start: '下载开始',
  download_complete: '下载完成',
  download_fail: '下载失败',
  organize_complete: '文件整理完成',
  organize_fail: '文件整理失败',
  new_media: '新媒体入库',
  search_fail: '搜索失败',
  subscription_match: '订阅匹配成功',
  health_alert: '系统异常告警',
}

interface SendNotificationBody {
  event: string
  title?: string
  body: string
  mediaTitle?: string
  extra?: Record<string, unknown>
}

// 发送通知的核心逻辑（供其他模块调用）
async function dispatchNotification(type: string, config: string, data: SendNotificationBody) {
  let parsedConfig: Record<string, string>
  try {
    parsedConfig = typeof config === 'string' ? JSON.parse(config) : config
  } catch {
    return false
  }

  const eventLabel = EVENT_TITLES[data.event] || data.event
  const title = data.title || `MediaHub-CN | ${eventLabel}`
  let body = data.body
  if (data.mediaTitle) {
    body = `影视: ${data.mediaTitle}\n${body}`
  }

  try {
    switch (type) {
      case 'webhook': {
        const resp = await fetch(parsedConfig.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content: body,
            event: data.event,
            mediaTitle: data.mediaTitle,
            timestamp: new Date().toISOString(),
            source: 'MediaHub-CN',
            ...data.extra,
          }),
          signal: AbortSignal.timeout(15000),
        })
        return resp.ok
      }

      case 'wechat': {
        // 获取 token
        const tokenResp = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(parsedConfig.corp_id)}&corpsecret=${encodeURIComponent(parsedConfig.secret)}`,
          { signal: AbortSignal.timeout(10000) }
        )
        const tokenData = await tokenResp.json() as { errcode: number; access_token?: string }
        if (tokenData.errcode !== 0 || !tokenData.access_token) return false
        // 发送
        const sendResp = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              touser: '@all',
              msgtype: 'markdown',
              agentid: parseInt(parsedConfig.agent_id, 10) || 0,
              markdown: { content: `## ${title}\n${body}` },
            }),
            signal: AbortSignal.timeout(15000),
          }
        )
        const sendData = await sendResp.json() as { errcode: number }
        return sendData.errcode === 0
      }

      case 'telegram': {
        const resp = await fetch(
          `https://api.telegram.org/bot${encodeURIComponent(parsedConfig.bot_token)}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: parseInt(parsedConfig.chat_id, 10) || parsedConfig.chat_id,
              text: `<b>${title}</b>\n\n${body}`,
              parse_mode: 'HTML',
            }),
            signal: AbortSignal.timeout(15000),
          }
        )
        const tgData = await resp.json() as { ok: boolean }
        return tgData.ok
      }

      case 'bark': {
        const url = `${parsedConfig.server_url.replace(/\/$/, '')}/${encodeURIComponent(parsedConfig.device_key)}`
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            group: 'MediaHub-CN',
            sound: 'alarm',
          }),
          signal: AbortSignal.timeout(15000),
        })
        const barkData = await resp.json() as { code?: number }
        return barkData.code === undefined || barkData.code === 200
      }

      default:
        return false
    }
  } catch {
    return false
  }
}

// POST /api/notifications/action/send — 触发事件通知
export async function POST(request: NextRequest) {
  try {
    const body: SendNotificationBody = await request.json()
    const { event, title, mediaTitle, extra } = body

    if (!event || !body.body) {
      return NextResponse.json({ error: '缺少必要参数（event/body）' }, { status: 400 })
    }

    // 查找所有启用且订阅了该事件的通知渠道
    const notifications = await db.notification.findMany({
      where: { enabled: true },
    })

    const results: Array<{ id: string; name: string; success: boolean }> = []
    const dispatched = notifications.filter((n) => {
      const events = n.events.split(',').map((e) => e.trim())
      return events.includes(event) || events.includes('*')
    })

    // 并行发送所有通知
    const promises = dispatched.map(async (n) => {
      const success = await dispatchNotification(n.type, n.config, { event, title, body: body.body, mediaTitle, extra })
      results.push({ id: n.id, name: n.name, success })
      return success
    })

    await Promise.allSettled(promises)

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return NextResponse.json({
      event,
      dispatched: results.length,
      success: successCount,
      failed: failCount,
      results,
    })
  } catch (error) {
    console.error('发送通知失败:', error)
    return NextResponse.json({ error: '发送通知失败' }, { status: 500 })
  }
}

export { dispatchNotification }
