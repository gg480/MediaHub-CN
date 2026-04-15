/**
 * Shared download client utilities
 *
 * Centralizes common types and functions used across download-related API routes
 * (send, sync, delete, test) to avoid code duplication.
 */

export interface ClientRecord {
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
  enabled?: boolean
  name?: string
}

/**
 * Build the base URL for a download client.
 * Uses HTTP for local/private network addresses, HTTPS for public addresses.
 */
export function buildClientUrl(client: ClientRecord): string {
  const isLocal =
    client.host.startsWith('localhost') ||
    client.host.startsWith('127.0') ||
    client.host.startsWith('192.168.') ||
    client.host.startsWith('10.') ||
    client.host.startsWith('172.')
  const scheme = isLocal ? 'http' : 'https'
  const base = client.baseUrl || ''
  return `${scheme}://${client.host}:${client.port}${base}`
}

/**
 * Authenticate with qBittorrent and return the SID cookie.
 * Returns empty string if no auth is configured or login fails.
 */
export async function qbitLogin(client: ClientRecord): Promise<string> {
  if (!client.username || !client.password) return ''
  const baseUrl = buildClientUrl(client)
  try {
    const res = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(client.username!)}&password=${encodeURIComponent(client.password!)}`,
    })
    if (res.ok && (await res.text()) === 'Ok.') {
      const setCookie = res.headers.get('set-cookie') || ''
      const sidMatch = setCookie.match(/SID=([^;]+)/)
      return sidMatch ? `SID=${sidMatch[1]}` : ''
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '未知'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Map a download state string to a normalized status.
 * Handles qBittorrent, Transmission, and Deluge state formats.
 */
export function mapDownloadState(state: string): string {
  const s = state.toLowerCase()
  if (s === 'downloading' || s === 'stalleddl' || s === 'checkingdl' || s.includes('download')) return 'downloading'
  if (s === 'uploading' || s === 'stalledup' || s === 'checkingup' || s === 'forcedup' || s === 'seeding' || s.includes('seed') || s.includes('finish')) return 'completed'
  if (s === 'queueddl' || s === 'queuedup' || s.includes('queued')) return 'queued'
  if (s === 'missingfiles' || s === 'error' || s.includes('error') || s.includes('check')) return 'failed'
  if (s === 'paused' || s === 'stopped') return 'queued'
  return 'downloading'
}
