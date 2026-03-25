import type { SourceDiagnostics } from './types'
import { extractErrorMessage, formatDateTime, normalizeJobStatus, statusMeta } from './utils'

type Props = {
  selectedSourceId: string | null
  sourceDiagnosticsLoading: boolean
  sourceDiagnostics: SourceDiagnostics | null
  onClose: () => void
  focusRing: string
}

export default function SourceDiagnosticsPanel({ selectedSourceId, sourceDiagnosticsLoading, sourceDiagnostics, onClose, focusRing }: Props) {
  if (!selectedSourceId) return null
  return (
    <div className="mt-3 rounded-xl border border-violet-500/20 bg-[#09111f] p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#f1f5f9]">Diagnostyka źródła</p>
          <p className="text-xs text-[#7f90ab]">Szczegóły ostatnich jobów i wpływu na oferty</p>
        </div>
        <button type="button" onClick={onClose} className={`px-2.5 py-1 rounded text-xs border border-[#2f3b57] text-[#cbd5e1] ${focusRing}`}>Zamknij</button>
      </div>

      {sourceDiagnosticsLoading ? (
        <div className="text-sm text-[#94a3b8]">Ładowanie diagnostyki źródła…</div>
      ) : sourceDiagnostics ? (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#1e2d45] bg-[#0f172a] p-3">
              <p className="text-xs text-[#7f90ab]">Joby 24h</p>
              <p className="mt-1 text-sm text-[#e5e7eb]">OK: {sourceDiagnostics.stats24h.successful} · Failed: {sourceDiagnostics.stats24h.failed}</p>
              <p className="text-sm text-[#cbd5e1]">Retry: {sourceDiagnostics.stats24h.retrying} · Partial: {sourceDiagnostics.stats24h.partial}</p>
            </div>
            <div className="rounded-lg border border-[#1e2d45] bg-[#0f172a] p-3">
              <p className="text-xs text-[#7f90ab]">Oferty źródła</p>
              <p className="mt-1 text-sm text-[#e5e7eb]">Aktywne: {sourceDiagnostics.listings.active} / {sourceDiagnostics.listings.total}</p>
              <p className="text-sm text-violet-300">Partial import: {sourceDiagnostics.listings.partial}</p>
            </div>
            <div className="rounded-lg border border-[#1e2d45] bg-[#0f172a] p-3">
              <p className="text-xs text-[#7f90ab]">Stan źródła</p>
              <p className="mt-1 text-sm text-[#e5e7eb]">{sourceDiagnostics.source.name} · {sourceDiagnostics.source.lastStatus || 'brak'}</p>
              <p className="text-sm text-[#cbd5e1]">Ostatni sync: {formatDateTime(sourceDiagnostics.source.lastSyncAt)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#1e2d45] bg-[#0f172a] overflow-hidden">
            <div className="grid grid-cols-[1.1fr_160px_110px_1fr] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-[#7f90ab] border-b border-[#1e2d45]">
              <span>Job</span>
              <span>Czas</span>
              <span>Status</span>
              <span>Komunikat</span>
            </div>
            {sourceDiagnostics.recentJobs.length > 0 ? sourceDiagnostics.recentJobs.map((job) => {
              const meta = statusMeta[job.status] || statusMeta[normalizeJobStatus(job.status)]
              return (
                <div key={job.id} className="grid grid-cols-[1.1fr_160px_110px_1fr] gap-3 px-3 py-3 border-b last:border-b-0 border-[#1e2d45] text-sm">
                  <div>
                    <p className="text-[#f1f5f9] font-medium">{job.id}</p>
                    <p className="text-[11px] text-[#7f90ab]">retry: {job.retryCount ?? 0}</p>
                  </div>
                  <div className="text-[#d6dee9]">{formatDateTime(job.finishedAt || job.startedAt)}</div>
                  <div><span className={`inline-flex px-2 py-1 rounded-full text-xs ${meta?.className || 'border border-[#2f3b57] text-[#cbd5e1]'}`}>{meta?.label || job.status}</span></div>
                  <div className="text-[#cbd5e1] break-words">{extractErrorMessage(job)}</div>
                </div>
              )
            }) : <div className="p-3 text-sm text-[#94a3b8]">Brak ostatnich jobów dla tego źródła.</div>}
          </div>
        </>
      ) : (
        <div className="text-sm text-[#94a3b8]">Brak danych diagnostycznych dla źródła.</div>
      )}
    </div>
  )
}
