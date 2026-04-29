import type { CaptureRecord, CliConfig, SessionStatus } from '@netscope/shared'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

export const getStatus = () => req<SessionStatus>('/api/status')
export const getRequests = () => req<CaptureRecord[]>('/api/requests')
export const getConfig = () => req<CliConfig>('/api/config')
export const clearRequests = () => req<{ ok: boolean }>('/api/requests/clear', { method: 'POST' })
