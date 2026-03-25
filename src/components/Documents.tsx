import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  Clock,
  Copy,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Workflow,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useDataStore } from '../store/dataStore'
import { useAuthStore } from '../store/authStore'
import { DocumentStatus } from '../types'
import { apiFetch } from '../utils/apiClient'
import { DocumentDefinition } from '../utils/documentRegistry'
import { buildDocumentDownloadUrl } from '../utils/documentDownload'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'

type UsageStat = {
  documentType: string
  usageCount: number
  usageCount24h: number
  lastUsedAt: string | null
}

type HubMode = 'documents' | 'templates'
type LinkFilter = 'all' | 'client' | 'property' | 'offer' | 'transaction' | 'unlinked'
type WizardStep = 1 | 2 | 3 | 4

const categoryLabels: Record<string, string> = {
  UMOWY: 'Umowy',
  PREZENTACJE_I_OFERTY: 'Prezentacje i oferty',
  REZERWACJA_I_TRANSAKCJA: 'Rezerwacja i transakcja',
  RODO_I_ZGODY: 'RODO i zgody',
  WYNAJEM: 'Wynajem',
  OSWIADCZENIA: 'Oswiadczenia',
  FINANSOWE_I_ADMINISTRACYJNE: 'Finansowe i administracyjne',
}

const statusLabels: Record<string, string> = {
  draft: 'Szkic',
  sent: 'Wyslany',
  signed: 'Podpisany',
  archived: 'Zarchiwizowany',
  cancelled: 'Anulowany',
}

const statusTone: Record<string, string> = {
  draft: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  sent: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  signed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  archived: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

const templateTone = 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'

const formatDateTime = (iso?: string | null) => {
  if (!iso) return 'Brak danych'
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return 'Brak danych'
  return date.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatRelative = (iso?: string | null) => {
  if (!iso) return 'Brak uzycia'
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'Brak danych'
  const diffMin = Math.floor((Date.now() - ts) / 60000)
  if (diffMin < 1) return 'przed chwila'
  if (diffMin < 60) return `${diffMin} min temu`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} h temu`
  return `${Math.floor(diffH / 24)} dni temu`
}

const getDocumentLinkType = (doc: {
  clientId?: string
  propertyId?: string
  transactionId?: string
  metadata?: Record<string, unknown>
}) => {
  const hasOffer = Boolean(doc.metadata?.listingId)
  if (hasOffer) return 'offer'
  if (doc.transactionId) return 'transaction'
  if (doc.propertyId) return 'property'
  if (doc.clientId) return 'client'
  return 'unlinked'
}

const getContextLabel = (doc: {
  clientId?: string
  propertyId?: string
  transactionId?: string
  metadata?: Record<string, unknown>
},
clientsById: Record<string, string>,
propertiesById: Record<string, string>) => {
  const listingId = typeof doc.metadata?.listingId === 'string' ? doc.metadata.listingId : ''
  if (listingId) return `Oferta: ${listingId}`
  if (doc.transactionId) return `Transakcja: ${doc.transactionId}`
  if (doc.propertyId) return `Nieruchomosc: ${propertiesById[doc.propertyId] || doc.propertyId}`
  if (doc.clientId) return `Klient: ${clientsById[doc.clientId] || doc.clientId}`
  return 'Brak powiazania CRM'
}

const getGeneratorUrl = (opts: {
  templateKey: string
  documentType?: string
  clientId?: string
  propertyId?: string
  listingId?: string
  transactionId?: string
  preview?: boolean
  duplicateOf?: string
}) => {
  const params = new URLSearchParams({ template: opts.templateKey })
  if (opts.documentType) params.set('documentType', opts.documentType)
  if (opts.clientId) params.set('clientId', opts.clientId)
  if (opts.propertyId) params.set('propertyId', opts.propertyId)
  if (opts.listingId) params.set('listingId', opts.listingId)
  if (opts.transactionId) params.set('transactionId', opts.transactionId)
  if (opts.preview) params.set('preview', '1')
  if (opts.duplicateOf) params.set('duplicateOf', opts.duplicateOf)
  return `/generator?${params.toString()}`
}

const EmptyState = ({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string
  description: string
  ctaLabel: string
  onCta: () => void
}) => (
  <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center bg-white dark:bg-gray-800">
    <FolderOpen size={34} className="mx-auto mb-3 text-gray-400" />
    <h3 className="text-base font-semibold text-gray-800 dark:text-white">{title}</h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
    <button onClick={onCta} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md btn-primary">
      <Plus size={15} /> {ctaLabel}
    </button>
  </div>
)

const Documents = () => {
  const [definitions, setDefinitions] = useState<DocumentDefinition[]>([])
  const [usageStats, setUsageStats] = useState<UsageStat[]>([])

  const [mode, setMode] = useState<HubMode>('documents')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [selectedType, setSelectedType] = useState<DocumentDefinition | null>(null)
  const [wizardClientId, setWizardClientId] = useState('')
  const [wizardPropertyId, setWizardPropertyId] = useState('')
  const [wizardListingId, setWizardListingId] = useState('')
  const [wizardTransactionId, setWizardTransactionId] = useState('')
  const [wizardTitle, setWizardTitle] = useState('')
  const [wizardNote, setWizardNote] = useState('')

  const user = useAuthStore((state) => state.user)
  const {
    documents,
    clients,
    properties,
    listings,
    fetchDocuments,
    fetchClients,
    fetchProperties,
    fetchListings,
    loading,
    error,
    getDocumentVersions,
  } = useDataStore()

  useEffect(() => {
    void fetchDocuments()
    void fetchClients()
    void fetchProperties()
    void fetchListings()
  }, [fetchDocuments, fetchClients, fetchProperties, fetchListings])

  useEffect(() => {
    const loadDefinitions = async () => {
      try {
        const rows = await apiFetch<DocumentDefinition[]>('/document-definitions?activeOnly=true')
        setDefinitions(Array.isArray(rows) ? rows : [])
      } catch {
        setDefinitions([])
      }
    }
    void loadDefinitions()
  }, [])

  useEffect(() => {
    const loadUsageStats = async () => {
      try {
        const agencyId = user?.agencyId || 'agency-1'
        const rows = await apiFetch<UsageStat[]>(`/document-usage/stats?agencyId=${encodeURIComponent(agencyId)}`)
        setUsageStats(Array.isArray(rows) ? rows : [])
      } catch {
        setUsageStats([])
      }
    }
    void loadUsageStats()
  }, [user])

  const usageByType = useMemo(() => Object.fromEntries(usageStats.map((row) => [row.documentType, row])), [usageStats])
  const definitionsByKey = useMemo(() => Object.fromEntries(definitions.map((row) => [row.key, row])), [definitions])

  const clientsById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.id])),
    [clients]
  )

  const propertiesById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, `${p.address.city}, ${p.address.street}`])),
    [properties]
  )

  const categories = useMemo(() => Array.from(new Set(definitions.map((d) => d.category || 'INNE'))), [definitions])

  const recentDocumentTypes = useMemo(() => {
    return [...usageStats]
      .filter((u) => Boolean(u.lastUsedAt))
      .sort((a, b) => new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime())
      .slice(0, 4)
      .map((u) => definitionsByKey[u.documentType])
      .filter(Boolean)
  }, [definitionsByKey, usageStats])

  const filteredTemplates = useMemo(() => {
    return definitions
      .filter((def) => {
        const text = `${def.name} ${def.description || ''} ${def.key}`.toLowerCase()
        const matchesSearch = text.includes(searchTerm.toLowerCase())
        const matchesCategory = categoryFilter === 'all' || def.category === categoryFilter
        const matchesType = typeFilter === 'all' || def.key === typeFilter
        return matchesSearch && matchesCategory && matchesType
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  }, [categoryFilter, definitions, searchTerm, typeFilter])

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((doc) => {
        const definition = definitionsByKey[doc.documentType || doc.type]
        const statusOk = statusFilter === 'all' || doc.status === statusFilter
        const categoryOk = categoryFilter === 'all' || definition?.category === categoryFilter
        const typeOk = typeFilter === 'all' || (doc.documentType || doc.type) === typeFilter
        const linkType = getDocumentLinkType(doc)
        const linkOk = linkFilter === 'all' || linkFilter === linkType
        const searchScope = `${doc.title} ${definition?.name || ''} ${doc.documentType || doc.type} ${getContextLabel(doc, clientsById, propertiesById)}`.toLowerCase()
        const searchOk = searchScope.includes(searchTerm.toLowerCase())
        return statusOk && categoryOk && typeOk && linkOk && searchOk
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
  }, [categoryFilter, clientsById, definitionsByKey, documents, linkFilter, propertiesById, searchTerm, statusFilter, typeFilter])

  const templatesByCategory = useMemo(() => {
    const grouped: Record<string, DocumentDefinition[]> = {}
    for (const definition of filteredTemplates) {
      const key = definition.category || 'INNE'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(definition)
    }
    return grouped
  }, [filteredTemplates])

  const resetWizard = () => {
    setWizardStep(1)
    setSelectedType(null)
    setWizardClientId('')
    setWizardPropertyId('')
    setWizardListingId('')
    setWizardTransactionId('')
    setWizardTitle('')
    setWizardNote('')
  }

  const openWizard = () => {
    resetWizard()
    setWizardOpen(true)
  }

  const closeWizard = () => {
    setWizardOpen(false)
    resetWizard()
  }

  const goToGenerator = (preview: boolean) => {
    if (!selectedType) return
    const listing = listings.find((l) => l.id === wizardListingId)
    const propertyId = wizardPropertyId || listing?.propertyId || ''
    const url = getGeneratorUrl({
      templateKey: selectedType.templateKey || 'UP',
      documentType: selectedType.key,
      clientId: wizardClientId || undefined,
      propertyId: propertyId || undefined,
      listingId: wizardListingId || undefined,
      transactionId: wizardTransactionId || undefined,
      preview,
    })
    window.location.href = url
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Dokumenty</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Jedno centrum pracy: wybierz typ, powiaz rekord CRM i generuj dokument bez wychodzenia z flow.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ContextHelpButton help={getContextHelp('/dokumenty')} />
            <button onClick={openWizard} className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-md">
              <Plus size={16} /> Nowy dokument
            </button>
            <Link to="/pliki" className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
              Zalaczniki
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <button onClick={openWizard} className="text-left rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4 hover:border-(--accent-main)/50">
          <p className="font-semibold text-gray-900 dark:text-white">Szybka akcja: Nowy dokument</p>
          <p className="text-xs text-gray-500 mt-1">Kreator 4 kroki: typ, kontekst, dane, generacja.</p>
        </button>
        <Link to="/pliki" className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4 hover:border-(--accent-main)/50">
          <p className="font-semibold text-gray-900 dark:text-white">Pliki i zalaczniki</p>
          <p className="text-xs text-gray-500 mt-1">Powiazane z klientem, nieruchomoscia i dokumentem.</p>
        </Link>
        <Link to="/generator" className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4 hover:border-(--accent-main)/50">
          <p className="font-semibold text-gray-900 dark:text-white">Generator (tryb techniczny)</p>
          <p className="text-xs text-gray-500 mt-1">Zaawansowana edycja i preview PDF.</p>
        </Link>
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
          <p className="font-semibold text-gray-900 dark:text-white">Ostatnio uzywane</p>
          <div className="mt-2 space-y-1">
            {recentDocumentTypes.length === 0 ? (
              <p className="text-xs text-gray-500">Brak historii uzyc.</p>
            ) : (
              recentDocumentTypes.map((d) => (
                <p key={d.key} className="text-xs text-gray-600 dark:text-gray-300">{d.name}</p>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Szukaj dokumentu, szablonu lub kontekstu CRM..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            />
          </div>
          <select title="Kategoria" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
            <option value="all">Kategoria: wszystkie</option>
            {categories.map((cat) => <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>)}
          </select>
          <select title="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
            <option value="all">Status: wszystkie</option>
            {Object.values(DocumentStatus).map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}
          </select>
          <select title="Typ dokumentu" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
            <option value="all">Typ: wszystkie</option>
            {definitions.map((def) => <option key={def.key} value={def.key}>{def.name}</option>)}
          </select>
          <select title="Powiazanie CRM" value={linkFilter} onChange={(e) => setLinkFilter(e.target.value as LinkFilter)} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
            <option value="all">Powiazanie: wszystkie</option>
            <option value="client">Klient</option>
            <option value="property">Nieruchomosc</option>
            <option value="offer">Oferta</option>
            <option value="transaction">Transakcja</option>
            <option value="unlinked">Niepowiazane</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 inline-flex gap-2">
        <button
          onClick={() => setMode('documents')}
          className={cn('px-3 py-1.5 rounded-md text-sm', mode === 'documents' ? 'bg-(--accent-main)/15 text-(--accent-main) border border-(--accent-main)/30' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}
        >
          Dokumenty
        </button>
        <button
          onClick={() => setMode('templates')}
          className={cn('px-3 py-1.5 rounded-md text-sm', mode === 'templates' ? 'bg-(--accent-main)/15 text-(--accent-main) border border-(--accent-main)/30' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}
        >
          Szablony
        </button>
      </section>

      {mode === 'templates' ? (
        <div className="space-y-5">
          {Object.keys(templatesByCategory).length === 0 ? (
            <EmptyState
              title="Brak szablonow"
              description="Nie znaleziono szablonow dla ustawionych filtrow."
              ctaLabel="Wyczysc filtry"
              onCta={() => {
                setSearchTerm('')
                setCategoryFilter('all')
                setTypeFilter('all')
              }}
            />
          ) : (
            Object.entries(templatesByCategory).map(([category, defs]) => (
              <section key={category} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold tracking-wide text-gray-600 dark:text-gray-300 uppercase">{categoryLabels[category] || category}</h2>
                  <span className="text-xs text-gray-500">{defs.length} szablonow</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {defs.map((def) => {
                    const stat = usageByType[def.key]
                    return (
                      <article key={def.key} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">{def.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">{def.description || 'Szablon dokumentu CRM.'}</p>
                          </div>
                          <span className={cn('text-[11px] px-2 py-1 rounded-full font-medium', templateTone)}>Szablon</span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          <p>Ostatnie uzycie: {formatRelative(stat?.lastUsedAt)}</p>
                          <p>Liczba uzyc: {stat?.usageCount || 0} (24h: {stat?.usageCount24h || 0})</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                            setSelectedType(def)
                            setWizardOpen(true)
                            setWizardStep(2)
                          }} className="btn-primary px-3 py-2 rounded-md text-sm">Generuj</button>
                          <Link to={getGeneratorUrl({ templateKey: def.templateKey || 'UP', documentType: def.key, preview: true })} className="px-3 py-2 rounded-md border text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Podglad</Link>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <section className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-sm text-gray-500">Ladowanie dokumentow...</div>
          ) : filteredDocuments.length === 0 ? (
            <EmptyState
              title={documents.length === 0 ? 'Brak dokumentow' : 'Brak wynikow dla filtrow'}
              description={documents.length === 0 ? 'Dodaj pierwszy dokument i podepnij go pod klienta, nieruchomosc lub transakcje.' : 'Zmien filtry albo uruchom nowy dokument.'}
              ctaLabel={documents.length === 0 ? 'Nowy dokument' : 'Wyczysc filtry'}
              onCta={() => {
                if (documents.length === 0) {
                  openWizard()
                } else {
                  setSearchTerm('')
                  setStatusFilter('all')
                  setCategoryFilter('all')
                  setTypeFilter('all')
                  setLinkFilter('all')
                }
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredDocuments.map((doc) => {
                const docType = doc.documentType || doc.type
                const def = definitionsByKey[docType]
                const versions = getDocumentVersions(doc.id)
                const context = getContextLabel(doc, clientsById, propertiesById)
                const linkType = getDocumentLinkType(doc)
                const listingId = typeof doc.metadata?.listingId === 'string' ? doc.metadata.listingId : undefined
                return (
                  <article key={doc.id} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white leading-tight">{doc.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{def?.name || docType}</p>
                      </div>
                      <span className={cn('text-[11px] px-2 py-1 rounded-full font-medium', statusTone[doc.status] || statusTone.draft)}>{statusLabels[doc.status] || doc.status}</span>
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <p>{context}</p>
                      <p>Utworzono: {formatDateTime(doc.createdAt)}</p>
                      <p>Aktualizacja: {formatDateTime(doc.updatedAt)}</p>
                      <p>Wersje: {versions.length}</p>
                      <p>Typ rekordu: {linkType}</p>
                    </div>

                    <div className="grid grid-cols-5 gap-1">
                      <Link to={getGeneratorUrl({ templateKey: def?.templateKey || doc.templateKey || 'UP', documentType: docType, clientId: doc.clientId, propertyId: doc.propertyId, listingId, transactionId: doc.transactionId })} className="text-center px-2 py-1.5 rounded border text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Generuj</Link>
                      <Link to={getGeneratorUrl({ templateKey: def?.templateKey || doc.templateKey || 'UP', documentType: docType, clientId: doc.clientId, propertyId: doc.propertyId, listingId, transactionId: doc.transactionId, preview: true })} className="text-center px-2 py-1.5 rounded border text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Podglad</Link>
                      <Link to={getGeneratorUrl({ templateKey: def?.templateKey || doc.templateKey || 'UP', documentType: docType, clientId: doc.clientId, propertyId: doc.propertyId, listingId, transactionId: doc.transactionId })} className="text-center px-2 py-1.5 rounded border text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Edytuj</Link>
                      <Link to={getGeneratorUrl({ templateKey: def?.templateKey || doc.templateKey || 'UP', documentType: docType, clientId: doc.clientId, propertyId: doc.propertyId, listingId, transactionId: doc.transactionId, duplicateOf: doc.id })} className="text-center px-2 py-1.5 rounded border text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Duplikuj</Link>
                      <button onClick={() => window.open(buildDocumentDownloadUrl(doc.id), '_blank', 'noopener,noreferrer')} className="px-2 py-1.5 rounded border text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Wiecej</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nowy dokument</h2>
                <p className="text-xs text-gray-500 mt-0.5">Krok {wizardStep}/4</p>
              </div>
              <button onClick={closeWizard} className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Zamknij</button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-auto">
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <h3 className="font-medium">1. Wybierz typ dokumentu</h3>
                  {definitions.length === 0 ? (
                    <EmptyState title="Brak typow dokumentu" description="Nie udalo sie pobrac definicji dokumentow." ctaLabel="Zamknij" onCta={closeWizard} />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {definitions.map((def) => (
                        <button
                          key={def.key}
                          onClick={() => {
                            setSelectedType(def)
                            setWizardTitle(def.name)
                          }}
                          className={cn('text-left rounded-lg border p-3 transition-colors', selectedType?.key === def.key ? 'border-(--accent-main) bg-(--accent-main)/10' : 'border-gray-200 dark:border-gray-700 hover:border-(--accent-main)/50')}
                        >
                          <p className="font-medium text-gray-900 dark:text-white">{def.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{categoryLabels[def.category] || def.category}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-3">
                  <h3 className="font-medium">2. Powiaz rekord CRM</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Klient</label>
                      <select title="Klient" value={wizardClientId} onChange={(e) => setWizardClientId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                        <option value="">Brak</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>Klient #{c.id}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Nieruchomosc</label>
                      <select title="Nieruchomosc" value={wizardPropertyId} onChange={(e) => setWizardPropertyId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                        <option value="">Brak</option>
                        {properties.map((p) => <option key={p.id} value={p.id}>{`${p.address.city}, ${p.address.street}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Oferta</label>
                      <select title="Oferta" value={wizardListingId} onChange={(e) => setWizardListingId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                        <option value="">Brak</option>
                        {listings.map((l) => <option key={l.id} value={l.id}>{l.listingNumber || `Oferta ${l.id}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Transakcja</label>
                      <input value={wizardTransactionId} onChange={(e) => setWizardTransactionId(e.target.value)} placeholder="np. TRX-2026-001" className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-3">
                  <h3 className="font-medium">3. Dane opcjonalne</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Tytul dokumentu</label>
                      <input value={wizardTitle} onChange={(e) => setWizardTitle(e.target.value)} placeholder="Tytul dokumentu" className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Notatka operacyjna</label>
                      <textarea value={wizardNote} onChange={(e) => setWizardNote(e.target.value)} rows={3} placeholder="Notatka do dokumentu (opcjonalnie)" className="mt-1 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-3">
                  <h3 className="font-medium">4. Generuj</h3>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-1">
                    <p><span className="text-gray-500">Typ:</span> {selectedType?.name || 'Brak'}</p>
                    <p><span className="text-gray-500">Klient:</span> {wizardClientId || 'Brak'}</p>
                    <p><span className="text-gray-500">Nieruchomosc:</span> {wizardPropertyId || 'Brak'}</p>
                    <p><span className="text-gray-500">Oferta:</span> {wizardListingId || 'Brak'}</p>
                    <p><span className="text-gray-500">Transakcja:</span> {wizardTransactionId || 'Brak'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => goToGenerator(false)} className="btn-primary px-4 py-2 rounded-md inline-flex items-center gap-2"><Sparkles size={15} /> Generuj i edytuj</button>
                    <button onClick={() => goToGenerator(true)} className="px-4 py-2 rounded-md border hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center gap-2"><Eye size={15} /> Generuj i podglad</button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={() => setWizardStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev))}
                disabled={wizardStep === 1}
                className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              >
                Wstecz
              </button>
              <button
                onClick={() => setWizardStep((prev) => {
                  if (prev === 1 && !selectedType) return prev
                  return prev < 4 ? ((prev + 1) as WizardStep) : prev
                })}
                disabled={(wizardStep === 1 && !selectedType) || wizardStep === 4}
                className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              >
                Dalej
              </button>
            </div>
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  )
}

export default Documents
