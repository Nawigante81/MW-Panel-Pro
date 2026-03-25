import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  Building2,
  Edit,
  FileText,
  Calendar,
  Save,
} from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { ListingStatus } from '../types'
import { apiFetch } from '../utils/apiClient'

const getPartialImportMeta = (listing: any) => {
  const tags = Array.isArray(listing?.tags) ? listing.tags : []
  const publicationStatus = listing?.publicationStatus && typeof listing.publicationStatus === 'object' ? listing.publicationStatus : {}
  const importMeta = publicationStatus.importMeta && typeof publicationStatus.importMeta === 'object' ? publicationStatus.importMeta : null
  const missingFields = Array.isArray(importMeta?.missingFields) ? importMeta.missingFields : []
  const isPartial = tags.includes('partial_import') || Boolean(importMeta?.isPartial)
  return { isPartial, missingFields, completenessScore: Number(importMeta?.completenessScore || 0) }
}

type DraftState = {
  // listing
  listingPrice: string
  listingStatus: ListingStatus
  listingNotes: string
  listingSourceUrl: string

  // property
  propertyType: string
  marketType: string
  area: string
  plotArea: string
  rooms: string
  floorCurrent: string
  floorTotal: string
  yearBuilt: string
  buildingType: string
  condition: string
  ownershipStatus: string
  pricePerMeter: string
  description: string

  // address
  street: string
  buildingNumber: string
  apartmentNumber: string
  city: string
  zipCode: string
  district: string
  voivodeship: string
  country: string

  mediaUrls: string
}

const emptyDraft: DraftState = {
  listingPrice: '0',
  listingStatus: ListingStatus.DRAFT,
  listingNotes: '',
  listingSourceUrl: '',

  propertyType: 'apartment',
  marketType: 'secondary',
  area: '0',
  plotArea: '',
  rooms: '',
  floorCurrent: '',
  floorTotal: '',
  yearBuilt: '',
  buildingType: '',
  condition: '',
  ownershipStatus: '',
  pricePerMeter: '',
  description: '',

  street: '',
  buildingNumber: '',
  apartmentNumber: '',
  city: '',
  zipCode: '',
  district: '',
  voivodeship: '',
  country: 'Poland',

  mediaUrls: '',
}

const mediaToText = (media: any[]): string => {
  if (!Array.isArray(media)) return ''
  return media
    .map((m) => (typeof m === 'string' ? m : m?.url))
    .filter(Boolean)
    .join('\n')
}

const buildMediaPayload = (text: string) => {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((url, idx) => ({
      id: `m-${Date.now()}-${idx}`,
      type: 'image',
      url,
      order: idx,
      isPrimary: idx === 0,
    }))
}

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const startInEdit = searchParams.get('edit') === '1'

  const { listings, loading, fetchListings, fetchProperties, updateListing } = useDataStore()
  const [isEditing, setIsEditing] = useState(startInEdit)
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([fetchProperties(), fetchListings()])
  }, [fetchProperties, fetchListings])

  const listing = useMemo(() => listings.find((item) => item.id === id), [listings, id])
  const property = listing?.property

  useEffect(() => {
    if (!listing || !property) return
    const address = property.address || {}
    setDraft({
      listingPrice: String(listing.price || 0),
      listingStatus: listing.status,
      listingNotes: listing.notes || '',
      listingSourceUrl: listing.sourceUrl || '',

      propertyType: property.propertyType || 'apartment',
      marketType: property.marketType || 'secondary',
      area: String(property.area || 0),
      plotArea: property.plotArea != null ? String(property.plotArea) : '',
      rooms: property.rooms != null ? String(property.rooms) : '',
      floorCurrent: property.floors?.current != null ? String(property.floors.current) : '',
      floorTotal: property.floors?.total != null ? String(property.floors.total) : '',
      yearBuilt: property.yearBuilt != null ? String(property.yearBuilt) : '',
      buildingType: property.buildingType || '',
      condition: property.condition || '',
      ownershipStatus: property.ownershipStatus || '',
      pricePerMeter: property.pricePerMeter != null ? String(property.pricePerMeter) : '',
      description: property.description || '',

      street: address.street || '',
      buildingNumber: address.buildingNumber || '',
      apartmentNumber: address.apartmentNumber || '',
      city: address.city || '',
      zipCode: address.zipCode || '',
      district: address.district || '',
      voivodeship: address.voivodeship || '',
      country: address.country || 'Poland',

      mediaUrls: mediaToText(property.media || []),
    })
  }, [listing, property])

  const setField = (key: keyof DraftState, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const primaryImage = useMemo(() => {
    if (!property?.media || !Array.isArray(property.media) || property.media.length === 0) return ''
    const first = property.media[0] as any
    if (typeof first === 'string') return first
    return first?.url || ''
  }, [property?.media])

  const partialImport = useMemo(() => getPartialImportMeta(listing), [listing])
  const partialImportTitle = partialImport.isPartial
    ? `Oferta została zaimportowana częściowo${partialImport.missingFields.length ? ` — brakuje: ${partialImport.missingFields.join(', ')}` : '.'}`
    : ''

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      sold: 'bg-gray-100 text-gray-800',
      reserved: 'bg-yellow-100 text-yellow-800',
      draft: 'bg-blue-100 text-blue-800',
      rented: 'bg-cyan-100 text-cyan-800',
      withdrawn: 'bg-red-100 text-red-800',
      archived: 'bg-slate-100 text-slate-800',
    }
    const labels = {
      active: 'Aktywna',
      sold: 'Sprzedana',
      reserved: 'Zarezerwowana',
      draft: 'Szkic',
      rented: 'Wynajęta',
      withdrawn: 'Wycofana',
      archived: 'Archiwalna',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  const handleSave = async () => {
    if (!listing || !property) return
    try {
      setSaving(true)
      setError('')

      await apiFetch(`/properties/${encodeURIComponent(property.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: {
            street: draft.street || 'Uzupełnij adres',
            buildingNumber: draft.buildingNumber || '',
            apartmentNumber: draft.apartmentNumber || '',
            city: draft.city || 'Uzupełnij miasto',
            zipCode: draft.zipCode || '00-000',
            district: draft.district || '',
            voivodeship: draft.voivodeship || '',
            country: draft.country || 'Poland',
          },
          propertyType: draft.propertyType,
          marketType: draft.marketType,
          area: Number(draft.area || 0),
          plotArea: draft.plotArea ? Number(draft.plotArea) : undefined,
          rooms: draft.rooms ? Number(draft.rooms) : undefined,
          floors: {
            current: draft.floorCurrent ? Number(draft.floorCurrent) : undefined,
            total: draft.floorTotal ? Number(draft.floorTotal) : undefined,
          },
          yearBuilt: draft.yearBuilt ? Number(draft.yearBuilt) : undefined,
          buildingType: draft.buildingType || undefined,
          condition: draft.condition || undefined,
          ownershipStatus: draft.ownershipStatus || undefined,
          price: Number(draft.listingPrice || 0),
          pricePerMeter: draft.pricePerMeter ? Number(draft.pricePerMeter) : undefined,
          description: draft.description || undefined,
          media: buildMediaPayload(draft.mediaUrls),
        }),
      })

      await updateListing(listing.id, {
        price: Number(draft.listingPrice || 0),
        status: draft.listingStatus,
        notes: draft.listingNotes,
        sourceUrl: draft.listingSourceUrl || undefined,
      })

      await Promise.all([fetchProperties(), fetchListings()])
      setIsEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać zmian')
    } finally {
      setSaving(false)
    }
  }

  if (!listing || !property) {
    return (
      <div className="space-y-4">
        <Link to="/nieruchomosci" className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50">
          <ArrowLeft size={16} /> Wróć do listy
        </Link>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-2">Nie znaleziono ogłoszenia</h2>
          <p className="text-gray-600">{loading ? 'Ładowanie danych...' : 'To ogłoszenie nie istnieje albo zostało usunięte.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/nieruchomosci" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-800">{draft.propertyType} • {draft.city}</h1>
            {partialImport.isPartial ? <span title={partialImportTitle} className="px-2 py-1 rounded-full text-xs font-medium border border-amber-300 bg-amber-50 text-amber-700">Dane częściowe</span> : null}
          </div>
          <p className="text-gray-600">{listing.listingNumber}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-100">
              <Edit size={18} /> Edytuj
            </button>
          ) : (
            <button onClick={() => void handleSave()} disabled={saving} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-60">
              <Save size={18} /> {saving ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-linear-to-br from-blue-400 to-blue-600 rounded-xl h-64 flex items-center justify-center overflow-hidden">
            {primaryImage ? (
              <img src={primaryImage} alt="Nieruchomość" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="text-white/30" size={120} />
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4">Parametry nieruchomości</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                ['Typ', 'propertyType'],
                ['Rynek', 'marketType'],
                ['Powierzchnia m²', 'area'],
                ['Pow. działki m²', 'plotArea'],
                ['Pokoje', 'rooms'],
                ['Cena oferty', 'listingPrice'],
                ['Cena/m²', 'pricePerMeter'],
                ['Rok budowy', 'yearBuilt'],
                ['Typ budynku', 'buildingType'],
                ['Stan', 'condition'],
                ['Własność', 'ownershipStatus'],
                ['Piętro bieżące', 'floorCurrent'],
                ['Pięter łącznie', 'floorTotal'],
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="text-sm text-gray-600">{label}</label>
                  <input
                    value={(draft as any)[key] || ''}
                    onChange={(e) => setField(key as keyof DraftState, e.target.value)}
                    disabled={!isEditing}
                    title={label as string}
                    className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4">Adres</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                ['Ulica', 'street'],
                ['Nr budynku', 'buildingNumber'],
                ['Nr lokalu', 'apartmentNumber'],
                ['Miasto', 'city'],
                ['Kod pocztowy', 'zipCode'],
                ['Dzielnica/Gmina', 'district'],
                ['Województwo', 'voivodeship'],
                ['Kraj', 'country'],
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="text-sm text-gray-600">{label}</label>
                  <input
                    value={(draft as any)[key] || ''}
                    onChange={(e) => setField(key as keyof DraftState, e.target.value)}
                    disabled={!isEditing}
                    title={label as string}
                    className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h2 className="text-lg font-semibold">Opis i media</h2>
            <div>
              <label className="text-sm text-gray-600">Opis nieruchomości</label>
              <textarea value={draft.description} onChange={(e) => setField('description', e.target.value)} rows={4} disabled={!isEditing} title="Opis nieruchomości" className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Notatki oferty</label>
              <textarea value={draft.listingNotes} onChange={(e) => setField('listingNotes', e.target.value)} rows={3} disabled={!isEditing} title="Notatki oferty" className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Link źródłowy</label>
              <input value={draft.listingSourceUrl} onChange={(e) => setField('listingSourceUrl', e.target.value)} disabled={!isEditing} title="Link źródłowy" className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Linki do zdjęć (1 na linię)</label>
              <textarea value={draft.mediaUrls} onChange={(e) => setField('mediaUrls', e.target.value)} rows={5} disabled={!isEditing} title="Linki do zdjęć (1 na linię)" className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-50" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin size={20} /> Lokalizacja
            </h2>
            <div className="space-y-2">
              <p className="text-gray-800 font-medium">{draft.street} {draft.buildingNumber}{draft.apartmentNumber ? `/${draft.apartmentNumber}` : ''}</p>
              <p className="text-gray-600">{draft.zipCode} {draft.city}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4">Status oferty</h2>
            {partialImport.isPartial ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Import częściowy</p>
                <p className="mt-1">Ta oferta została zaimportowana z brakami danych.</p>
                {partialImport.missingFields.length > 0 ? (
                  <p className="mt-1 text-xs">Brakujące pola: {partialImport.missingFields.join(', ')}.</p>
                ) : null}
                {partialImport.completenessScore > 0 ? (
                  <p className="mt-1 text-xs">Szacowana kompletność: {partialImport.completenessScore}%.</p>
                ) : null}
              </div>
            ) : null}
            {isEditing ? (
              <select
                title="Status oferty"
                value={draft.listingStatus}
                onChange={(e) => setDraft((p) => ({ ...p, listingStatus: e.target.value as ListingStatus }))}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value={ListingStatus.DRAFT}>Szkic</option>
                <option value={ListingStatus.ACTIVE}>Aktywna</option>
                <option value={ListingStatus.RESERVED}>Zarezerwowana</option>
                <option value={ListingStatus.SOLD}>Sprzedana</option>
                <option value={ListingStatus.RENTED}>Wynajęta</option>
                <option value={ListingStatus.WITHDRAWN}>Wycofana</option>
                <option value={ListingStatus.ARCHIVED}>Archiwalna</option>
              </select>
            ) : (
              getStatusBadge(listing.status)
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold mb-4">Szybkie akcje</h2>
            <div className="space-y-2">
              <Link
                to={`/generator?template=KN&propertyId=${property.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <FileText size={18} /> Generuj dokument
              </Link>
              <Link to="/zadania" className="w-full flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-100">
                <Calendar size={18} /> Umów prezentację
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PropertyDetail
