import { ExternalListing } from '../../types'

export type ListingEx = ExternalListing & {
  previousPrice?: number | null
  priceChangePct?: number | null
}

export type MonitoringJobStatus = 'successful' | 'failed' | 'pending' | 'retrying' | 'partial' | 'warning'

export type MonitoringStats = {
  activeListings: number
  activeSources: number
  successfulJobs24h: number
  failedJobs24h: number
  pendingJobs: number
  partialImportListings: number
  unhealthySources: number
  sourceHealth: Array<{ id: string; name: string; code: string; isActive: boolean; lastSyncAt?: string | null; lastStatus?: string | null; lastError?: string | null; health?: 'ok' | 'warning' | 'error' | 'idle'; stale?: boolean }>
  failedJobsBySource: { sourceCode: string; sourceName: string; count: number }[]
  statusCounts: Record<string, number>
  supportedStatuses: string[]
  windowHours: number
}

export type MonitoringJob = {
  id: string
  sourceId?: string | null
  sourceName?: string | null
  sourceCode?: string | null
  startedAt: string
  finishedAt?: string | null
  status: string
  processedCount?: number
  newCount?: number
  updatedCount?: number
  inactiveCount?: number
  retryCount?: number
  errorReason?: string | null
  errorMessage?: string | null
  errorLog?: string | null
  details?: {
    startedAt?: string
    finishedAt?: string | null
    processedCount?: number
    newCount?: number
    updatedCount?: number
    inactiveCount?: number
    errorLog?: string | null
  }
}

export type MonitoringJobsResponse = {
  items: MonitoringJob[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  supportedStatuses: string[]
}

export type SourceDiagnostics = {
  source: { id: string; name: string; code: string; isActive: boolean; lastSyncAt?: string | null; lastStatus?: string | null; lastError?: string | null; health?: 'ok' | 'warning' | 'error' | 'idle'; stale?: boolean }
  stats24h: { successful: number; failed: number; pending: number; retrying: number; partial: number; warning: number }
  listings: { total: number; active: number; partial: number }
  recentJobs: MonitoringJob[]
}

export type SourceSummaryItem = {
  source: { id: string; name: string; code: string; isActive: boolean; lastSyncAt?: string | null; lastStatus?: string | null; lastError?: string | null; health?: 'ok' | 'warning' | 'error' | 'idle'; stale?: boolean }
  stats24h: { successful: number; failed: number; pending: number; retrying: number; partial: number; warning: number; successRate24h: number | null }
  listings: { total: number; active: number; partial: number }
  latestJob: MonitoringJob | null
}
