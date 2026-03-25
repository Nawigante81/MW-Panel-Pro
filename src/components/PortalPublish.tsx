import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Download, Link2, Copy, CheckCircle, Building2, AlertCircle } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useDataStore } from '../store/dataStore'
import ContextHelpButton from './ContextHelpButton'
import InlineFieldHelp from './InlineFieldHelp'
import { getContextHelp } from './helpContent'

const PORTALS = [
  { id: 'olx', name: 'OLX', color: 'text-green-400', bg: 'bg-green-950/40', border: 'border-green-900/50' },
  { id: 'otodom', name: 'Otodom', color: 'text-blue-400', bg: 'bg-blue-950/40', border: 'border-blue-900/50' },
  { id: 'gratka', name: 'Gratka', color: 'text-orange-400', bg: 'bg-orange-950/40', border: 'border-orange-900/50' },
]

type PortalIntegration = {
  id: string
  portal: string
  isActive: boolean
  lastImportAt?: string
  lastImportStatus?: string
}

export default function PortalPublish() {
  const { getAgencyId } = useDataStore()
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedPortal, setSelectedPortal] = useState('olx')
  const [error, setError] = useState('')
  const [integrations, setIntegrations] = useState<PortalIntegration[]>([])

  useEffect(() => {
    const agencyId = getAgencyId()
    Promise.all([
      apiFetch<{ kpi: { activeListings: number } }>(`/reports/summary?agencyId=${encodeURIComponent(agencyId)}&days=365`),
      apiFetch<PortalIntegration[]>(`/portal-integrations?agencyId=${encodeURIComponent(agencyId)}`),
    ])
      .then(([summaryData, integrationsData]) => {
        setActiveCount(summaryData.kpi.activeListings)
        setIntegrations(integrationsData)
      })
      .catch(() => setActiveCount(null))
  }, [])

  const agencyId = getAgencyId()
  const exportUrl = `/api/portal/export/xml?agencyId=${encodeURIComponent(agencyId)}&portal=${selectedPortal}`

  const downloadXml = async () => {
    try {
      setError('')
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${localStorage.getItem('mwpanel_token') || ''}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mwpanel_${selectedPortal}_${new Date().toISOString().slice(0, 10)}.xml`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blad pobierania XML')
    }
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + exportUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {}
  }

  const resolvePortalStatus = (portalId: string) => {
    const integration = integrations.find((item) => item.portal === portalId)
    if (!integration) {
      return { label: 'Gotowa do konfiguracji', tone: 'text-amber-300' }
    }
    if (integration.isActive) {
      const detail = integration.lastImportStatus ? ` (${integration.lastImportStatus})` : ''
      return { label: `Integracja aktywna${detail}`, tone: 'text-emerald-300' }
    }
    return { label: 'Integracja skonfigurowana (wstrzymana)', tone: 'text-slate-300' }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Publikacja ofert</h1>
          <p className="text-[#9fb0c5] mt-1">Eksport ofert do portali nieruchomosci</p>
        </div>
        <ContextHelpButton help={getContextHelp('/publikacja')} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-sm border border-rose-900/50 bg-rose-950/30 rounded-md px-3 py-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-[#16243d] flex items-center justify-center">
          <Building2 size={22} className="text-(--accent-main)" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#f1f5f9]">{activeCount ?? '--'}</p>
          <p className="text-sm text-[#9fb0c5]">Aktywnych ofert gotowych do eksportu</p>
        </div>
      </div>

      {/* Portal selector */}
      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-5 space-y-4">
        <h2 className="font-semibold text-[#f1f5f9]">Wybierz portal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PORTALS.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPortal(p.id)}
              className={`p-4 rounded-lg border text-left transition-all ${
                selectedPortal === p.id
                  ? `${p.bg} ${p.border} ${p.color}`
                  : 'bg-[#111a2b] border-[#2b3a57] text-[#9fb0c5] hover:border-[#3a5070]'
              }`}
            >
              <Globe size={20} className="mb-2" />
              <p className="font-semibold flex items-center gap-2">{p.name}{selectedPortal === p.id ? <InlineFieldHelp text="To aktualnie wybrany portal docelowy. Format XML i wymagania eksportu zależą od wybranego kanału publikacji." /> : null}</p>
              <p className="text-xs mt-0.5 opacity-70">Format XML</p>
            </button>
          ))}
        </div>
      </div>

      {/* Export actions */}
      <div className="rounded-lg border border-[#2b3a57] bg-[#0f172a] p-5 space-y-4">
        <h2 className="font-semibold text-[#f1f5f9] flex items-center gap-2">Eksport XML <InlineFieldHelp text="Ten obszar służy do pobrania lub udostępnienia feedu XML dla wybranego portalu. Przed eksportem sprawdź, czy oferta ma komplet danych i zdjęć." /></h2>
        <p className="text-sm text-[#9fb0c5]">
          Wygeneruj plik XML ze wszystkimi aktywnymi ofertami w formacie akceptowanym przez portal {PORTALS.find(p => p.id === selectedPortal)?.name}.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void downloadXml()}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Download size={16} />
            Pobierz XML ({selectedPortal.toUpperCase()})
          </button>
          <button
            onClick={() => void copyUrl()}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-[#2b3a57] rounded-md text-[#9fb0c5] hover:bg-[#16243d] transition-colors"
          >
            {copied ? <CheckCircle size={16} className="text-(--accent-main)" /> : <Copy size={16} />}
            {copied ? 'Skopiowano!' : 'Kopiuj URL feed'}
          </button>
        </div>
        <div className="mt-1 px-3 py-2 bg-[#0c1524] border border-[#1e2d45] rounded-md font-mono text-xs text-[#4a5f7a] break-all">
          <Link2 size={12} className="inline mr-2 text-[#9fb0c5]" />
          {window.location.origin}{exportUrl}
        </div>
      </div>

      {/* Portal status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PORTALS.map(p => {
          const status = resolvePortalStatus(p.id)
          return (
          <div key={p.id} className={`rounded-lg border ${p.border} ${p.bg} p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <Globe size={14} className={p.color} />
              <p className={`text-sm font-semibold ${p.color}`}>{p.name}</p>
            </div>
            <p className={`text-xs ${status.tone}`}>{status.label}</p>
          </div>
        )})}
      </div>

      <div className="flex gap-2">
        <Link to="/admin" className="btn-primary px-3 py-2 text-sm">
          Panel admin
        </Link>
        <Link
          to="/nieruchomosci"
          className="px-3 py-2 text-sm rounded-md border border-[#2b3a57] text-[#9fb0c5] hover:bg-[#16243d] transition-colors"
        >
          Nieruchomosci
        </Link>
      </div>
    </div>
  )
}
