import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../utils/apiClient'

type AlertItem = {
  id: string
  alert_type: string
  city?: string | null
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
  created_at: string
  is_read?: boolean
}

export default function MarketAlertsWidget() {
  const [rows, setRows] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const data = await apiFetch<AlertItem[]>('/market-analytics/alerts?limit=5')
      setRows(data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/market-analytics/alerts/${id}/read`, { method: 'POST' })
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)))
    } catch {
      // ignore UI noise
    }
  }

  const markAllRead = async () => {
    try {
      await apiFetch('/market-analytics/alerts/read-all', { method: 'POST' })
      setRows((prev) => prev.map((x) => ({ ...x, is_read: true })))
    } catch {
      // ignore UI noise
    }
  }

  const severityCls = (s: AlertItem['severity']) =>
    s === 'high'
      ? 'text-red-300 bg-red-500/15 border-red-500/30'
      : s === 'medium'
        ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
        : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'

  const unreadCount = useMemo(() => rows.filter((x) => !x.is_read).length, [rows])
  const visibleRows = useMemo(() => (unreadOnly ? rows.filter((x) => !x.is_read) : rows), [rows, unreadOnly])

  return (
    <div className="bg-[#111827] border border-[#1f2a44] rounded-xl backdrop-blur-sm bg-white/5 shadow-[0_6px_24px_rgba(2,6,23,0.35)]">
      <div className="p-3.5 border-b border-[#1f2a44] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#e5e7eb]">Alerty rynku</h3>
          {unreadCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{unreadCount}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setUnreadOnly((v) => !v)} className="text-xs text-[#9ca3af] hover:text-[#e5e7eb]">
            {unreadOnly ? 'Pokaż wszystkie' : 'Tylko nieprzeczytane'}
          </button>
          <button onClick={() => void markAllRead()} className="text-xs text-[#9ca3af] hover:text-[#e5e7eb]">Oznacz wszystko</button>
          <Link to="/market" className="text-xs text-[#9ca3af] hover:text-[#e5e7eb]">Zobacz wszystkie</Link>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {loading ? <div className="h-20 rounded-lg bg-[#0f172a] animate-pulse" /> : null}
        {!loading && visibleRows.length === 0 ? <div className="rounded-lg border border-dashed border-[#2c3a57] p-3 text-xs text-[#9ca3af]">Brak alertów do wyświetlenia.</div> : null}
        {visibleRows.map((r, i) => (
          <div key={r.id || `${r.alert_type}-${i}`} className={`rounded-lg border border-[#1f2a44] p-2.5 hover:bg-[#1f2937] transition-colors ${r.is_read ? 'opacity-70' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#e5e7eb] truncate">{r.title}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityCls(r.severity)}`}>{r.severity}</span>
            </div>
            <p className="text-[11px] text-[#9ca3af]">{r.description}</p>
            {!r.is_read ? (
              <button onClick={() => void markRead(r.id)} className="mt-1 text-[11px] text-blue-400 hover:underline">Oznacz jako przeczytane</button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
