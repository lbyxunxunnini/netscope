import { useEffect, useMemo, useRef, useState } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { getRequests, getStatus, clearRequests } from '@/lib/api'
import { useConnectionStore } from '@/stores/connectionStore'
import { useRequestStore } from '@/stores/requestStore'
import type { CaptureRecord } from '@netscope/shared'

type TabKey = 'general' | 'req-h' | 'req-b' | 'res-h' | 'res-b' | 'diag'

function App() {
  useWebSocket()
  const s = useConnectionStore()
  const st = useRequestStore()
  const [tab, setTab] = useState<TabKey>('general')
  const [menu, setMenu] = useState<{ x: number; y: number; row: CaptureRecord } | null>(null)
  const [col, setCol] = useState([120, 90, 360, 80, 90, 100])

  useEffect(() => {
    void getStatus().then((v) => s.set(v))
    void getRequests().then((v) => st.setAll(v))
  }, [])

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const list = useMemo(() => st.requests.filter((r) => {
    if (st.keyword && !r.url.toLowerCase().includes(st.keyword.toLowerCase())) return false
    if (st.method && r.method !== st.method) return false
    return true
  }), [st.requests, st.keyword, st.method])

  const active = st.requests.find((r) => r.requestId === st.selectedId)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="title">NetScope V1</div><div className="subtitle">Network Inspector</div></div>
        <div className="status-row"><StatusChip label="服务已启动" ok={s.serviceStarted} /><StatusChip label="调试链路" ok={s.vmAttached} /><StatusChip label="SDK 事件" ok={s.sdkDetected} /></div>
      </header>

      <div className="toolbar">
        <input className="input" placeholder="Filter URL keyword" value={st.keyword} onChange={(e) => st.setFilters(e.target.value, st.method)} />
        <select className="select" value={st.method} onChange={(e) => st.setFilters(st.keyword, e.target.value)}><option value="">All Methods</option><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option><option value="PATCH">PATCH</option></select>
        <button className="btn" onClick={async () => { await clearRequests(); st.clear() }}>Clear</button>
      </div>
      {s.lastError && <div className="error-bar">最近错误: {s.lastError}</div>}

      <div className="grid-main">
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                {['Time', 'Method', 'URL', 'Status', 'Duration', 'State'].map((h, i) => (
                  <ResizableTh key={h} width={col[i]} onResize={(w) => setCol((c) => c.map((v, idx) => idx === i ? w : v))}>{h}</ResizableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.requestId} className={st.selectedId === r.requestId ? 'active' : ''} onClick={() => st.select(r.requestId)} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, row: r }) }}>
                  <td style={{ width: col[0] }}>{new Date(r.startedAt).toLocaleTimeString()}</td>
                  <td style={{ width: col[1] }}><span className={`method ${r.method.toLowerCase()}`}>{r.method}</span></td>
                  <td style={{ width: col[2] }} title={r.url} className="url-cell">{r.url}</td>
                  <td style={{ width: col[3] }} className={statusClass(r.statusCode)}>{r.statusCode ?? '-'}</td>
                  <td style={{ width: col[4] }}>{r.durationMs ? `${r.durationMs}ms` : '-'}</td>
                  <td style={{ width: col[5] }}>{r.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel detail">
          <div className="tabs">
            {[
              ['general', 'General'], ['req-h', 'Req Headers'], ['req-b', 'Req Body'],
              ['res-h', 'Res Headers'], ['res-b', 'Res Body'], ['diag', 'Diagnostics'],
            ].map(([k, t]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k as TabKey)}>{t}</button>)}
          </div>
          {!active ? <div className="empty">Select a request to inspect details</div> : <DetailTab tab={tab} row={active} />}
        </div>
      </div>

      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }}>
          <button onClick={() => copy(menu.row.url)}>复制 URL</button>
          <button onClick={() => copy(toCurl(menu.row))}>复制 cURL</button>
        </div>
      )}
    </div>
  )
}

function DetailTab({ tab, row }: { tab: TabKey; row: CaptureRecord }) {
  const content = tab === 'general' ? {
    requestId: row.requestId, method: row.method, url: row.url, statusCode: row.statusCode, durationMs: row.durationMs, state: row.state,
  } : tab === 'req-h' ? row.requestHeaders
    : tab === 'req-b' ? (row.requestBody ?? '(empty)')
      : tab === 'res-h' ? row.responseHeaders
        : tab === 'res-b' ? (row.responseBody ?? '(empty)')
          : row.diagnostics
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  return (
    <div className="section">
      <h3>{titleByTab(tab)} <button className="copy-btn" onClick={() => copy(text)}>复制</button></h3>
      <pre>{text}</pre>
    </div>
  )
}

function ResizableTh({ width, onResize, children }: { width: number; onResize: (v: number) => void; children: React.ReactNode }) {
  const start = useRef<{ x: number; w: number } | null>(null)
  return (
    <th style={{ width }}>
      {children}
      <span className="resizer" onMouseDown={(e) => {
        start.current = { x: e.clientX, w: width }
        const move = (ev: MouseEvent) => onResize(Math.max(60, (start.current?.w ?? width) + (ev.clientX - (start.current?.x ?? ev.clientX))))
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }} />
    </th>
  )
}

function titleByTab(tab: TabKey): string {
  if (tab === 'general') return 'General'
  if (tab === 'req-h') return 'Request Headers'
  if (tab === 'req-b') return 'Request Body'
  if (tab === 'res-h') return 'Response Headers'
  if (tab === 'res-b') return 'Response Body'
  return 'Diagnostics'
}

function toCurl(r: CaptureRecord): string {
  const method = r.method || 'GET'
  const headers = Object.entries(r.requestHeaders || {}).map(([k, v]) => `-H ${q(`${k}: ${v}`)}`).join(' ')
  const body = r.requestBody ? `--data-raw ${q(r.requestBody)}` : ''
  return `curl -X ${method} ${headers} ${body} ${q(r.url)}`.replace(/\s+/g, ' ').trim()
}

function q(s: string): string { return `'${s.replace(/'/g, `'\\''`)}'` }
function copy(text: string) { void navigator.clipboard.writeText(text) }
function statusClass(code: number | null): string {
  if (!code) return ''
  if (code >= 200 && code < 300) return 'status2'
  if (code >= 300 && code < 400) return 'status3'
  if (code >= 400 && code < 500) return 'status4'
  if (code >= 500) return 'status5'
  return ''
}
function StatusChip({ label, ok }: { label: string; ok: boolean }) { return <span className={`chip ${ok ? 'ok' : 'off'}`}>{label}</span> }

export default App
