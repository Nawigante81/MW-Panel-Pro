import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Eye, FileText, Save, UploadCloud } from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { ListingSource, ListingStatus, MarketType, PropertyType } from '../types'
import { apiFetch } from '../utils/apiClient'

type CreateMode = 'manual' | 'import' | 'duplicate'

type ImportPreview = {
  url: string
  title?: string
  description?: string
  imageUrl?: string
  price?: number
  area?: number
  areaMin?: number
  areaMax?: number
  city?: string
  district?: string
  voivodeship?: string
  street?: string
  listingCount?: number
  pricePerM2?: number
  pricePerM2Forest?: number
}

type DraftForm = {
  title: string
  sourceUrl: string
  addressStreet: string
  addressBuildingNumber: string
  addressApartmentNumber: string
  addressCity: string
  addressZipCode: string
  addressDistrict: string
  addressVoivodeship: string
  propertyType: PropertyType
  marketType: MarketType
  area: string
  plotArea: string
  rooms: string
  price: string
  pricePerMeter: string
  description: string
  mediaUrls: string
  listingStatus: ListingStatus
  notes: string
  tags: string
}

const STORAGE_KEY = 'mwpanel-property-create-draft-v2'

const defaultForm: DraftForm = {
  title: '',
  sourceUrl: '',
  addressStreet: '',
  addressBuildingNumber: '',
  addressApartmentNumber: '',
  addressCity: '',
  addressZipCode: '',
  addressDistrict: '',
  addressVoivodeship: '',
  propertyType: PropertyType.APARTMENT,
  marketType: MarketType.SECONDARY,
  area: '',
  plotArea: '',
  rooms: '',
  price: '',
  pricePerMeter: '',
  description: '',
  mediaUrls: '',
  listingStatus: ListingStatus.DRAFT,
  notes: '',
  tags: '',
}

const sectionClass = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4'

export default function PropertyCreate() {
  const navigate = useNavigate()
  const { listings, fetchListings, addProperty, addListing, getAgencyId } = useDataStore()

  const [mode, setMode] = useState<CreateMode>('manual')
  const [form, setForm] = useState<DraftForm>(defaultForm)
  const [autoFields, setAutoFields] = useState<Set<string>>(new Set())
  const [importUrl, setImportUrl] = useState('')
  const [duplicateListingId, setDuplicateListingId] = useState('')
  const [loadingImport, setLoadingImport] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    void fetchListings()
  }, [fetchListings])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { mode?: CreateMode; form?: Partial<DraftForm>; autoFields?: string[] }
      if (parsed.mode) setMode(parsed.mode)
      if (parsed.form) setForm((prev) => ({ ...prev, ...parsed.form }))
      if (Array.isArray(parsed.autoFields)) setAutoFields(new Set(parsed.autoFields))
    } catch {
      // ignore corrupted draft
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          form,
          autoFields: [...autoFields],
          savedAt: new Date().toISOString(),
        })
      )
    }, 500)
    return () => clearTimeout(t)
  }, [mode, form, autoFields])

  const setField = (key: keyof DraftForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const markAuto = (...fields: Array<keyof DraftForm>) => {
    setAutoFields((prev) => {
      const next = new Set(prev)
      fields.forEach((f) => next.add(f))
      return next
    })
  }

  const completion = useMemo(() => {
    const required: Array<keyof DraftForm> = [
      'addressCity',
      'addressStreet',
      'addressZipCode',
      'propertyType',
      'area',
      'price',
      'description',
    ]
    const done = required.filter((key) => String(form[key] || '').trim().length > 0).length
    return Math.round((done / required.length) * 100)
  }, [form])

  const selectedDuplicate = useMemo(() => listings.find((l) => l.id === duplicateListingId), [listings, duplicateListingId])

  const applyDuplicate = () => {
    if (!selectedDuplicate?.property) return
    const p = selectedDuplicate.property
    setForm((prev) => ({
      ...prev,
      title: `${p.propertyType} • ${p.address.city}`,
      sourceUrl: selectedDuplicate.sourceUrl || '',
      addressStreet: p.address.street || '',
      addressBuildingNumber: p.address.buildingNumber || '',
      addressApartmentNumber: p.address.apartmentNumber || '',
      addressCity: p.address.city || '',
      addressZipCode: p.address.zipCode || '',
      addressDistrict: p.address.district || '',
      addressVoivodeship: p.address.voivodeship || '',
      propertyType: p.propertyType,
      marketType: p.marketType,
      area: String(p.area || ''),
      plotArea: String(p.plotArea || ''),
      rooms: String(p.rooms || ''),
      price: String(selectedDuplicate.price || p.price || ''),
      pricePerMeter: String(p.pricePerMeter || ''),
      description: p.description || '',
      mediaUrls: Array.isArray(p.media) ? p.media.map((m: any) => (typeof m === 'string' ? m : m.url)).filter(Boolean).join('\n') : '',
      listingStatus: ListingStatus.DRAFT,
      notes: selectedDuplicate.notes || '',
      tags: (selectedDuplicate.tags || []).join(', '),
    }))
    setInfo('Dane skopiowane z wybranej oferty.')
  }

  const handleImportPreview = async () => {
    if (!importUrl.trim()) return
    try {
      setLoadingImport(true)
      setError('')
      setInfo('')
      const data = await apiFetch<ImportPreview>('/listings/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      })

      setForm((prev) => {
        const nextArea = data.areaMin ?? data.area ?? undefined
        const nextPricePerMeter = data.pricePerM2 ?? undefined
        const estimatedPriceFromRange = nextArea && nextPricePerMeter ? Math.round(nextArea * nextPricePerMeter) : undefined
        const nextPrice = data.price ?? estimatedPriceFromRange

        const textForTypeGuess = `${data.url || ''} ${data.title || ''} ${data.description || ''}`.toLowerCase()
        const inferredType = /dzia[łl]k|grunt|plot/.test(textForTypeGuess)
          ? PropertyType.PLOT
          : /lokal|biuro|commercial|office/.test(textForTypeGuess)
            ? PropertyType.COMMERCIAL
            : /dom|house|villa/.test(textForTypeGuess)
              ? PropertyType.HOUSE
              : /mieszkan|apartament|flat|apartment/.test(textForTypeGuess)
                ? PropertyType.APARTMENT
                : prev.propertyType

        const autoNotesParts = [
          data.listingCount ? `Liczba działek: ${data.listingCount}` : null,
          data.areaMin && data.areaMax ? `Zakres metrażu: ${data.areaMin}-${data.areaMax} m²` : null,
          data.pricePerM2 ? `Cena orientacyjna: ${data.pricePerM2} zł/m²` : null,
          data.pricePerM2Forest ? `Przy lesie: ${data.pricePerM2Forest} zł/m²` : null,
        ].filter(Boolean)

        const autoNoteText = autoNotesParts.length > 0 ? `\n${autoNotesParts.join(' | ')}` : ''

        return {
          ...prev,
          sourceUrl: data.url || importUrl.trim(),
          title: data.title || prev.title,
          description: data.description || prev.description,
          propertyType: inferredType,
          marketType: prev.marketType || MarketType.SECONDARY,
          price: nextPrice != null && nextPrice > 0 ? String(Math.round(nextPrice)) : prev.price,
          area: nextArea != null && nextArea > 0 ? String(Math.round(nextArea)) : prev.area,
          plotArea: data.areaMax != null && data.areaMax > 0 ? String(Math.round(data.areaMax)) : prev.plotArea,
          pricePerMeter: nextPricePerMeter != null && nextPricePerMeter > 0 ? String(Math.round(nextPricePerMeter)) : prev.pricePerMeter,
          addressCity: data.city || prev.addressCity,
          addressDistrict: data.district || prev.addressDistrict,
          addressVoivodeship: data.voivodeship || prev.addressVoivodeship,
          addressStreet: data.street || prev.addressStreet,
          notes: autoNoteText ? `${(prev.notes || '').trim()}${autoNoteText}`.trim() : prev.notes,
          mediaUrls: data.imageUrl ? [data.imageUrl, prev.mediaUrls].filter(Boolean).join('\n') : prev.mediaUrls,
        }
      })

      markAuto('sourceUrl', 'title', 'description', 'propertyType', 'marketType', 'price', 'area', 'plotArea', 'pricePerMeter', 'addressCity', 'addressDistrict', 'addressVoivodeship', 'addressStreet', 'notes', 'mediaUrls')
      setInfo('Pobrano dane z linku (w tym typ nieruchomości, metraż/cena za m²/liczba działek) i wstawiono do formularza.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać danych z linku.')
    } finally {
      setLoadingImport(false)
    }
  }

  const generateDescription = () => {
    const location = `${form.addressStreet} ${form.addressBuildingNumber}`.trim()
    const city = form.addressCity
    const area = form.area ? `${form.area} m²` : 'powierzchnia do uzupełnienia'
    const rooms = form.rooms ? `${form.rooms} pok.` : ''
    const price = form.price ? `${Number(form.price).toLocaleString('pl-PL')} PLN` : 'cena do ustalenia'

    const text = `Na sprzedaż ${form.propertyType === PropertyType.PLOT ? 'działka' : 'nieruchomość'} w lokalizacji ${location}, ${city}. Powierzchnia: ${area}${rooms ? `, ${rooms}` : ''}. Cena ofertowa: ${price}. ${form.description || 'Zapraszamy do kontaktu po więcej szczegółów.'}`
    setField('description', text)
    setInfo('Wygenerowano roboczy opis oferty.')
  }

  const buildMedia = () => {
    return form.mediaUrls
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((url, idx) => ({
        id: `m-${Date.now()}-${idx}`,
        type: 'image' as const,
        url,
        order: idx,
        isPrimary: idx === 0,
      }))
  }

  const createListing = async (targetStatus: ListingStatus) => {
    if (saving) return null

    try {
      setSaving(true)
      setError('')
      setInfo('')

      const agencyId = getAgencyId()
      const now = new Date().toISOString()
      const media = buildMedia()

      const property = await addProperty({
        agencyId,
        address: {
          street: form.addressStreet || 'Uzupełnij adres',
          buildingNumber: form.addressBuildingNumber || '',
          apartmentNumber: form.addressApartmentNumber || '',
          city: form.addressCity || 'Uzupełnij miasto',
          zipCode: form.addressZipCode || '00-000',
          district: form.addressDistrict || '',
          voivodeship: form.addressVoivodeship || '',
          country: 'Poland',
        },
        propertyType: form.propertyType,
        marketType: form.marketType,
        area: Math.max(1, Number(form.area || 0)),
        plotArea: Number(form.plotArea || 0) || undefined,
        rooms: Number(form.rooms || 0) || undefined,
        price: Number(form.price || 0),
        pricePerMeter: Number(form.pricePerMeter || 0) || undefined,
        description: form.description,
        media,
      })

      const listing = await addListing({
        propertyId: property.id,
        agencyId,
        listingNumber: `OF/${new Date().getFullYear()}/${Date.now().toString().slice(-6)}`,
        status: targetStatus,
        source: mode === 'import' ? ListingSource.OTHER : ListingSource.MANUAL,
        sourceUrl: form.sourceUrl || undefined,
        price: Number(form.price || 0),
        priceHistory: [{ price: Number(form.price || 0), currency: 'PLN', changedAt: now, reason: 'init' }],
        views: 0,
        inquiries: 0,
        publicationStatus: {},
        notes: form.notes || form.description || '',
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })

      localStorage.removeItem(STORAGE_KEY)
      return { property, listing }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać oferty')
      return null
    } finally {
      setSaving(false)
    }
  }

  const onSaveDraft = async () => {
    const result = await createListing(ListingStatus.DRAFT)
    if (result) navigate(`/nieruchomosci/${result.listing.id}?edit=1`)
  }

  const onPublish = async () => {
    const result = await createListing(ListingStatus.ACTIVE)
    if (result) navigate(`/nieruchomosci/${result.listing.id}`)
  }

  const onGenerateDocument = async () => {
    const result = await createListing(ListingStatus.DRAFT)
    if (result) {
      navigate(`/generator?template=KN&propertyId=${result.property.id}`)
    }
  }

  const FieldLabel = ({ label, field }: { label: string; field: keyof DraftForm }) => (
    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      {autoFields.has(field) && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">auto</span>}
    </label>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/nieruchomosci" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
          <ArrowLeft size={16} /> Powrót
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Dodaj nieruchomość</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Nowy, prowadzony formularz dodawania oferty.</p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className={sectionClass}>
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Tryb dodawania</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'manual', label: 'Dodaj ręcznie' },
                { key: 'import', label: 'Importuj z linku' },
                { key: 'duplicate', label: 'Duplikuj ofertę' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMode(item.key as CreateMode)}
                  className={`rounded-lg border px-3 py-2 text-sm ${mode === item.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {mode === 'import' && (
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Wklej URL ogłoszenia"
                  className="rounded-lg border px-3 py-2"
                />
                <button
                  onClick={() => void handleImportPreview()}
                  disabled={loadingImport}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                >
                  {loadingImport ? 'Pobieranie...' : 'Pobierz dane'}
                </button>
              </div>
            )}

            {mode === 'duplicate' && (
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                <select
                  value={duplicateListingId}
                  onChange={(e) => setDuplicateListingId(e.target.value)}
                  title="Wybierz ofertę do duplikacji"
                  className="rounded-lg border px-3 py-2"
                >
                  <option value="">Wybierz ofertę do duplikacji</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>{l.listingNumber} • {l.property?.address?.city || '-'}</option>
                  ))}
                </select>
                <button onClick={applyDuplicate} className="rounded-lg border px-4 py-2">Wczytaj</button>
              </div>
            )}
          </div>

          <div className={sectionClass}>
            <h2 className="mb-3 text-lg font-semibold">Lokalizacja</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <FieldLabel label="Ulica" field="addressStreet" />
                <input value={form.addressStreet} onChange={(e) => setField('addressStreet', e.target.value)} title="Ulica" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Nr budynku" field="addressBuildingNumber" />
                <input value={form.addressBuildingNumber} onChange={(e) => setField('addressBuildingNumber', e.target.value)} title="Nr budynku" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Nr lokalu" field="addressApartmentNumber" />
                <input value={form.addressApartmentNumber} onChange={(e) => setField('addressApartmentNumber', e.target.value)} title="Nr lokalu" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Miasto" field="addressCity" />
                <input value={form.addressCity} onChange={(e) => setField('addressCity', e.target.value)} title="Miasto" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Kod pocztowy" field="addressZipCode" />
                <input value={form.addressZipCode} onChange={(e) => setField('addressZipCode', e.target.value)} title="Kod pocztowy" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Dzielnica / gmina" field="addressDistrict" />
                <input value={form.addressDistrict} onChange={(e) => setField('addressDistrict', e.target.value)} title="Dzielnica / gmina" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Województwo" field="addressVoivodeship" />
                <input value={form.addressVoivodeship} onChange={(e) => setField('addressVoivodeship', e.target.value)} title="Województwo" className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="mb-3 text-lg font-semibold">Parametry</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <FieldLabel label="Typ nieruchomości" field="propertyType" />
                <select value={form.propertyType} onChange={(e) => setField('propertyType', e.target.value)} title="Typ nieruchomości" className="w-full rounded-lg border px-3 py-2">
                  <option value={PropertyType.APARTMENT}>Mieszkanie</option>
                  <option value={PropertyType.HOUSE}>Dom</option>
                  <option value={PropertyType.PLOT}>Działka</option>
                  <option value={PropertyType.COMMERCIAL}>Lokal komercyjny</option>
                </select>
              </div>
              <div>
                <FieldLabel label="Rynek" field="marketType" />
                <select value={form.marketType} onChange={(e) => setField('marketType', e.target.value)} title="Rynek" className="w-full rounded-lg border px-3 py-2">
                  <option value={MarketType.PRIMARY}>Pierwotny</option>
                  <option value={MarketType.SECONDARY}>Wtórny</option>
                </select>
              </div>
              <div>
                <FieldLabel label="Pow. użytkowa (m²)" field="area" />
                <input type="number" value={form.area} onChange={(e) => setField('area', e.target.value)} title="Pow. użytkowa (m²)" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Pow. działki (m²)" field="plotArea" />
                <input type="number" value={form.plotArea} onChange={(e) => setField('plotArea', e.target.value)} title="Pow. działki (m²)" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Liczba pokoi" field="rooms" />
                <input type="number" value={form.rooms} onChange={(e) => setField('rooms', e.target.value)} title="Liczba pokoi" className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="mb-3 text-lg font-semibold">Cena</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <FieldLabel label="Cena (PLN)" field="price" />
                <input type="number" value={form.price} onChange={(e) => setField('price', e.target.value)} title="Cena (PLN)" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Cena za m²" field="pricePerMeter" />
                <input type="number" value={form.pricePerMeter} onChange={(e) => setField('pricePerMeter', e.target.value)} title="Cena za m²" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Status publikacji" field="listingStatus" />
                <select value={form.listingStatus} onChange={(e) => setField('listingStatus', e.target.value)} title="Status publikacji" className="w-full rounded-lg border px-3 py-2">
                  <option value={ListingStatus.DRAFT}>Szkic</option>
                  <option value={ListingStatus.ACTIVE}>Aktywna</option>
                </select>
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="mb-3 text-lg font-semibold">Opis</h2>
            <div className="space-y-3">
              <div>
                <FieldLabel label="Tytuł oferty" field="title" />
                <input value={form.title} onChange={(e) => setField('title', e.target.value)} title="Tytuł oferty" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Opis" field="description" />
                <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} rows={6} title="Opis" className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="mb-3 text-lg font-semibold">Media</h2>
            <div className="space-y-3">
              <div>
                <FieldLabel label="URL źródłowy ogłoszenia" field="sourceUrl" />
                <input value={form.sourceUrl} onChange={(e) => setField('sourceUrl', e.target.value)} title="URL źródłowy ogłoszenia" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Linki do zdjęć (1 link w linii)" field="mediaUrls" />
                <textarea value={form.mediaUrls} onChange={(e) => setField('mediaUrls', e.target.value)} rows={5} title="Linki do zdjęć" className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="mb-3 text-lg font-semibold">Publikacja</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <FieldLabel label="Tagi (oddzielone przecinkiem)" field="tags" />
                <input value={form.tags} onChange={(e) => setField('tags', e.target.value)} title="Tagi" className="w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <FieldLabel label="Notatki wewnętrzne" field="notes" />
                <input value={form.notes} onChange={(e) => setField('notes', e.target.value)} title="Notatki wewnętrzne" className="w-full rounded-lg border px-3 py-2" />
              </div>
            </div>
          </div>

          {previewOpen && (
            <div className={sectionClass}>
              <h2 className="mb-2 text-lg font-semibold">Podgląd roboczy</h2>
              <p className="text-sm text-gray-600">{form.title || 'Bez tytułu'}</p>
              <p className="mt-2 text-sm text-gray-600">{form.description || 'Brak opisu'}</p>
            </div>
          )}
        </div>

        <aside className="h-max space-y-3 xl:sticky xl:top-20">
          <div className={sectionClass}>
            <p className="text-sm font-semibold">Kompletność formularza</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
              <progress
                max={100}
                value={completion}
                aria-label="Kompletność formularza"
                className="w-full h-2 appearance-none [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:rounded [&::-webkit-progress-value]:bg-blue-600 [&::-moz-progress-bar]:bg-blue-600"
              />
            </div>
            <p className="mt-1 text-sm text-gray-600">{completion}%</p>
            <p className="mt-2 text-xs text-gray-500">Autosave: włączony (co ~0.5s po zmianie)</p>
          </div>

          <button onClick={() => void onSaveDraft()} disabled={saving} className="w-full rounded-lg border px-4 py-2 text-left hover:bg-gray-50 disabled:opacity-60">
            <span className="flex items-center gap-2"><Save size={16} /> Zapisz szkic</span>
          </button>
          <button onClick={() => setPreviewOpen((p) => !p)} className="w-full rounded-lg border px-4 py-2 text-left hover:bg-gray-50">
            <span className="flex items-center gap-2"><Eye size={16} /> Podgląd</span>
          </button>
          <button onClick={generateDescription} className="w-full rounded-lg border px-4 py-2 text-left hover:bg-gray-50">
            <span className="flex items-center gap-2"><Bot size={16} /> Generuj opis AI</span>
          </button>
          <button onClick={() => void onGenerateDocument()} disabled={saving} className="w-full rounded-lg border px-4 py-2 text-left hover:bg-gray-50 disabled:opacity-60">
            <span className="flex items-center gap-2"><FileText size={16} /> Generuj dokument</span>
          </button>
          <button onClick={() => void onPublish()} disabled={saving} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-left text-white hover:bg-blue-700 disabled:opacity-60">
            <span className="flex items-center gap-2"><UploadCloud size={16} /> Opublikuj</span>
          </button>
        </aside>
      </div>
    </div>
  )
}
