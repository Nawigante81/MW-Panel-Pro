export type MetricStateKind = 'loading' | 'value' | 'empty' | 'not_configured' | 'error'

export type MetricState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_configured'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'value'; value: number; formatted?: string; hint?: string }

export const metricValue = (value: number, options?: { formatted?: string; hint?: string }): MetricState => ({
  kind: 'value',
  value,
  formatted: options?.formatted,
  hint: options?.hint,
})

export const metricEmpty = (message: string): MetricState => ({ kind: 'empty', message })
export const metricNotConfigured = (message: string): MetricState => ({ kind: 'not_configured', message })
export const metricError = (message: string): MetricState => ({ kind: 'error', message })
