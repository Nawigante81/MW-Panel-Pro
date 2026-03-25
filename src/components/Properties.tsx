import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { 
  Plus, 
  Search, 
  MapPin,
  Home,
  Building,
  DollarSign,
 Users,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Building2
} from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { ListingSource, ListingStatus, MarketType, PropertyType } from '../types'
import { cn } from '../utils/cn'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'

const getPartialImportMeta = (listing: any) => {
  const tags = Array.isArray(listing?.tags) ? listing.tags : []
  const publicationStatus = listing?.publicationStatus && typeof listing.publicationStatus === 'object' ? listing.publicationStatus : {}
  const importMeta = publicationStatus.importMeta && typeof publicationStatus.importMeta === 'object' ? publicationStatus.importMeta : null
  const missingFields = Array.isArray(importMeta?.missingFields) ? importMeta.missingFields : []
  const isPartial = tags.includes('partial_import') || Boolean(importMeta?.isPartial)
  return { isPartial, missingFields }
}

const Properties = () => {
  const { listings, loading, fetchListings, fetchProperties, deleteListing, addProperty, addListing, getAgencyId } = useDataStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [creatingProperty, setCreatingProperty] = useState(false)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    void Promise.all([fetchProperties(), fetchListings()])
  }, [fetchListings, fetchProperties])

  useEffect(() => {
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const search = searchParams.get('search')

    setFilterStatus(status || 'all')
    setFilterType(type || 'all')
    setSearchTerm(search || '')
  }, [searchParams])

  const quickScope = searchParams.get('scope') || 'all'
  const sourceScope = searchParams.get('source') || 'all'
  const importScope = searchParams.get('import') || 'all'

  const clearQuickFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('scope')
    next.delete('source')
    next.delete('import')
    setSearchParams(next)
  }

  const setImportScopeFilter = (value: 'all' | 'partial') => {
    const next = new URLSearchParams(searchParams)
    if (value === 'partial') next.set('import', 'partial')
    else next.delete('import')
    setSearchParams(next)
  }

  const getPrimaryImageUrl = (media: unknown): string | null => {
    if (!Array.isArray(media)) return null
    const first = media[0] as any
    if (!first) return null
    if (typeof first === 'string') return first
    if (typeof first?.url === 'string') return first.url
    return null
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case PropertyType.APARTMENT:
        return <Building2 className="text-blue-500" size={20} />
      case PropertyType.HOUSE:
      case PropertyType.DETACHED:
      case PropertyType.SEMI_DETACHED:
      case PropertyType.TERRACE:
        return <Home className="text-green-500" size={20} />
      case PropertyType.PLOT:
        return <MapPin className="text-yellow-500" size={20} />
      case PropertyType.COMMERCIAL:
      case PropertyType.OFFICE:
      case PropertyType.WAREHOUSE:
        return <Building className="text-purple-500" size={20} />
      default:
        return <Building2 className="text-gray-500" size={20} />
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case PropertyType.APARTMENT:
        return 'Mieszkanie'
      case PropertyType.HOUSE:
      case PropertyType.DETACHED:
      case PropertyType.SEMI_DETACHED:
      case PropertyType.TERRACE:
        return 'Dom'
      case PropertyType.PLOT:
        return 'Działka'
      case PropertyType.COMMERCIAL:
      case PropertyType.OFFICE:
      case PropertyType.WAREHOUSE:
        return 'Lokal'
      default:
        return type
    }
  }

  function getStatusBadge(status: string) {
    const styles = {
      [ListingStatus.ACTIVE]: 'bg-green-100 text-green-800',
      [ListingStatus.SOLD]: 'bg-gray-100 text-gray-800',
      [ListingStatus.RESERVED]: 'bg-yellow-100 text-yellow-800',
      [ListingStatus.DRAFT]: 'bg-blue-100 text-blue-800',
      [ListingStatus.RENTED]: 'bg-cyan-100 text-cyan-800',
      [ListingStatus.WITHDRAWN]: 'bg-red-100 text-red-800',
      [ListingStatus.ARCHIVED]: 'bg-slate-100 text-slate-800',
    }
    const labels = {
      [ListingStatus.ACTIVE]: 'Aktywna',
      [ListingStatus.SOLD]: 'Sprzedana',
      [ListingStatus.RESERVED]: 'Zarezerwowana',
      [ListingStatus.DRAFT]: 'Szkic',
      [ListingStatus.RENTED]: 'Wynajęta',
      [ListingStatus.WITHDRAWN]: 'Wycofana',
      [ListingStatus.ARCHIVED]: 'Archiwalna',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', styles[status as keyof typeof styles])}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const filteredProperties = useMemo(() => listings
    .filter((prop) => {
      const property = prop.property
      if (!property) return false
      const address = property.address || { city: '', street: '', buildingNumber: '', apartmentNumber: '' }
      const city = address.city || ''
      const street = address.street || ''
      const buildingNumber = address.buildingNumber || ''
      const apartmentNumber = address.apartmentNumber || ''
      const title = `${getTypeLabel(property.propertyType)} w ${city}`
      const fullAddress = `${street} ${buildingNumber}${apartmentNumber ? `/${apartmentNumber}` : ''}`.trim()
      const matchesSearch =
        title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fullAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
        city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prop.listingNumber.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesType = filterType === 'all' || property.propertyType === filterType
      const matchesStatus = filterStatus === 'all' || prop.status === filterStatus

      const createdAtTs = new Date(prop.createdAt || 0).getTime()
      const publishedAtTs = new Date((prop as any).publishedAt || 0).getTime()
      const isNew7d = Number.isFinite(createdAtTs) && createdAtTs >= Date.now() - 7 * 24 * 60 * 60 * 1000
      const isExpiring = prop.status === ListingStatus.ACTIVE && Number.isFinite(publishedAtTs) && publishedAtTs <= Date.now() - 45 * 24 * 60 * 60 * 1000

      const tags = Array.isArray((prop as any).tags) ? (prop as any).tags : []
      const isImported = tags.includes('external_import') || String((prop as any).notes || '').toLowerCase().includes('imported from external listing')

      const partialImport = getPartialImportMeta(prop)

      const matchesScope =
        quickScope === 'new7d' ? isNew7d
        : quickScope === 'expiring' ? isExpiring
        : true

      const matchesSourceScope = sourceScope === 'imported' ? isImported : true
      const matchesImportScope = importScope === 'partial' ? partialImport.isPartial : true

      return matchesSearch && matchesType && matchesStatus && matchesScope && matchesSourceScope && matchesImportScope
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (sortBy === 'price-asc') return a.price - b.price
      if (sortBy === 'price-desc') return b.price - a.price
      return 0
    })
  , [filterStatus, filterType, importScope, listings, quickScope, searchTerm, sortBy, sourceScope])


  const handleDeleteProperty = async (listingId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć tę ofertę?')
    if (!confirmed) return

    try {
      setError('')
      setInfo('')
      await deleteListing(listingId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć oferty')
    }
  }

  const handleCreateProperty = async () => {
    if (creatingProperty) return
    try {
      setError('')
      setInfo('')
      setCreatingProperty(true)
      const agencyId = getAgencyId()
      const now = new Date().toISOString()

      const property = await addProperty({
        agencyId,
        address: {
          street: 'Uzupełnij adres',
          buildingNumber: '',
          apartmentNumber: '',
          city: 'Uzupełnij miasto',
          zipCode: '00-000',
          district: '',
          voivodeship: '',
          country: 'Poland',
        },
        propertyType: PropertyType.APARTMENT,
        marketType: MarketType.SECONDARY,
        area: 1,
        rooms: 1,
        price: 0,
        description: 'Nowa nieruchomość — uzupełnij szczegóły.',
        media: [],
      })

      const listing = await addListing({
        propertyId: property.id,
        agencyId,
        listingNumber: `DRAFT/${new Date().getFullYear()}/${Date.now().toString().slice(-6)}`,
        status: ListingStatus.DRAFT,
        source: ListingSource.MANUAL,
        price: 0,
        priceHistory: [{ price: 0, currency: 'PLN', changedAt: now, reason: 'init' }],
        views: 0,
        inquiries: 0,
        publicationStatus: {},
        notes: 'Szkic utworzony z listy nieruchomości.',
        tags: ['draft'],
      })

      navigate(`/nieruchomosci/${listing.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się utworzyć nieruchomości')
    } finally {
      setCreatingProperty(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Nieruchomości</h1>
          <p className="text-gray-600 dark:text-gray-400">Zarządzaj ofertami nieruchomości</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Tu widzisz wyłącznie własne oferty CRM (bez importów z monitoringu).</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ContextHelpButton help={getContextHelp('/nieruchomosci')} />
          <button
            onClick={() => navigate('/nieruchomosci/nowa')}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-md transition-colors"
          >
            <Plus size={20} />
            Dodaj nieruchomość
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Szukaj nieruchomości..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            />
          </div>
          <div className="flex gap-4 flex-wrap">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              title="Filtr typu nieruchomości"
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <option value="all">Wszystkie typy</option>
              <option value={PropertyType.APARTMENT}>Mieszkania</option>
              <option value={PropertyType.HOUSE}>Domy</option>
              <option value={PropertyType.PLOT}>Działki</option>
              <option value={PropertyType.COMMERCIAL}>Lokale</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              title="Filtr statusu nieruchomości"
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <option value="all">Wszystkie statusy</option>
              <option value={ListingStatus.ACTIVE}>Aktywne</option>
              <option value={ListingStatus.SOLD}>Sprzedane</option>
              <option value={ListingStatus.RESERVED}>Zarezerwowane</option>
              <option value={ListingStatus.DRAFT}>Szkice</option>
              <option value={ListingStatus.RENTED}>Wynajęte</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              title="Sortowanie nieruchomości"
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <option value="newest">Najnowsze</option>
              <option value="oldest">Najstarsze</option>
              <option value="price-asc">Cena: rosnąco</option>
              <option value="price-desc">Cena: malejąco</option>
            </select>
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1">
              <button
                type="button"
                onClick={() => setImportScopeFilter('all')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${importScope === 'all' ? 'bg-(--accent-main) text-black' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
              >
                Wszystkie importy
              </button>
              <button
                type="button"
                onClick={() => setImportScopeFilter('partial')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${importScope === 'partial' ? 'bg-amber-500 text-black' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
              >
                Dane częściowe
              </button>
            </div>
          </div>
        </div>
        {(quickScope !== 'all' || sourceScope !== 'all' || importScope !== 'all') && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="px-2 py-1 rounded-full border border-blue-300/50 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-900/20">
              {quickScope === 'new7d' ? 'Filtr: nowe oferty (7 dni)' : quickScope === 'expiring' ? 'Filtr: oferty wygasające' : 'Filtr: niestandardowy'}
            </span>
            {sourceScope === 'imported' && (
              <span className="px-2 py-1 rounded-full border border-cyan-300/50 dark:border-cyan-700/60 bg-cyan-50 dark:bg-cyan-900/20">Źródło: import z monitoringu</span>
            )}
            {importScope === 'partial' && (
              <span className="px-2 py-1 rounded-full border border-amber-300/50 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">Import: dane częściowe</span>
            )}
            <button onClick={clearQuickFilters} className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              Wyczyść szybkie filtry
            </button>
          </div>
        )}
      </div>

      {/* Properties Grid */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      {info && (
        <div className="text-sm text-emerald-600 dark:text-emerald-400">{info}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProperties.map((property) => {
          if (!property.property) return null
          const address = property.property.address || { city: '', street: '', buildingNumber: '', apartmentNumber: '' }
          const partialImport = getPartialImportMeta(property)
          const partialImportTitle = partialImport.isPartial
            ? `Oferta została zaimportowana częściowo${partialImport.missingFields.length ? ` — brakuje: ${partialImport.missingFields.join(', ')}` : '.'}`
            : ''
          return (
            <div
              key={property.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all duration-200 group"
            >
              <div className="h-48 bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center relative overflow-hidden">
                {getPrimaryImageUrl(property.property.media) ? (
                  <img
                    src={getPrimaryImageUrl(property.property.media) || ''}
                    alt="Zdjęcie nieruchomości"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
                    {getTypeIcon(property.property.propertyType)}
                    <span className="text-white text-6xl opacity-20 absolute">{getTypeIcon(property.property.propertyType)}</span>
                  </>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 dark:text-white line-clamp-1">{getTypeLabel(property.property.propertyType)} w {address.city}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{property.listingNumber}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    {partialImport.isPartial ? <span title={partialImportTitle} className="px-2 py-1 rounded-full text-xs font-medium border border-amber-300/50 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">Dane częściowe</span> : null}
                    {getStatusBadge(property.status)}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <MapPin size={16} />
                    <span className="truncate">
                      {address.street} {address.buildingNumber || ''}
                      {address.apartmentNumber ? `/${address.apartmentNumber}` : ''}, {address.city}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Users size={16} />
                    <span>{property.assignedAgentId || 'Nieprzypisany agent'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1">
                      <Building2 size={14} />
                      {property.property.area} m²
                    </span>
                    {(property.property.rooms || 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{property.property.rooms}</span> pokoje
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-lg font-bold text-[var(--accent-main)]">
                    <DollarSign size={16} />
                    {formatPrice(property.price)}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                  <Link
                    to={`/nieruchomosci/${property.id}`}
                    className="p-2 hover:bg-[var(--bg-elev)] rounded-md text-[var(--accent-main)] transition-colors duration-150"
                    title="Szczegóły"
                  >
                    <Eye size={16} />
                  </Link>
                  <button
                    onClick={() => navigate(`/nieruchomosci/${property.id}?edit=1`)}
                    className="p-2 hover:bg-[var(--bg-elev)] rounded-md text-[var(--accent-main)] transition-colors duration-150"
                    title="Edytuj"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => void handleDeleteProperty(property.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 transition-colors duration-200"
                    title="Usuń"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/nieruchomosci/${property.id}`
                      void navigator.clipboard?.writeText(url)
                      setError('')
                      setInfo('Skopiowano link do ogłoszenia do schowka.')
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 transition-colors duration-200"
                    title="Więcej"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

      {filteredProperties.length === 0 && (

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400 transition-colors duration-200">
          <Building2 size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p>{loading ? 'Ładowanie ofert...' : 'Brak nieruchomości spełniających kryteria wyszukiwania'}</p>
        </div>
      )}
    </div>
  </div>
  )
}

export default Properties