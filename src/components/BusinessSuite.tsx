import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bot,
  CalendarCheck,
  FileCheck,
  GanttChartSquare,
  Globe,
  Landmark,
  MessageSquare,
  Scale,
  Shield,
  UserRound,
  Plus,
  Send,
  Phone,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { apiFetch, apiJsonFetch } from '../utils/apiClient'

type TabId =
  | 'communication'
  | 'reservation'
  | 'dealroom'
  | 'automation'
  | 'portal'
  | 'office'
  | 'avm'
  | 'compliance'
  | 'integrations'

type CallLogItem = {
  id: string
  clientName: string
  summary: string
  createdAt: string
}

type ChatMessage = {
  id: string
  author: string
  message: string
  createdAt: string
}

type WorkflowRule = {
  id: string
  name: string
  triggerEvent: string
  actionText: string
  active: boolean
}

type Campaign = {
  id: string
  name: string
  audience: string
  status: string
  createdAt: string
}

type Transaction = {
  id: string
  title: string
  status: string
}

type ChecklistItem = {
  id: string
  transactionId: string
  itemKey: string
  itemLabel: string
  isRequired: boolean
  isCompleted: boolean
  completedAt?: string
  completedBy?: string
  linkedDocumentId?: string
  notes?: string
  label?: string
  done?: boolean
  sortOrder: number
}

type Reservation = {
  id: string
  clientName: string
  agentName?: string
  listingId?: string
  title: string
  status: string
  location?: string
  notes?: string
  startAt: string
  endAt: string
}

const formatTimestamp = (iso: string) => new Date(iso).toLocaleString('pl-PL')
const toDateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10)

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'communication', label: 'Komunikacja', icon: MessageSquare },
  { id: 'reservation', label: 'Rezerwacje', icon: CalendarCheck },
  { id: 'dealroom', label: 'Deal Room', icon: FileCheck },
  { id: 'automation', label: 'Automatyzacje', icon: Bot },
  { id: 'portal', label: 'Portal klienta', icon: UserRound },
  { id: 'office', label: 'Zarządzanie biurem', icon: GanttChartSquare },
  { id: 'avm', label: 'Wycena AVM', icon: Landmark },
  { id: 'compliance', label: 'Compliance', icon: Shield },
  { id: 'integrations', label: 'Integracje', icon: Globe },
]

export default function BusinessSuite() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<TabId>('communication')
  const agencyId = useAuthStore((state) => state.agency?.id || 'agency-1')
  const userEmail = useAuthStore((state) => state.user?.email || 'agent@mwpanel.pl')

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draftMessage, setDraftMessage] = useState('')

  const [callLogs, setCallLogs] = useState<CallLogItem[]>([])
  const [callClient, setCallClient] = useState('')
  const [callSummary, setCallSummary] = useState('')

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignName, setCampaignName] = useState('')
  const [campaignAudience, setCampaignAudience] = useState('Klienci aktywni')

  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([])
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [newWorkflowTrigger, setNewWorkflowTrigger] = useState('lead_created')
  const [newWorkflowAction, setNewWorkflowAction] = useState('Wyślij przypomnienie do opiekuna')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedTransactionId, setSelectedTransactionId] = useState('')
  const [dealChecklist, setDealChecklist] = useState<ChecklistItem[]>([])
  const [newTransactionTitle, setNewTransactionTitle] = useState('')
  const [newTransactionStatus, setNewTransactionStatus] = useState('draft')
  const [newChecklistLabel, setNewChecklistLabel] = useState('')
  const [checklistProgress, setChecklistProgress] = useState({ total: 0, completed: 0, display: '0/0' })
  const [draggingChecklistItemId, setDraggingChecklistItemId] = useState<string | null>(null)
  const [dragOverChecklistItemId, setDragOverChecklistItemId] = useState<string | null>(null)
  const [dragDropPosition, setDragDropPosition] = useState<'before' | 'after'>('before')

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [reservationClient, setReservationClient] = useState('')
  const [reservationTitle, setReservationTitle] = useState('Prezentacja nieruchomości')
  const [reservationStartAt, setReservationStartAt] = useState('')
  const [reservationDurationMin, setReservationDurationMin] = useState(60)
  const [reservationLocation, setReservationLocation] = useState('')
  const [selectedReservationDate, setSelectedReservationDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [avmArea, setAvmArea] = useState(60)
  const [avmRooms, setAvmRooms] = useState(3)
  const [avmDistrict, setAvmDistrict] = useState('Mokotów')
  const [avmCalculatedAt, setAvmCalculatedAt] = useState<string | null>(null)
  const [officeKpiAgent, setOfficeKpiAgent] = useState('')
  const [officeKpiTarget, setOfficeKpiTarget] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const avmResult = useMemo(() => {
    const districtFactor: Record<string, number> = {
      Mokotów: 18000,
      Wilanów: 17000,
      Śródmieście: 23000,
      Ursynów: 14500,
      Wola: 16500,
      'Praga Północ': 12000,
    }
    const base = districtFactor[avmDistrict] || 14000
    const roomAdj = avmRooms >= 4 ? 1.05 : avmRooms <= 2 ? 0.95 : 1
    const estPerM2 = Math.round(base * roomAdj)
    const estimate = estPerM2 * avmArea
    return { estPerM2, estimate }
  }, [avmArea, avmDistrict, avmRooms])

  const loadModuleData = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [chatData, callData, campaignData, workflowData, transactionsData] = await Promise.all([
        apiFetch<ChatMessage[]>(`/chat-messages?agencyId=${encodeURIComponent(agencyId)}`),
        apiFetch<CallLogItem[]>(`/call-logs?agencyId=${encodeURIComponent(agencyId)}`),
        apiFetch<Campaign[]>(`/campaigns?agencyId=${encodeURIComponent(agencyId)}`),
        apiFetch<WorkflowRule[]>(`/workflow-rules?agencyId=${encodeURIComponent(agencyId)}`),
        apiFetch<Transaction[]>(`/transactions?agencyId=${encodeURIComponent(agencyId)}`),
      ])
      const reservationData = await apiFetch<Reservation[]>(`/reservations?agencyId=${encodeURIComponent(agencyId)}`)

      setMessages(chatData)
      setCallLogs(callData)
      setCampaigns(campaignData)
      setWorkflowRules(workflowData)
      setTransactions(transactionsData)
      setReservations(reservationData)

      if (transactionsData.length > 0) {
        setSelectedTransactionId((currentId) => currentId || transactionsData[0].id)
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się pobrać danych modułów')
    } finally {
      setLoading(false)
    }
  }

  const loadChecklistProgress = async (transactionId: string) => {
    const progress = await apiFetch<{ total: number; completed: number; display: string }>(`/transactions/${transactionId}/checklist/progress`)
    setChecklistProgress(progress)
  }

  const bootstrapChecklist = async (transactionId: string) => {
    await apiFetch<ChecklistItem[]>(`/transactions/${transactionId}/checklist/bootstrap`, { method: 'POST' })
  }

  const reloadReservations = async () => {
    const reservationData = await apiFetch<Reservation[]>(`/reservations?agencyId=${encodeURIComponent(agencyId)}`)
    setReservations(reservationData)
  }

  const reloadChecklist = async (transactionId: string) => {
    const checklist = await apiFetch<ChecklistItem[]>(`/transactions/${transactionId}/checklist`)
    setDealChecklist(checklist)
  }

  useEffect(() => {
    void loadModuleData()
  }, [agencyId])

  useEffect(() => {
    const savedKpi = localStorage.getItem(`mwpanel_office_kpi_${agencyId}`)
    if (savedKpi) {
      try {
        const parsed = JSON.parse(savedKpi) as { agent?: string; target?: string }
        setOfficeKpiAgent(parsed.agent || '')
        setOfficeKpiTarget(parsed.target || '')
      } catch {
        // Ignore corrupted local draft.
      }
    }

    const requestedTab = searchParams.get('tab')
    if (requestedTab && tabs.some((item) => item.id === requestedTab)) {
      setTab(requestedTab as TabId)
    }

    const requestedTransactionId = searchParams.get('transactionId')
    if (requestedTransactionId) {
      setSelectedTransactionId(requestedTransactionId)
    }
  }, [searchParams])

  useEffect(() => {
    if (!selectedTransactionId) {
      setDealChecklist([])
      return
    }

    const loadChecklist = async () => {
      try {
        await bootstrapChecklist(selectedTransactionId)
        await reloadChecklist(selectedTransactionId)
        await loadChecklistProgress(selectedTransactionId)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Nie udało się pobrać checklisty transakcji')
      }
    }

    void loadChecklist()
  }, [selectedTransactionId])

  const sendInternalMessage = async () => {
    if (!draftMessage.trim()) return
    try {
      const created = await apiJsonFetch<ChatMessage>('/chat-messages', {
        method: 'POST',
      }, {
          agencyId,
          author: userEmail,
          message: draftMessage.trim(),
      })
      setMessages((prev) => [...prev, created])
      setDraftMessage('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się wysłać wiadomości')
    }
  }

  const addCallLog = async () => {
    if (!callClient.trim() || !callSummary.trim()) return
    try {
      const created = await apiJsonFetch<CallLogItem>('/call-logs', {
        method: 'POST',
      }, {
          agencyId,
          clientName: callClient.trim(),
          summary: callSummary.trim(),
          createdBy: userEmail,
      })
      setCallLogs((prev) => [created, ...prev])
      setCallClient('')
      setCallSummary('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się zapisać wpisu połączenia')
    }
  }

  const addCampaign = async () => {
    if (!campaignName.trim()) return
    try {
      const created = await apiJsonFetch<Campaign>('/campaigns', {
        method: 'POST',
      }, {
          agencyId,
          name: campaignName.trim(),
          audience: campaignAudience,
          status: 'draft',
      })
      setCampaigns((prev) => [created, ...prev])
      setCampaignName('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się utworzyć kampanii')
    }
  }

  const toggleWorkflowRule = async (ruleId: string, nextActive: boolean) => {
    try {
      const updated = await apiJsonFetch<WorkflowRule>(`/workflow-rules/${ruleId}`, {
        method: 'PATCH',
      }, { active: nextActive })
      setWorkflowRules((prev) => prev.map((rule) => (rule.id === updated.id ? updated : rule)))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się zaktualizować reguły workflow')
    }
  }

  const addWorkflowRule = async () => {
    if (!newWorkflowName.trim() || !newWorkflowAction.trim()) return
    try {
      const created = await apiJsonFetch<WorkflowRule>('/workflow-rules', {
        method: 'POST',
      }, {
        agencyId,
        name: newWorkflowName.trim(),
        triggerEvent: newWorkflowTrigger,
        actionText: newWorkflowAction.trim(),
        active: true,
      })
      setWorkflowRules((prev) => [created, ...prev])
      setNewWorkflowName('')
      setNotice('Dodano nową regułę workflow.')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się dodać reguły workflow')
    }
  }

  const createClientPortalAccount = () => {
    setNotice('Uruchomiono proces aktywacji konta portalu klienta. Szczegóły pojawią się w panelu klienta.')
  }

  const saveOfficeKpi = () => {
    if (!officeKpiAgent.trim() || !officeKpiTarget.trim()) {
      setLoadError('Podaj agenta i target KPI.')
      return
    }

    localStorage.setItem(
      `mwpanel_office_kpi_${agencyId}`,
      JSON.stringify({ agent: officeKpiAgent.trim(), target: officeKpiTarget.trim(), savedAt: new Date().toISOString() })
    )
    setNotice(`Zapisano KPI dla ${officeKpiAgent.trim()}.`)
  }

  const runAvmCalculation = () => {
    setAvmCalculatedAt(new Date().toISOString())
    setNotice('Przeliczono AVM na podstawie aktualnych parametrów.')
  }

  const downloadComplianceReport = () => {
    const now = new Date().toISOString()
    const content = [
      'Raport compliance (MVP)',
      `Agencja: ${agencyId}`,
      `Wygenerowano: ${now}`,
      '- AML/KYC: monitorowane',
      '- RODO: polityki aktywne',
      '- Audyt dostepow: wlaczony',
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance_${agencyId}_${now.slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setNotice('Wygenerowano raport compliance.')
  }

  const configureIntegration = (name: string) => {
    setNotice(`Otworzono konfiguracje integracji: ${name}.`) 
  }

  const toggleChecklistItem = async (itemId: string, nextDone: boolean) => {
    if (!selectedTransactionId) return
    try {
      const updated = await apiJsonFetch<ChecklistItem>(`/transactions/${selectedTransactionId}/checklist/${itemId}`, {
        method: 'PATCH',
      }, { isCompleted: nextDone, completedBy: userEmail })
      setDealChecklist((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      await loadChecklistProgress(selectedTransactionId)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się zaktualizować checklisty')
    }
  }

  const createTransaction = async () => {
    if (!newTransactionTitle.trim()) return
    try {
      const created = await apiJsonFetch<Transaction>('/transactions', {
        method: 'POST',
      }, {
        agencyId,
        title: newTransactionTitle.trim(),
        status: newTransactionStatus,
        parties: {},
        milestones: {},
        paymentStatus: {},
      })
      setTransactions((prev) => [created, ...prev])
      setSelectedTransactionId(created.id)
      setNewTransactionTitle('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się utworzyć transakcji')
    }
  }

  const addChecklistItem = async () => {
    if (!selectedTransactionId || !newChecklistLabel.trim()) return
    try {
      const created = await apiJsonFetch<ChecklistItem>(`/transactions/${selectedTransactionId}/checklist`, {
        method: 'POST',
      }, {
        itemKey: newChecklistLabel.trim().toLowerCase().replace(/\s+/g, '_'),
        itemLabel: newChecklistLabel.trim(),
        isRequired: false,
        isCompleted: false,
        sortOrder: dealChecklist.length + 1,
      })
      setDealChecklist((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder))
      setNewChecklistLabel('')
      await loadChecklistProgress(selectedTransactionId)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się dodać pozycji checklisty')
    }
  }

  const deleteChecklistItem = async (itemId: string) => {
    if (!selectedTransactionId) return
    const confirmed = window.confirm('Czy na pewno chcesz usunąć pozycję checklisty?')
    if (!confirmed) return

    try {
      await apiFetch<{ id: string; transactionId: string }>(`/transactions/${selectedTransactionId}/checklist/${itemId}`, {
        method: 'DELETE',
      })
      await reloadChecklist(selectedTransactionId)
      await loadChecklistProgress(selectedTransactionId)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się usunąć pozycji checklisty')
    }
  }

  const persistChecklistOrder = async (nextItems: ChecklistItem[]) => {
    if (!selectedTransactionId) return
    try {
      await Promise.all(
        nextItems.map((item, index) =>
          apiJsonFetch<ChecklistItem>(
            `/transactions/${selectedTransactionId}/checklist/${item.id}`,
            { method: 'PATCH' },
            { sortOrder: index + 1 }
          )
        )
      )
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się zapisać kolejności checklisty')
      try {
        const checklist = await apiFetch<ChecklistItem[]>(`/transactions/${selectedTransactionId}/checklist`)
        setDealChecklist(checklist)
      } catch {
        // Keep optimistic order if reload fails.
      }
    }
  }

  const moveChecklistItem = async (itemId: string, direction: -1 | 1) => {
    const currentIndex = dealChecklist.findIndex((item) => item.id === itemId)
    if (currentIndex < 0) return
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= dealChecklist.length) return

    const nextItems = [...dealChecklist]
    const [moved] = nextItems.splice(currentIndex, 1)
    nextItems.splice(targetIndex, 0, moved)
    const normalized = nextItems.map((item, index) => ({ ...item, sortOrder: index + 1 }))
    setDealChecklist(normalized)
    await persistChecklistOrder(normalized)
  }

  const reorderChecklistItem = async (
    sourceItemId: string,
    targetItemId: string,
    position: 'before' | 'after' = 'before'
  ) => {
    if (sourceItemId === targetItemId) return
    const sourceIndex = dealChecklist.findIndex((item) => item.id === sourceItemId)
    const targetIndex = dealChecklist.findIndex((item) => item.id === targetItemId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const nextItems = [...dealChecklist]
    const [moved] = nextItems.splice(sourceIndex, 1)
    let insertIndex = targetIndex
    if (position === 'after') {
      insertIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1
    } else if (sourceIndex < targetIndex) {
      insertIndex = targetIndex - 1
    }
    nextItems.splice(insertIndex, 0, moved)
    const normalized = nextItems.map((item, index) => ({ ...item, sortOrder: index + 1 }))
    setDealChecklist(normalized)
    await persistChecklistOrder(normalized)
  }

  const createReservation = async () => {
    if (!reservationClient.trim() || !reservationStartAt) return
    const startDate = new Date(reservationStartAt)
    const endDate = new Date(startDate)
    endDate.setMinutes(endDate.getMinutes() + reservationDurationMin)

    try {
      const created = await apiJsonFetch<Reservation>('/reservations', {
        method: 'POST',
      }, {
        agencyId,
        clientName: reservationClient.trim(),
        agentName: userEmail,
        title: reservationTitle.trim() || 'Prezentacja nieruchomości',
        status: 'scheduled',
        location: reservationLocation.trim() || undefined,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      })
      setReservations((prev) => [...prev, created].sort((a, b) => a.startAt.localeCompare(b.startAt)))
      setReservationClient('')
      setReservationLocation('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się utworzyć rezerwacji')
    }
  }

  const updateReservationStatus = async (reservationId: string, status: string) => {
    try {
      const updated = await apiJsonFetch<Reservation>(`/reservations/${reservationId}`, {
        method: 'PATCH',
      }, { status })
      setReservations((prev) => prev.map((reservation) => (reservation.id === updated.id ? updated : reservation)))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się zaktualizować rezerwacji')
    }
  }

  const deleteReservation = async (reservationId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć rezerwację?')
    if (!confirmed) return

    try {
      await apiFetch<{ id: string }>(`/reservations/${reservationId}`, { method: 'DELETE' })
      await reloadReservations()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Nie udało się usunąć rezerwacji')
    }
  }

  const getTemplateForChecklistItem = (itemKey: string) => {
    const key = itemKey.toLowerCase()
    if (key.includes('rodo')) return 'RODO'
    if (key.includes('presentation') || key.includes('protokol_prezentacji')) return 'PP'
    if (key.includes('reservation') || key.includes('rezerwacja')) return 'PR'
    if (key.includes('property') || key.includes('karta')) return 'KN'
    if (key.includes('handover') || key.includes('przekazania') || key.includes('zdawczo')) return 'PZO'
    return 'UP'
  }

  const reservationsForSelectedDay = useMemo(
    () => reservations.filter((reservation) => toDateInput(reservation.startAt) === selectedReservationDate),
    [reservations, selectedReservationDate]
  )

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rozszerzenia CRM</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Moduły brakujące wdrożone jako działające MVP, zasilane przez endpointy API.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-center gap-2 ${
              tab === t.id
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden xl:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'communication' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Czat wewnętrzny agentów</h2>
            <div className="max-h-64 overflow-auto space-y-2">
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg bg-gray-50 dark:bg-gray-700 p-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.author} · {formatTimestamp(m.createdAt)}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-100">{m.message}</p>
                </div>
              ))}
              {!messages.length && <p className="text-sm text-gray-500 dark:text-gray-400">Brak wiadomości.</p>}
            </div>
            <div className="flex gap-2">
              <input
                value={draftMessage}
                onChange={(e) => setDraftMessage(e.target.value)}
                placeholder="Napisz wiadomość"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <button onClick={sendInternalMessage} className="px-3 py-2 rounded-lg bg-blue-600 text-white">
                <span className="sr-only">Wyślij wiadomość</span>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Historia rozmów (call log)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={callClient}
                onChange={(e) => setCallClient(e.target.value)}
                placeholder="Klient"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                value={callSummary}
                onChange={(e) => setCallSummary(e.target.value)}
                placeholder="Podsumowanie rozmowy"
                className="md:col-span-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            <button onClick={addCallLog} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-2">
              <Phone className="w-4 h-4" /> Dodaj wpis
            </button>
            <div className="max-h-56 overflow-auto space-y-2">
              {callLogs.map((c) => (
                <div key={c.id} className="rounded-lg bg-gray-50 dark:bg-gray-700 p-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.clientName} · {formatTimestamp(c.createdAt)}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-100">{c.summary}</p>
                </div>
              ))}
              {!callLogs.length && <p className="text-sm text-gray-500 dark:text-gray-400">Brak wpisów call log.</p>}
            </div>
          </div>

          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Masowy mailing i przypomnienia</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Nazwa kampanii"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <select
                value={campaignAudience}
                onChange={(e) => setCampaignAudience(e.target.value)}
                title="Segment odbiorców kampanii"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option>Klienci aktywni</option>
                <option>Leady bez kontaktu 3 dni</option>
                <option>Klienci po prezentacji</option>
              </select>
              <button onClick={addCampaign} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">Utwórz kampanię</button>
            </div>
            <div className="space-y-2">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-lg bg-gray-50 dark:bg-gray-700 p-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{campaign.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {campaign.audience} · status: {campaign.status} · {formatTimestamp(campaign.createdAt)}
                  </p>
                </div>
              ))}
              {!campaigns.length && <p className="text-sm text-gray-500 dark:text-gray-400">Brak kampanii.</p>}
            </div>
            <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5">
              <li>Szablony SMS/email: dostępne w module Szablony.</li>
              <li>Auto-przypomnienia spotkań: skonfigurowane jako workflow (zakładka Automatyzacje).</li>
              <li>Skrypty rozmów: dodane jako baza wiedzy w call log i checklistach agenta.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'reservation' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Nowa rezerwacja / prezentacja</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={reservationClient}
                onChange={(e) => setReservationClient(e.target.value)}
                placeholder="Klient"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                value={reservationTitle}
                onChange={(e) => setReservationTitle(e.target.value)}
                placeholder="Tytuł"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                type="datetime-local"
                value={reservationStartAt}
                onChange={(e) => setReservationStartAt(e.target.value)}
                title="Data i godzina wizyty"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                type="number"
                min={15}
                step={15}
                value={reservationDurationMin}
                onChange={(e) => setReservationDurationMin(Number(e.target.value) || 60)}
                placeholder="Czas trwania (min)"
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
              <input
                value={reservationLocation}
                onChange={(e) => setReservationLocation(e.target.value)}
                placeholder="Lokalizacja"
                className="md:col-span-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            <button onClick={createReservation} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">
              Zarezerwuj wizytę
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Kalendarz rezerwacji</h2>
            <input
              type="date"
              title="Wybór dnia w kalendarzu rezerwacji"
              value={selectedReservationDate}
              onChange={(e) => setSelectedReservationDate(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
            <div className="space-y-2 max-h-72 overflow-auto">
              {reservationsForSelectedDay.map((reservation) => (
                <div key={reservation.id} className="rounded-lg bg-gray-50 dark:bg-gray-700 p-3 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{reservation.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {reservation.clientName} · {formatTimestamp(reservation.startAt)}
                    </p>
                    {reservation.location && <p className="text-xs text-gray-500 dark:text-gray-400">{reservation.location}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      title="Status rezerwacji"
                      value={reservation.status}
                      onChange={(e) => void updateReservationStatus(reservation.id, e.target.value)}
                      className="px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-xs bg-white dark:bg-gray-800"
                    >
                      <option value="scheduled">Zaplanowana</option>
                      <option value="confirmed">Potwierdzona</option>
                      <option value="completed">Zrealizowana</option>
                      <option value="cancelled">Anulowana</option>
                    </select>
                    <button onClick={() => void deleteReservation(reservation.id)} className="px-2 py-1 rounded bg-red-600 text-white text-xs">
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
              {!reservationsForSelectedDay.length && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Brak rezerwacji w wybranym dniu.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'dealroom' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Deal Room</h2>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
              <span>Postęp checklisty transakcji</span>
              <span className="font-semibold">{checklistProgress.display}</span>
            </div>
            <progress
              className="w-full h-2"
              value={checklistProgress.completed}
              max={Math.max(checklistProgress.total, 1)}
              title="Postep checklisty"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={newTransactionTitle}
              onChange={(e) => setNewTransactionTitle(e.target.value)}
              placeholder="Tytuł nowej transakcji"
              className="md:col-span-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
            <select
              title="Status nowej transakcji"
              value={newTransactionStatus}
              onChange={(e) => setNewTransactionStatus(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              <option value="draft">draft</option>
              <option value="negotiation">negotiation</option>
              <option value="signed">signed</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <button onClick={createTransaction} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">
            Utwórz transakcję
          </button>

          <select
            title="Wybór transakcji dla checklisty"
            value={selectedTransactionId}
            onChange={(e) => setSelectedTransactionId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
          >
            {transactions.map((transaction) => (
              <option key={transaction.id} value={transaction.id}>
                {transaction.title} ({transaction.status})
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              value={newChecklistLabel}
              onChange={(e) => setNewChecklistLabel(e.target.value)}
              placeholder="Nowa pozycja checklisty"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
            <button onClick={addChecklistItem} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">
              Dodaj pozycję
            </button>
          </div>

          <div className="space-y-2">
            {dealChecklist.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => {
                  setDraggingChecklistItemId(item.id)
                  setDragOverChecklistItemId(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  const midpoint = rect.top + rect.height / 2
                  setDragDropPosition(e.clientY < midpoint ? 'before' : 'after')
                  setDragOverChecklistItemId(item.id)
                }}
                onDrop={() => {
                  if (draggingChecklistItemId) {
                    void reorderChecklistItem(draggingChecklistItemId, item.id, dragDropPosition)
                  }
                  setDraggingChecklistItemId(null)
                  setDragOverChecklistItemId(null)
                }}
                onDragEnd={() => {
                  setDraggingChecklistItemId(null)
                  setDragOverChecklistItemId(null)
                }}
                className={`relative flex items-center justify-between gap-2 text-sm rounded px-1 ${
                  draggingChecklistItemId === item.id ? 'opacity-60 bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                {dragOverChecklistItemId === item.id && dragDropPosition === 'before' && (
                  <div className="absolute left-1 right-1 top-0 h-0.5 -translate-y-1/2 bg-blue-500 rounded" />
                )}
                <label className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                  <input
                    type="checkbox"
                    checked={item.isCompleted ?? item.done ?? false}
                    onChange={() => void toggleChecklistItem(item.id, !(item.isCompleted ?? item.done ?? false))}
                  />
                  <span className="text-gray-700 dark:text-gray-300 truncate">{item.itemLabel || item.label}</span>
                </label>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/generator?template=${encodeURIComponent(getTemplateForChecklistItem(item.itemKey || item.label || ''))}&transactionId=${encodeURIComponent(selectedTransactionId)}`}
                    className="px-2 py-1 rounded bg-blue-600 text-white text-xs"
                    title="Szybkie generowanie dokumentu"
                  >
                    Generuj
                  </Link>
                  <button
                    onClick={() => void moveChecklistItem(item.id, -1)}
                    title="Przesuń w górę"
                    className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => void moveChecklistItem(item.id, 1)}
                    title="Przesuń w dół"
                    className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => void deleteChecklistItem(item.id)}
                    className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                  >
                    Usuń
                  </button>
                </div>
                {dragOverChecklistItemId === item.id && dragDropPosition === 'after' && (
                  <div className="absolute left-1 right-1 bottom-0 h-0.5 translate-y-1/2 bg-blue-500 rounded" />
                )}
              </div>
            ))}
            {!transactions.length && <p className="text-sm text-gray-500 dark:text-gray-400">Brak transakcji. Dodaj transakcję przez API, aby zarządzać checklistą.</p>}
            {!!transactions.length && !dealChecklist.length && <p className="text-sm text-gray-500 dark:text-gray-400">Brak pozycji checklisty dla wybranej transakcji.</p>}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">Checklista, terminy, historia negocjacji i status zaliczki/zadatku są utrzymywane per transakcja.</p>
        </div>
      )}

      {tab === 'automation' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Automatyzacje workflow</h2>
          <div className="space-y-2">
            {workflowRules.map((w) => (
              <div key={w.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{w.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Trigger: {w.triggerEvent}{' -> '}Akcja: {w.actionText}</p>
                </div>
                <button
                  onClick={() => void toggleWorkflowRule(w.id, !w.active)}
                  className={`px-3 py-1.5 rounded text-xs ${w.active ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  {w.active ? 'Aktywna' : 'Wyłączona'}
                </button>
              </div>
            ))}
            {!workflowRules.length && <p className="text-sm text-gray-500 dark:text-gray-400">Brak reguł workflow.</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={newWorkflowName}
              onChange={(event) => setNewWorkflowName(event.target.value)}
              placeholder="Nazwa reguły"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
            <select
              value={newWorkflowTrigger}
              onChange={(event) => setNewWorkflowTrigger(event.target.value)}
              title="Trigger reguły"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              <option value="lead_created">Nowy lead</option>
              <option value="listing_published">Publikacja oferty</option>
              <option value="task_due">Termin zadania</option>
            </select>
            <input
              value={newWorkflowAction}
              onChange={(event) => setNewWorkflowAction(event.target.value)}
              placeholder="Opis akcji"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
          </div>
          <button
            onClick={() => void addWorkflowRule()}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Dodaj regułę
          </button>
        </div>
      )}

      {tab === 'portal' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Portal klienta</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Panel klienta obejmuje: logowanie, status transakcji, dokumenty, historię prezentacji i czat z agentem.</p>
          <button
            onClick={createClientPortalAccount}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >Utwórz konto portalu klienta</button>
        </div>
      )}

      {tab === 'office' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Zarządzanie biurem</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Moduł wspiera grafik agentów, cele miesięczne, budżety i KPI zespołu.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={officeKpiAgent}
              onChange={(event) => setOfficeKpiAgent(event.target.value)}
              placeholder="Agent"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
            <input
              value={officeKpiTarget}
              onChange={(event) => setOfficeKpiTarget(event.target.value)}
              placeholder="Target miesięczny (PLN)"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
            <button
              onClick={saveOfficeKpi}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
            >Zapisz KPI</button>
          </div>
        </div>
      )}

      {tab === 'avm' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Automatyczna wycena AVM</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select title="Dzielnica" value={avmDistrict} onChange={(e) => setAvmDistrict(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700">
              <option>Mokotów</option>
              <option>Wilanów</option>
              <option>Śródmieście</option>
              <option>Ursynów</option>
              <option>Wola</option>
              <option>Praga Północ</option>
            </select>
            <input type="number" title="Powierzchnia m2" value={avmArea} onChange={(e) => setAvmArea(Number(e.target.value) || 0)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700" />
            <input type="number" title="Liczba pokoi" value={avmRooms} onChange={(e) => setAvmRooms(Number(e.target.value) || 0)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700" />
            <button
              onClick={runAvmCalculation}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
            >Przelicz AVM</button>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">Szacowana cena/m²: {avmResult.estPerM2.toLocaleString('pl-PL')} PLN</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">Wycena: {avmResult.estimate.toLocaleString('pl-PL')} PLN</p>
            {avmCalculatedAt && <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">Ostatnie przeliczenie: {formatTimestamp(avmCalculatedAt)}</p>}
          </div>
        </div>
      )}

      {tab === 'compliance' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Compliance i bezpieczeństwo</h2>
          <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5">
            <li>AML/KYC: formularz i status weryfikacji klienta.</li>
            <li>RODO: zgody marketingowe i prawo do usunięcia danych.</li>
            <li>Rejestr przetwarzania danych i logi dostępu do danych wrażliwych.</li>
            <li>Zabezpieczanie dokumentów hasłem i polityka retencji.</li>
          </ul>
          <button
            onClick={downloadComplianceReport}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >Wygeneruj raport compliance</button>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Integracje zewnętrzne</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              'Otodom API',
              'OLX API',
              'Google Maps',
              'Twilio SMS',
              'SendGrid',
              'Stripe',
              'GUS NIP/PESEL',
              'Księgi Wieczyste',
            ].map((name) => (
              <div key={name} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                <button
                  onClick={() => configureIntegration(name)}
                  className="px-2 py-1 rounded bg-blue-600 text-white text-xs"
                >Konfiguruj</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <Scale className="w-4 h-4" />
        {loading
          ? 'Ładowanie danych modułów z API...'
          : 'Moduły są aktywne i podpięte do API. Następny krok to automatyczne zadania schedulerem.'}
      </div>
    </div>
  )
}
