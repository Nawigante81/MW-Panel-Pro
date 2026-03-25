import { MonitoringJob, MonitoringJobStatus, SourceSummaryItem } from './types'

export const statusMeta: Record<string, { label: string; className: string }> = {
  successful: { label: 'Udany', className: 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/30' },
  success: { label: 'Udany', className: 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/30' },
  failed: { label: 'Błąd', className: 'bg-red-500/12 text-red-300 border border-red-500/35' },
  pending: { label: 'Oczekuje', className: 'bg-amber-500/12 text-amber-300 border border-amber-500/30' },
  running: { label: 'W toku', className: 'bg-sky-500/12 text-sky-300 border border-sky-500/30' },
  retrying: { label: 'Ponawianie', className: 'bg-orange-500/12 text-orange-300 border border-orange-500/30' },
  partial: { label: 'Częściowy', className: 'bg-violet-500/12 text-violet-300 border border-violet-500/30' },
  warning: { label: 'Ostrzeżenie', className: 'bg-yellow-500/12 text-yellow-300 border border-yellow-500/30' },
}

export const sourceLabel = (sourceCode?: string | null, sourceName?: string | null) => sourceName || sourceCode || 'Nieznane źródło'

export const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const normalizeJobStatus = (status?: string | null): MonitoringJobStatus => {
  const raw = String(status || '').toLowerCase()
  if (raw === 'success' || raw === 'successful' || raw === 'completed') return 'successful'
  if (raw === 'failed' || raw === 'error') return 'failed'
  if (raw === 'retrying') return 'retrying'
  if (raw === 'partial') return 'partial'
  if (raw === 'warning') return 'warning'
  return 'pending'
}

export const extractErrorReason = (job: MonitoringJob) => {
  const raw = String(job.errorReason || job.errorMessage || job.errorLog || '').trim()
  if (!raw) return 'Błąd importu'
  const firstLine = raw.split(/\r?\n/)[0]?.trim() || raw
  if (/timeout/i.test(firstLine)) return 'Timeout źródła'
  if (/http\s*4\d\d/i.test(firstLine) || /http\s*5\d\d/i.test(firstLine)) return 'Błąd odpowiedzi źródła'
  if (/parse|json|html/i.test(firstLine)) return 'Błąd przetwarzania danych'
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine
}

export const extractErrorMessage = (job: MonitoringJob) => {
  const raw = String(job.errorMessage || job.errorLog || '').trim()
  if (!raw) return 'Brak dodatkowego komunikatu diagnostycznego.'
  return raw.length > 180 ? `${raw.slice(0, 177)}…` : raw
}

export const getSourceRiskScore = (item: SourceSummaryItem) => {
  let score = 0
  if (item.source.health === 'error') score += 120
  else if (item.source.health === 'warning') score += 70
  if (item.source.stale) score += 35
  score += item.stats24h.failed * 12
  score += item.stats24h.retrying * 8
  score += item.stats24h.partial * 6
  score += Math.min(item.listings.partial * 4, 40)
  if ((item.stats24h.successRate24h ?? 100) < 60) score += 30
  return score
}

export const getSourceRecommendations = (item: SourceSummaryItem) => {
  const recs: Array<{ tone: 'error' | 'warning' | 'info'; text: string }> = []
  if (item.source.stale) recs.push({ tone: 'warning', text: 'Brak świeżego syncu — uruchom import i sprawdź dostępność źródła.' })
  if (item.stats24h.failed >= 3) recs.push({ tone: 'error', text: `Wysoki fail rate (${item.stats24h.failed} błędów / 24h) — sprawdź błędy źródła i parser.` })
  if ((item.stats24h.successRate24h ?? 100) < 60 && item.stats24h.failed > 0) recs.push({ tone: 'warning', text: `Skuteczność 24h spadła do ${item.stats24h.successRate24h}% — wymaga przeglądu jakości importu.` })
  if (item.listings.partial >= 5) recs.push({ tone: 'warning', text: `Dużo partial importów (${item.listings.partial}) — sprawdź pola zdjęć/opisu/ceny.` })
  const latestMessage = item.latestJob ? extractErrorMessage(item.latestJob) : ''
  if (/timeout/i.test(latestMessage)) recs.push({ tone: 'info', text: 'Ostatni błąd wygląda na timeout — sprawdź stabilność źródła lub limity.' })
  if (/parse|json|html/i.test(latestMessage)) recs.push({ tone: 'info', text: 'Ostatni błąd sugeruje parser/strukturę payloadu — sprawdź collector i mapowanie pól.' })
  if (recs.length === 0) recs.push({ tone: 'info', text: 'Brak pilnych anomalii — źródło wygląda stabilnie.' })
  return recs.slice(0, 2)
}
