export type KpiValueState = 'ok' | 'missing' | 'empty'

export const isFinitePositiveNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export const asNumberOrNull = (value: unknown): number | null => {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

export const formatMoney = (value: number | null | undefined, suffix = 'zł') => {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value).toLocaleString('pl-PL')} ${suffix}`
}

export const formatPricePerM2 = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value).toLocaleString('pl-PL')} zł/m²`
}

export const normalizeOfferStatus = (value?: string | null): 'draft' | 'active' | 'archived' | 'expired' => {
  const raw = String(value || '').trim().toLowerCase()

  if (!raw) return 'draft'

  if (['active', 'published', 'open', 'new', 'visible'].includes(raw)) {
    return 'active'
  }

  if (['expired', 'outdated', 'timeout'].includes(raw)) {
    return 'expired'
  }

  if (['sold', 'rented', 'inactive', 'archived', 'withdrawn', 'closed', 'reserved', 'done'].includes(raw)) {
    return 'archived'
  }

  return 'draft'
}

export const formatRelativeTime = (iso?: string) => {
  if (!iso) return 'przed chwilą'
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'przed chwilą'
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 10) return 'przed chwilą'
  if (diffSec < 60) return `${diffSec}s temu`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m temu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h temu`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d temu`
}
