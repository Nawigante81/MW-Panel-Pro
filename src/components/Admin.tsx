import { apiFetch, apiJsonFetch } from '../utils/apiClient'
import { useEffect, useMemo, useState } from 'react'
import { Users, Settings, Logs, Server, Database, DownloadCloud, RefreshCcw, Plus } from 'lucide-react'

const isOnline = (lastSeenAt?: string): boolean => {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000
}

const formatDateTime = (iso?: string): string => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type TenantSummary = {
  agencyId: string
  name: string
  email: string
  planCode: string
  status: string
  seatsLimit: number
  seatsUsed: number
  currentPeriodEnd?: string
  billingEvents: number
  lastBillingEventAt?: string
}

type TenantSubscription = {
  agencyId: string
  planCode: string
  status: string
  seatsLimit: number
  seatsUsed: number
  billingEmail?: string
  trialEndsAt?: string
  currentPeriodEnd?: string
}

type BillingEvent = {
  id: string
  agencyId: string
  eventType: string
  amountCents: number
  currency: string
  status: string
  externalRef?: string
  createdAt: string
}

type PortalIntegrationRecord = {
  id: string
  agencyId: string
  portal: string
  isActive: boolean
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
  lastImportAt?: string
  lastImportStatus?: string
  createdAt?: string
  updatedAt?: string
}

type ExternalSourceRecord = {
  id: string
  code: string
  name: string
  baseUrl?: string
  isActive: boolean
  lastSyncAt?: string
  lastStatus?: string
}

type BackupRecord = {
  fileName: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
  downloadUrl: string
}

const Admin = () => {
  const [activeTab, setActiveTab] = useState('users')
  const [sources, setSources] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [externalListings, setExternalListings] = useState<any[]>([])
  const [alertRules, setAlertRules] = useState<any[]>([])
  const [collectorRuns, setCollectorRuns] = useState<any[]>([])
  const [collectorOffers, setCollectorOffers] = useState<any[]>([])
  const [collectorStats, setCollectorStats] = useState<any>({ total: 0, active: 0 })
  const [collectorPage, setCollectorPage] = useState(0)
  const [collectorChanges, setCollectorChanges] = useState<any[]>([])
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [importSearch, setImportSearch] = useState('')
  const [importSourceFilter, setImportSourceFilter] = useState('all')
  const [importTypeFilter, setImportTypeFilter] = useState('all')
  const [importStatusFilter, setImportStatusFilter] = useState('all')
  const [importViewMode, setImportViewMode] = useState<'cards' | 'list'>('cards')
  const [usersList, setUsersList] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userCreateLoading, setUserCreateLoading] = useState(false)
  const [userCreateError, setUserCreateError] = useState('')
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null)
  const [newUser, setNewUser] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'agent' })
  const [tenantSummary, setTenantSummary] = useState<TenantSummary[]>([])
  const [selectedAgencyId, setSelectedAgencyId] = useState('')
  const [selectedSubscription, setSelectedSubscription] = useState<TenantSubscription | null>(null)
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([])
  const [saasLoading, setSaasLoading] = useState(false)
  const [saasSaving, setSaasSaving] = useState(false)
  const [saasError, setSaasError] = useState('')
  const [saasNotice, setSaasNotice] = useState('')
  const [subscriptionForm, setSubscriptionForm] = useState({
    planCode: 'starter',
    status: 'trial',
    seatsLimit: '3',
    seatsUsed: '0',
    billingEmail: '',
  })
  const [billingDraft, setBillingDraft] = useState({
    eventType: 'invoice_created',
    amountCents: '0',
    currency: 'PLN',
    status: 'recorded',
    externalRef: '',
  })
  const [portalIntegrations, setPortalIntegrations] = useState<PortalIntegrationRecord[]>([])
  const [sourceRecords, setSourceRecords] = useState<ExternalSourceRecord[]>([])
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  const [integrationsNotice, setIntegrationsNotice] = useState('')
  const [integrationsError, setIntegrationsError] = useState('')
  const [portalCrudAgencyId, setPortalCrudAgencyId] = useState('agency-1')
  const [portalForm, setPortalForm] = useState({ portal: '', isActive: true })
  const [portalFormOpen, setPortalFormOpen] = useState(false)
  const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([])
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [backupNotice, setBackupNotice] = useState('')
  const [backupError, setBackupError] = useState('')

  const tabs = [
    { id: 'users', label: 'Użytkownicy', icon: Users },
    { id: 'settings', label: 'Ustawienia', icon: Settings },
    { id: 'audit', label: 'Audit log', icon: Logs },
    { id: 'saas', label: 'SaaS', icon: Server },
    { id: 'integrations', label: 'Integracje', icon: Server },
    { id: 'backup', label: 'Backup', icon: Database },
    { id: 'import', label: 'Import ofert', icon: DownloadCloud },
    { id: 'collectors', label: 'Collectory', icon: DownloadCloud }
  ]



  const reloadUsers = async () => {
    try {
      setUsersLoading(true)
      const rows = await apiFetch<any[]>('/admin/users')
      setUsersList(rows)
    } catch {
      setUsersList([])
    } finally {
      setUsersLoading(false)
    }
  }

  const createUser = async () => {
    try {
      setUserCreateError('')
      setUserCreateLoading(true)
      if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password) {
        setUserCreateError('Uzupełnij wszystkie pola')
        return
      }
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      })
      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: 'agent' })
      await reloadUsers()
    } catch (err) {
      setUserCreateError(err instanceof Error ? err.message : 'Nie udało się dodać użytkownika')
    } finally {
      setUserCreateLoading(false)
    }
  }

  const updateUser = async (id: string, patch: any) => {
    try {
      setUserActionLoading(id)
      await apiFetch(`/admin/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      await reloadUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nie udało się zaktualizować użytkownika')
    } finally {
      setUserActionLoading(null)
    }
  }

  const deleteUser = async (id: string, email: string) => {
    if (!confirm(`Usunąć użytkownika ${email}?`)) return
    try {
      setUserActionLoading(id)
      await apiFetch(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await reloadUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nie udało się usunąć użytkownika')
    } finally {
      setUserActionLoading(null)
    }
  }

  const reloadCollectorsData = async () => {
    try {
      const runs = await apiFetch<any[]>('/collectors/runs')
      setCollectorRuns(runs)
    } catch {
      setCollectorRuns([])
    }
  }

  const loadTenantWorkspace = async (agencyId: string) => {
    try {
      setSaasLoading(true)
      setSaasError('')
      const [subscription, events] = await Promise.all([
        apiFetch<TenantSubscription>(`/admin/tenants/${encodeURIComponent(agencyId)}/subscription`),
        apiFetch<BillingEvent[]>(`/admin/billing-events?agencyId=${encodeURIComponent(agencyId)}&limit=10`),
      ])
      setSelectedSubscription(subscription)
      setBillingEvents(events)
      setSubscriptionForm({
        planCode: subscription.planCode,
        status: subscription.status,
        seatsLimit: String(subscription.seatsLimit),
        seatsUsed: String(subscription.seatsUsed),
        billingEmail: subscription.billingEmail || '',
      })
    } catch (error) {
      setSaasError(error instanceof Error ? error.message : 'Nie udało się pobrać danych SaaS')
    } finally {
      setSaasLoading(false)
    }
  }

  const reloadSaasSummary = async () => {
    try {
      setSaasLoading(true)
      setSaasError('')
      const rows = await apiFetch<TenantSummary[]>('/admin/tenants/summary')
      setTenantSummary(rows)
      const nextAgencyId = selectedAgencyId || rows[0]?.agencyId || ''
      setSelectedAgencyId(nextAgencyId)
      if (nextAgencyId) {
        await loadTenantWorkspace(nextAgencyId)
      } else {
        setSelectedSubscription(null)
        setBillingEvents([])
      }
    } catch (error) {
      setTenantSummary([])
      setSelectedSubscription(null)
      setBillingEvents([])
      setSaasError(error instanceof Error ? error.message : 'Nie udało się pobrać tenantów')
    } finally {
      setSaasLoading(false)
    }
  }

  const saveSubscription = async () => {
    if (!selectedAgencyId) return
    try {
      setSaasSaving(true)
      setSaasError('')
      const updated = await apiJsonFetch<TenantSubscription>(
        `/admin/tenants/${encodeURIComponent(selectedAgencyId)}/subscription`,
        { method: 'PATCH' },
        {
          planCode: subscriptionForm.planCode,
          status: subscriptionForm.status,
          seatsLimit: Number(subscriptionForm.seatsLimit || 0),
          seatsUsed: Number(subscriptionForm.seatsUsed || 0),
          billingEmail: subscriptionForm.billingEmail || undefined,
        },
      )
      setSelectedSubscription(updated)
      setSubscriptionForm({
        planCode: updated.planCode,
        status: updated.status,
        seatsLimit: String(updated.seatsLimit),
        seatsUsed: String(updated.seatsUsed),
        billingEmail: updated.billingEmail || '',
      })
      setSaasNotice('Zapisano subskrypcję tenanta.')
      const rows = await apiFetch<TenantSummary[]>('/admin/tenants/summary')
      setTenantSummary(rows)
    } catch (error) {
      setSaasError(error instanceof Error ? error.message : 'Nie udało się zapisać subskrypcji')
    } finally {
      setSaasSaving(false)
    }
  }

  const createBillingEvent = async () => {
    if (!selectedAgencyId) return
    try {
      setSaasSaving(true)
      setSaasError('')
      await apiJsonFetch<BillingEvent>('/admin/billing-events', { method: 'POST' }, {
        agencyId: selectedAgencyId,
        eventType: billingDraft.eventType,
        amountCents: Number(billingDraft.amountCents || 0),
        currency: billingDraft.currency,
        status: billingDraft.status,
        externalRef: billingDraft.externalRef || undefined,
      })
      setBillingDraft({
        eventType: 'invoice_created',
        amountCents: '0',
        currency: 'PLN',
        status: 'recorded',
        externalRef: '',
      })
      setSaasNotice('Dodano zdarzenie billingowe.')
      await loadTenantWorkspace(selectedAgencyId)
      const rows = await apiFetch<TenantSummary[]>('/admin/tenants/summary')
      setTenantSummary(rows)
    } catch (error) {
      setSaasError(error instanceof Error ? error.message : 'Nie udało się dodać zdarzenia billingowego')
    } finally {
      setSaasSaving(false)
    }
  }

  const loadOfferChanges = async (offerId: string) => {
    try {
      const changes = await apiFetch<any[]>(`/collectors/properties/${encodeURIComponent(offerId)}/changes`)
      setCollectorChanges(changes)
      setSelectedOfferId(offerId)
    } catch {
      setCollectorChanges([])
      setSelectedOfferId(offerId)
    }
  }

  const reloadImportData = async () => {
    try {
      const [src, j, list, rules] = await Promise.all([
        apiFetch<any[]>('/external-sources'),
        apiFetch<any[]>('/external-import/jobs'),
        apiFetch<any[]>('/external-listings?onlyActive=1'),
        apiFetch<any[]>('/external-alert-rules'),
      ])
      setSources(src)
      setJobs(j)
      setExternalListings(list)
      setAlertRules(rules)
    } catch {
      setSources([])
      setJobs([])
      setExternalListings([])
      setAlertRules([])
    }
  }

  const reloadIntegrationsData = async (agencyId?: string) => {
    const aid = agencyId ?? portalCrudAgencyId
    try {
      setIntegrationsLoading(true)
      setIntegrationsError('')
      const [portals, sourcesData] = await Promise.all([
        apiFetch<PortalIntegrationRecord[]>(`/portal-integrations?agencyId=${encodeURIComponent(aid)}`),
        apiFetch<ExternalSourceRecord[]>('/external-sources'),
      ])
      setPortalIntegrations(portals)
      setSourceRecords(sourcesData)
    } catch (error) {
      setPortalIntegrations([])
      setSourceRecords([])
      setIntegrationsError(error instanceof Error ? error.message : 'Nie udało się pobrać integracji')
    } finally {
      setIntegrationsLoading(false)
    }
  }

  const createPortalIntegration = async () => {
    if (!portalForm.portal.trim()) return
    try {
      setIntegrationsError('')
      await apiJsonFetch<PortalIntegrationRecord>('/portal-integrations', { method: 'POST' }, {
        agencyId: portalCrudAgencyId,
        portal: portalForm.portal.trim(),
        isActive: portalForm.isActive,
      })
      setPortalForm({ portal: '', isActive: true })
      setPortalFormOpen(false)
      setIntegrationsNotice('Dodano integrację portalową.')
      await reloadIntegrationsData()
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Nie udało się dodać integracji')
    }
  }

  const togglePortalIntegration = async (integration: PortalIntegrationRecord) => {
    try {
      setIntegrationsError('')
      const updated = await apiJsonFetch<PortalIntegrationRecord>(
        `/portal-integrations/${encodeURIComponent(integration.id)}`,
        { method: 'PATCH' },
        { isActive: !integration.isActive },
      )
      setPortalIntegrations((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setIntegrationsNotice(`Zmieniono status portalu ${updated.portal}.`)
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Nie udało się zaktualizować integracji')
    }
  }

  const deletePortalIntegration = async (integration: PortalIntegrationRecord) => {
    if (!confirm(`Usunąć integrację ${integration.portal}?`)) return
    try {
      setIntegrationsError('')
      await apiFetch(`/portal-integrations/${encodeURIComponent(integration.id)}`, { method: 'DELETE' })
      setPortalIntegrations((prev) => prev.filter((item) => item.id !== integration.id))
      setIntegrationsNotice(`Usunięto integrację ${integration.portal}.`)
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Nie udało się usunąć integracji')
    }
  }

  const toggleExternalSource = async (source: ExternalSourceRecord) => {
    try {
      setIntegrationsError('')
      const updated = await apiJsonFetch<ExternalSourceRecord>(`/external-sources/${encodeURIComponent(source.id)}`, { method: 'PATCH' }, {
        isActive: !source.isActive,
      })
      setSourceRecords((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setIntegrationsNotice(`Zmieniono status źródła ${updated.name}.`)
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Nie udało się zaktualizować źródła')
    }
  }

  const triggerExternalImport = async (sourceId?: string) => {
    try {
      setIntegrationsError('')
      await apiJsonFetch<{ results?: unknown[]; count?: number }>('/external-import/run', { method: 'POST' }, sourceId ? { sourceId } : {})
      setIntegrationsNotice(sourceId ? 'Uruchomiono import dla wybranego źródła.' : 'Uruchomiono import dla wszystkich aktywnych źródeł.')
      await reloadIntegrationsData()
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Nie udało się uruchomić importu')
    }
  }

  const reloadBackups = async () => {
    try {
      setBackupsLoading(true)
      setBackupError('')
      const rows = await apiFetch<BackupRecord[]>('/admin/backups')
      setBackupRecords(rows)
    } catch (error) {
      setBackupRecords([])
      setBackupError(error instanceof Error ? error.message : 'Nie udało się pobrać backupów')
    } finally {
      setBackupsLoading(false)
    }
  }

  const createBackup = async () => {
    try {
      setBackupError('')
      await apiFetch<BackupRecord>('/admin/backups', { method: 'POST' })
      setBackupNotice('Utworzono nowy backup bazy danych.')
      await reloadBackups()
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Nie udało się utworzyć backupu')
    }
  }

  const downloadBackup = async (backup: BackupRecord) => {
    try {
      setBackupError('')
      const authRaw = window.localStorage.getItem('mwpanel-auth')
      const token = authRaw ? JSON.parse(authRaw)?.state?.token : null
      if (!token) {
        throw new Error('Brak tokenu autoryzacji do pobrania backupu')
      }

      const response = await fetch(backup.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = backup.fileName
      a.click()
      URL.revokeObjectURL(url)
      setBackupNotice(`Pobrano backup ${backup.fileName}.`)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Nie udało się pobrać backupu')
    }
  }

  const deleteBackup = async (backup: BackupRecord) => {
    if (!confirm(`Usunąć backup ${backup.fileName}?`)) return
    try {
      setBackupError('')
      await apiFetch(`/admin/backups/${encodeURIComponent(backup.fileName)}`, { method: 'DELETE' })
      setBackupRecords((prev) => prev.filter((b) => b.fileName !== backup.fileName))
      setBackupNotice(`Usunięto backup ${backup.fileName}.`)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Nie udało się usunąć backupu')
    }
  }


  const filteredExternalListings = useMemo(() => {
    return externalListings.filter((item) => {
      const text = `${item.title || ''} ${item.city || ''} ${item.sourceName || ''}`.toLowerCase()
      if (importSearch && !text.includes(importSearch.toLowerCase())) return false
      if (importSourceFilter !== 'all' && item.sourceCode !== importSourceFilter) return false
      if (importTypeFilter !== 'all' && item.propertyType !== importTypeFilter) return false
      if (importStatusFilter !== 'all' && item.status !== importStatusFilter) return false
      return true
    })
  }, [externalListings, importSearch, importSourceFilter, importTypeFilter, importStatusFilter])

  useEffect(() => {
    if (activeTab === 'users') {
      void reloadUsers()
    }
    if (activeTab === 'import') {
      void reloadImportData()
    }
    if (activeTab === 'collectors') {
      void reloadCollectorsData()
    }
    if (activeTab === 'saas') {
      void reloadSaasSummary()
    }
    if (activeTab === 'integrations') {
      void reloadIntegrationsData()
    }
    if (activeTab === 'backup') {
      void reloadBackups()
    }
  }, [activeTab])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">Panel administracyjny</h1>
        <p className="text-gray-600 dark:text-gray-300">Zarządzanie systemem MWPanel</p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
        <div className="flex overflow-x-auto p-2 gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              <tab.icon size={18} />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800 p-6">
        {activeTab === 'users' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Użytkownicy systemu</h2>
              <button onClick={() => void reloadUsers()} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                Odśwież
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
              <h3 className="font-medium">Dodaj nowego użytkownika</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <input value={newUser.firstName} onChange={(e) => setNewUser((p) => ({ ...p, firstName: e.target.value }))} placeholder="Imię" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                <input value={newUser.lastName} onChange={(e) => setNewUser((p) => ({ ...p, lastName: e.target.value }))} placeholder="Nazwisko" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                <input value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} placeholder="E-mail" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                <input value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} type="password" placeholder="Hasło (min. 8)" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                <select value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))} title="Rola" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                  <option value="agent">Agent</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {userCreateError ? <p className="text-sm text-red-500">{userCreateError}</p> : null}
              <button onClick={() => void createUser()} disabled={userCreateLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                <Plus size={16} /> {userCreateLoading ? 'Dodawanie...' : 'Dodaj użytkownika'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Użytkownik</th>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Email</th>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Rola</th>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Status</th>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Online</th>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Ostatnie logowanie</th>
                    <th className="text-left py-3 px-4 text-[#f1f5f9]">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr><td className="py-3 px-4 text-sm text-gray-500" colSpan={7}>Ładowanie użytkowników...</td></tr>
                  ) : usersList.length === 0 ? (
                    <tr><td className="py-3 px-4 text-sm text-gray-500" colSpan={7}>Brak użytkowników.</td></tr>
                  ) : usersList.map((u) => (
                    <tr key={u.id} className="border-b border-gray-200 dark:border-slate-700">
                      <td className="py-3 px-4 text-[#f1f5f9]">{u.fullName || u.email}</td>
                      <td className="py-3 px-4 text-[#f1f5f9]">{u.email}</td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) => void updateUser(u.id, { role: e.target.value })}
                          disabled={userActionLoading === u.id}
                          title="Rola użytkownika"
                          className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="agent">agent</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.status}
                          onChange={(e) => void updateUser(u.id, { status: e.target.value })}
                          disabled={userActionLoading === u.id}
                          title="Status użytkownika"
                          className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="active">active</option>
                          <option value="inactive">inactive</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {isOnline(u.lastSeenAt) ? (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                            </span>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-300 dark:bg-slate-600" />
                          )}
                          <span className="text-xs text-[#9fb0c5]">
                            {isOnline(u.lastSeenAt) ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatDateTime(u.lastLoginAt)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => void deleteUser(u.id, u.email)}
                          disabled={userActionLoading === u.id}
                          className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Usuń
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Ustawienia agencji</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Nazwa agencji</label>
                <input
                  type="text"
                  defaultValue="MWPanel Nieruchomości"
                  title="Nazwa agencji"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Email powiadomień</label>
                <input
                  type="email"
                  defaultValue="biuro@mwpanel.pl"
                  title="Email powiadomień"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="autoPublish" className="w-5 h-5 rounded" />
                <label htmlFor="autoPublish" className="text-sm text-gray-700 dark:text-gray-200">
                  Automatyczna publikacja ofert na portalach
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="docPrefix" defaultChecked className="w-5 h-5 rounded" />
                <label htmlFor="docPrefix" className="text-sm text-gray-700 dark:text-gray-200">
                  Używaj prefiksów w numeracji dokumentów
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Log operacji</h2>
            <div className="space-y-2">
              {[
                { action: 'LOGIN', user: 'jan.kowalski', time: '2025-01-15 14:30', ip: '192.168.1.100' },
                { action: 'DOCUMENT_CREATED', user: 'jan.kowalski', time: '2025-01-15 14:15', ip: '192.168.1.100' },
                { action: 'LOGIN', user: 'anna.smith', time: '2025-01-15 13:45', ip: '192.168.1.101' },
                { action: 'LISTING_CREATED', user: 'anna.smith', time: '2025-01-15 12:30', ip: '192.168.1.101' },
              ].map((log, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/60 rounded">
                  <div>
                    <span className="font-medium">{log.action}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-300 ml-2">{log.user}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {log.time} · {log.ip}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'saas' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Tenanty i subskrypcje</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">Warstwa administracyjna planów, billing events i dokumentacji API.</p>
              </div>
              <button onClick={() => void reloadSaasSummary()} className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-800 inline-flex items-center gap-2">
                <RefreshCcw size={14} /> Odśwież
              </button>
            </div>

            {saasError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saasError}</div> : null}
            {saasNotice ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{saasNotice}</div> : null}

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.4fr] gap-6">
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Lista tenantów</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-300">{tenantSummary.length} rekordów</span>
                </div>
                <div className="space-y-2 max-h-128 overflow-auto pr-1">
                  {tenantSummary.map((tenant) => (
                    <button
                      key={tenant.agencyId}
                      onClick={() => {
                        setSelectedAgencyId(tenant.agencyId)
                        void loadTenantWorkspace(tenant.agencyId)
                      }}
                      className={`w-full text-left rounded-lg border p-3 ${selectedAgencyId === tenant.agencyId ? 'border-blue-500 bg-blue-50 dark:bg-slate-800' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/70'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{tenant.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-300">{tenant.email}</p>
                        </div>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 uppercase">{tenant.planCode}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <span>Status: {tenant.status}</span>
                        <span>Seaty: {tenant.seatsUsed}/{tenant.seatsLimit}</span>
                        <span>Billing: {tenant.billingEvents}</span>
                        <span>{tenant.lastBillingEventAt ? `Ostatni event: ${formatDateTime(tenant.lastBillingEventAt)}` : 'Brak eventów'}</span>
                      </div>
                    </button>
                  ))}
                  {!saasLoading && tenantSummary.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-300">Brak tenantów do wyświetlenia.</p> : null}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Subskrypcja</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{selectedSubscription ? `Tenant: ${selectedSubscription.agencyId}` : 'Wybierz tenant z listy.'}</p>
                    </div>
                    {selectedSubscription?.currentPeriodEnd ? <span className="text-xs text-gray-500 dark:text-gray-300">Okres do: {formatDateTime(selectedSubscription.currentPeriodEnd)}</span> : null}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select value={subscriptionForm.planCode} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, planCode: e.target.value }))} title="Plan subskrypcji" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                      <option value="starter">starter</option>
                      <option value="growth">growth</option>
                      <option value="pro">pro</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                    <select value={subscriptionForm.status} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, status: e.target.value }))} title="Status subskrypcji" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                      <option value="trial">trial</option>
                      <option value="active">active</option>
                      <option value="past_due">past_due</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <input value={subscriptionForm.seatsLimit} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, seatsLimit: e.target.value }))} title="Limit seatów" placeholder="Limit seatów" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                    <input value={subscriptionForm.seatsUsed} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, seatsUsed: e.target.value }))} title="Wykorzystane seaty" placeholder="Wykorzystane seaty" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                    <input value={subscriptionForm.billingEmail} onChange={(e) => setSubscriptionForm((prev) => ({ ...prev, billingEmail: e.target.value }))} title="Email billingowy" placeholder="Email billingowy" className="md:col-span-2 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => void saveSubscription()} disabled={!selectedAgencyId || saasSaving} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                      {saasSaving ? 'Zapisywanie...' : 'Zapisz subskrypcję'}
                    </button>
                    <a href="/api/docs" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                      Otwórz API docs
                    </a>
                    <a href="/api/docs/openapi.json" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                      OpenAPI JSON
                    </a>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Billing events</h3>
                    <span className="text-xs text-gray-500 dark:text-gray-300">{billingEvents.length} ostatnich wpisów</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select value={billingDraft.eventType} onChange={(e) => setBillingDraft((prev) => ({ ...prev, eventType: e.target.value }))} title="Typ zdarzenia" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                      <option value="invoice_created">invoice_created</option>
                      <option value="invoice_paid">invoice_paid</option>
                      <option value="invoice_failed">invoice_failed</option>
                      <option value="subscription_updated">subscription_updated</option>
                      <option value="manual_adjustment">manual_adjustment</option>
                    </select>
                    <input value={billingDraft.amountCents} onChange={(e) => setBillingDraft((prev) => ({ ...prev, amountCents: e.target.value }))} title="Kwota w groszach" placeholder="Kwota w groszach" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                    <input value={billingDraft.currency} onChange={(e) => setBillingDraft((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} title="Waluta" placeholder="Waluta" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                    <select value={billingDraft.status} onChange={(e) => setBillingDraft((prev) => ({ ...prev, status: e.target.value }))} title="Status zdarzenia" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                      <option value="recorded">recorded</option>
                      <option value="pending">pending</option>
                      <option value="paid">paid</option>
                      <option value="failed">failed</option>
                    </select>
                    <input value={billingDraft.externalRef} onChange={(e) => setBillingDraft((prev) => ({ ...prev, externalRef: e.target.value }))} title="External reference" placeholder="External ref" className="md:col-span-3 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" />
                    <button onClick={() => void createBillingEvent()} disabled={!selectedAgencyId || saasSaving} className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                      Dodaj event
                    </button>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-auto pr-1">
                    {billingEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{event.eventType}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-300">{event.externalRef || 'Brak external ref'} · {formatDateTime(event.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 dark:text-white">{(event.amountCents / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {event.currency}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-300 uppercase">{event.status}</p>
                        </div>
                      </div>
                    ))}
                    {!saasLoading && billingEvents.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-300">Brak zdarzeń billingowych dla wybranego tenanta.</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Integracje z portalami i źródłami</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">Podgląd portali publikacyjnych i kolektorów importu z realnego backendu.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void triggerExternalImport()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                  Uruchom import
                </button>
                <button onClick={() => void reloadIntegrationsData()} className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-800 inline-flex items-center gap-2">
                  <RefreshCcw size={14} /> Odśwież
                </button>
              </div>
            </div>

            {integrationsError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{integrationsError}</div> : null}
            {integrationsNotice ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{integrationsNotice}</div> : null}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Integracje portalowe</h3>
                  <button
                    onClick={() => setPortalFormOpen((v) => !v)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
                  >
                    <Plus size={14} /> Dodaj integrację
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Agency ID:</label>
                  <input
                    value={portalCrudAgencyId}
                    onChange={(e) => { setPortalCrudAgencyId(e.target.value) }}
                    onBlur={() => void reloadIntegrationsData(portalCrudAgencyId)}
                    className="flex-1 px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-xs"
                  />
                </div>
                {portalFormOpen && (
                  <div className="border border-emerald-200 bg-emerald-50 dark:bg-slate-800 dark:border-slate-600 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium">Nowa integracja portalowa</p>
                    <div className="flex gap-2">
                      <select
                        value={portalForm.portal}
                        onChange={(e) => setPortalForm((f) => ({ ...f, portal: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
                      >
                        <option value="">Wybierz portal</option>
                        <option value="otodom">Otodom</option>
                        <option value="olx">OLX</option>
                        <option value="gratka">Gratka</option>
                        <option value="domiporta">Domiporta</option>
                        <option value="morizon">Morizon</option>
                        <option value="custom">Inny (custom)</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={portalForm.isActive}
                          onChange={(e) => setPortalForm((f) => ({ ...f, isActive: e.target.checked }))}
                        />
                        Aktywna
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setPortalFormOpen(false)} className="px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">Anuluj</button>
                      <button onClick={() => void createPortalIntegration()} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">Zapisz</button>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {portalIntegrations.map((portal) => (
                    <div key={portal.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded flex items-center justify-center text-sm font-bold uppercase">
                          {portal.portal[0]}
                        </div>
                        <div>
                          <p className="font-medium uppercase">{portal.portal}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            {portal.isActive ? 'Aktywna' : 'Wstrzymana'}
                            {portal.lastImportStatus ? ` · ostatni import: ${portal.lastImportStatus}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void togglePortalIntegration(portal)}
                          className={`px-2.5 py-1 rounded-full text-xs ${portal.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          {portal.isActive ? 'Aktywna' : 'Wyłączona'}
                        </button>
                        <button
                          onClick={() => void deletePortalIntegration(portal)}
                          className="px-2.5 py-1 rounded-lg text-xs text-red-600 border border-red-200 hover:bg-red-50"
                        >
                          Usuń
                        </button>
                      </div>
                    </div>
                  ))}
                  {!integrationsLoading && portalIntegrations.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-300">Brak skonfigurowanych integracji portalowych.</p> : null}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Zewnętrzne źródła ofert</h3>
                <div className="space-y-3">
                  {sourceRecords.map((source) => (
                    <div key={source.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
                      <div>
                        <p className="font-medium">{source.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{source.code} · {source.lastStatus || 'brak statusu'} · {source.lastSyncAt ? formatDateTime(source.lastSyncAt) : 'brak sync'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => void triggerExternalImport(source.id)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm hover:bg-gray-50 dark:hover:bg-slate-800">
                          Importuj
                        </button>
                        <button onClick={() => void toggleExternalSource(source)} className={`px-3 py-2 rounded-lg text-sm ${source.isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                          {source.isActive ? 'Aktywne' : 'Wyłączone'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!integrationsLoading && sourceRecords.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-300">Brak źródeł zewnętrznych.</p> : null}
                </div>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'import' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Import ofert zewnętrznych</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => void apiFetch('/external-import/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(() => reloadImportData())}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Uruchom ręcznie
                </button>
                <button onClick={() => void reloadImportData()} className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm hover:bg-gray-50 dark:bg-slate-800/60 inline-flex items-center gap-1">
                  <RefreshCcw size={14} /> Odśwież
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sources.map((source) => (
                <div key={source.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                  <p className="font-semibold">{source.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Status: {source.lastStatus || 'brak'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-300">Ostatni sync: {source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleString('pl-PL') : '-'}</p>
                </div>
              ))}
            </div>


            <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Reguły alertów</h3>
                <button
                  onClick={() => void apiFetch('/external-alert-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                    name: 'Działka budowlana dolnośląskie',
                    rule: {
                      events: ['created', 'price_changed'],
                      channels: ['in_app', 'discord', 'telegram', 'webhook', 'email'],
                      criteria: { offerType: 'sale', propertyType: 'plot', plotType: 'building', voivodeship: 'dolnośląskie' },
                    },
                    isActive: true,
                  }) }).then(() => reloadImportData())}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                >
                  Dodaj przykładową regułę
                </button>
              </div>
              <div className="space-y-2 max-h-36 overflow-auto">
                {alertRules.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">Brak reguł.</p> : alertRules.map((rule) => (
                  <div key={rule.id} className="text-sm border rounded p-2 flex justify-between items-center">
                    <span>{rule.name}</span>
                    <button onClick={() => void apiFetch(`/external-alert-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' }).then(() => reloadImportData())} className="text-red-600 text-xs">Usuń</button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">Kanały z ENV: EXTERNAL_ALERT_WEBHOOK_URL, EXTERNAL_ALERT_DISCORD_WEBHOOK_URL, EXTERNAL_ALERT_TELEGRAM_BOT_TOKEN, EXTERNAL_ALERT_TELEGRAM_CHAT_ID, RESEND_API_KEY + EXTERNAL_ALERT_EMAIL_TO</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Ostatnie joby importu</h3>
              <div className="space-y-2">
                {jobs.slice(0, 6).map((job) => (
                  <div key={job.id} className="flex justify-between border border-gray-200 dark:border-slate-700 rounded-lg p-3 text-sm">
                    <span>{job.sourceName || job.sourceCode}</span>
                    <span>{job.status} | +{job.newCount} / ~{job.updatedCount} / -{job.inactiveCount}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Zaimportowane oferty (aktywne)</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setImportViewMode('cards')}
                    className={`px-2.5 py-1 rounded text-xs ${importViewMode === 'cards' ? 'bg-blue-600 text-white' : 'border text-gray-600 dark:text-gray-300'}`}
                  >Kafelki</button>
                  <button
                    onClick={() => setImportViewMode('list')}
                    className={`px-2.5 py-1 rounded text-xs ${importViewMode === 'list' ? 'bg-blue-600 text-white' : 'border text-gray-600 dark:text-gray-300'}`}
                  >Lista</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                <input
                  value={importSearch}
                  onChange={(e) => setImportSearch(e.target.value)}
                  placeholder="Szukaj (tytuł/miasto/źródło)"
                  className="md:col-span-2 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
                />
                <select value={importSourceFilter} onChange={(e) => setImportSourceFilter(e.target.value)} title="Filtr źródła" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                  <option value="all">Wszystkie źródła</option>
                  {[...new Set(externalListings.map((x) => x.sourceCode).filter(Boolean))].map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <select value={importTypeFilter} onChange={(e) => setImportTypeFilter(e.target.value)} title="Filtr typu" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                  <option value="all">Wszystkie typy</option>
                  <option value="flat">Mieszkanie</option>
                  <option value="house">Dom</option>
                  <option value="plot">Działka</option>
                  <option value="commercial">Lokal</option>
                </select>
                <select value={importStatusFilter} onChange={(e) => setImportStatusFilter(e.target.value)} title="Filtr statusu" className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                  <option value="all">Wszystkie statusy</option>
                  <option value="new">new</option>
                  <option value="active">active</option>
                  <option value="updated">updated</option>
                </select>
              </div>

              {importViewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-136 overflow-auto pr-1">
                  {filteredExternalListings.slice(0, 120).map((item) => (
                    <div key={item.id} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white">
                      <div className="h-36 bg-gray-100 dark:bg-slate-800">
                        {item.images?.[0] ? (
                          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[#4a5f7a]">Brak zdjęcia</div>
                        )}
                      </div>
                      <div className="p-3 text-sm">
                        <p className="font-medium line-clamp-2">{item.title}</p>
                        <p className="text-gray-500 dark:text-gray-300">{item.sourceName} • {item.city || '-'}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="font-semibold">{(item.price || 0).toLocaleString('pl-PL')} PLN</p>
                          <span className="text-xs text-gray-500 dark:text-gray-300">{item.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {filteredExternalListings.slice(0, 200).map((item) => (
                    <div key={item.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-16 h-12 bg-gray-100 dark:bg-slate-800 rounded overflow-hidden shrink-0">
                          {item.images?.[0] ? <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" /> : null}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-gray-500 dark:text-gray-300 truncate">{item.sourceName} • {item.city || '-'} • {item.propertyType}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{(item.price || 0).toLocaleString('pl-PL')} PLN</p>
                        <p className="text-xs text-gray-500 dark:text-gray-300">{item.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Kopie zapasowe danych</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">Lista backupów z katalogu danych oraz ręczne tworzenie nowej kopii.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void createBackup()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                  Utwórz backup
                </button>
                <button onClick={() => void reloadBackups()} className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-800 inline-flex items-center gap-2">
                  <RefreshCcw size={14} /> Odśwież
                </button>
              </div>
            </div>

            {backupError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{backupError}</div> : null}
            {backupNotice ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{backupNotice}</div> : null}

            <div className="space-y-3">
              {backupRecords.map((backup) => (
                <div key={backup.fileName} className="flex items-center justify-between p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <div>
                    <p className="font-medium">{backup.fileName}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Utworzono: {formatDateTime(backup.createdAt)} · Rozmiar: {(backup.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => void downloadBackup(backup)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 dark:bg-slate-800/60 dark:text-gray-200 dark:border-slate-700">
                      Pobierz
                    </button>
                    <button onClick={() => void deleteBackup(backup)} className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
              {!backupsLoading && backupRecords.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-300">Brak dostępnych backupów.</p> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Admin
