import { randomUUID } from 'node:crypto'

const OFFER_TYPES = new Set(['sale', 'rent'])
const PROPERTY_TYPES = new Set(['flat', 'house', 'plot', 'commercial'])
const STATUSES = new Set(['new', 'active', 'updated', 'inactive', 'archived'])

const nowIso = () => new Date().toISOString()

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

const normalizeText = (v) => (v || '').toString().trim()
const normalizeLower = (v) => normalizeText(v).toLowerCase()

const POLISH_VOIVODESHIPS = new Set([
  'dolnośląskie','kujawsko-pomorskie','lubelskie','lubuskie','łódzkie','małopolskie','mazowieckie','opolskie',
  'podkarpackie','podlaskie','pomorskie','śląskie','świętokrzyskie','warmińsko-mazurskie','wielkopolskie','zachodniopomorskie',
  'dolnoslaskie','lodzkie','slaskie','swietokrzyskie','warminsko-mazurskie',
])

const FOREIGN_MARKERS = [
  'hiszpania','cypr','portugalia','wlochy','włochy','grecja','niemcy','francja','turcja','chorwacja','albania',
  'hiszpanii','cyprze','spain','italy','greece','germany','france','turkey','croatia','albania',
]

const hasForeignMarker = (text) => {
  const t = normalizeLower(text)
  return FOREIGN_MARKERS.some((marker) => t.includes(marker))
}

const looksPolishUrl = (value) => {
  const url = normalizeText(value)
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith('.pl') || host === 'otodom.pl' || host === 'www.otodom.pl'
  } catch {
    return false
  }
}

const isPolishListing = (item = {}) => {
  const city = normalizeLower(item.city)
  const district = normalizeLower(item.district)
  const locationText = normalizeLower(item.locationText || item.location_text)
  const title = normalizeLower(item.title)
  const voivodeship = normalizeLower(item.voivodeship)
  const sourceUrl = normalizeText(item.sourceUrl || item.source_url)

  const fullText = [title, city, district, locationText, voivodeship].join(' | ')

  if (hasForeignMarker(fullText)) return false
  if (voivodeship && POLISH_VOIVODESHIPS.has(voivodeship)) return true
  if (fullText.includes('polska')) return true
  if (looksPolishUrl(sourceUrl) && !hasForeignMarker(fullText)) return true
  return false
}

export const computeHashSignature = (item) => {
  const core = [
    item.title || '',
    item.description || '',
    item.city || '',
    item.district || '',
    Number(item.price || 0).toFixed(0),
    Number(item.areaM2 || 0).toFixed(2),
    Number(item.plotAreaM2 || 0).toFixed(2),
    Number(item.rooms || 0).toFixed(2),
  ].join('|')
  let hash = 5381
  for (let i = 0; i < core.length; i += 1) hash = ((hash << 5) + hash) ^ core.charCodeAt(i)
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0')
}

export const normalizeExternalListing = (raw, source) => {
  const offerType = OFFER_TYPES.has(raw.offerType) ? raw.offerType : 'sale'
  const propertyType = PROPERTY_TYPES.has(raw.propertyType) ? raw.propertyType : 'flat'
  const status = STATUSES.has(raw.status) ? raw.status : 'active'
  const item = {
    sourceId: source.id,
    sourceListingId: normalizeText(raw.sourceListingId || raw.id || raw.externalId),
    sourceUrl: normalizeText(raw.sourceUrl || raw.url),
    offerType,
    propertyType,
    plotType: normalizeText(raw.plotType) || null,
    title: normalizeText(raw.title),
    description: normalizeText(raw.description).slice(0, 12000),
    locationText: normalizeText(raw.locationText || raw.location),
    city: normalizeText(raw.city),
    district: normalizeText(raw.district),
    voivodeship: normalizeText(raw.voivodeship),
    price: Number(raw.price || 0) || 0,
    pricePerM2: Number(raw.pricePerM2 || 0) || 0,
    areaM2: Number(raw.areaM2 || raw.area || 0) || 0,
    plotAreaM2: Number(raw.plotAreaM2 || raw.plotArea || 0) || 0,
    rooms: Number(raw.rooms || 0) || 0,
    marketType: normalizeText(raw.marketType),
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    imagesJson: Array.isArray(raw.images) ? raw.images.slice(0, 30) : [],
    contactName: normalizeText(raw.contactName),
    contactPhone: normalizeText(raw.contactPhone),
    agencyName: normalizeText(raw.agencyName),
    publishedAtSource: raw.publishedAtSource || raw.publishedAt || nowIso(),
    status,
    rawPayloadJson: raw,
  }
  item.hashSignature = computeHashSignature(item)
  return item
}

export const likelyDuplicateByHeuristic = (a, b) => {
  const sameCity = (a.city || '').toLowerCase() === (b.city || '').toLowerCase()
  const sameDistrict = (a.district || '').toLowerCase() === (b.district || '').toLowerCase()
  const titleA = (a.title || '').toLowerCase().replace(/\s+/g, ' ')
  const titleB = (b.title || '').toLowerCase().replace(/\s+/g, ' ')
  const titleClose = titleA && titleB && (titleA.includes(titleB.slice(0, 12)) || titleB.includes(titleA.slice(0, 12)))
  const priceDelta = Math.abs((a.price || 0) - (b.price || 0))
  const areaDelta = Math.abs((a.areaM2 || 0) - (b.areaM2 || 0))
  return sameCity && (sameDistrict || titleClose) && priceDelta <= 25000 && areaDelta <= 8
}

const mapExternalListing = (row) => ({
  id: row.id,
  sourceId: row.source_id,
  sourceListingId: row.source_listing_id,
  sourceUrl: row.source_url,
  offerType: row.offer_type,
  propertyType: row.property_type,
  plotType: row.plot_type || undefined,
  title: row.title,
  description: row.description,
  locationText: row.location_text,
  city: row.city,
  district: row.district,
  voivodeship: row.voivodeship,
  price: row.price,
  pricePerM2: row.price_per_m2,
  areaM2: row.area_m2,
  plotAreaM2: row.plot_area_m2,
  rooms: row.rooms,
  marketType: row.market_type,
  latitude: row.latitude,
  longitude: row.longitude,
  images: safeJsonParse(row.images_json, []),
  contactName: row.contact_name,
  contactPhone: row.contact_phone,
  agencyName: row.agency_name,
  publishedAtSource: row.published_at_source,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  status: row.status,
  hashSignature: row.hash_signature,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const deriveSourceHealth = (row) => {
  const status = String(row?.last_status || '').toLowerCase()
  const lastSyncAt = row?.last_sync_at ? new Date(row.last_sync_at).getTime() : NaN
  const staleMs = 2 * 60 * 60 * 1000
  const isStale = Number.isFinite(lastSyncAt) ? (Date.now() - lastSyncAt > staleMs) : true
  if (status === 'failed') return { health: 'error', stale: isStale }
  if (status === 'retrying' || status === 'running') return { health: 'warning', stale: isStale }
  if (isStale && row?.is_active === 1) return { health: 'warning', stale: true }
  if (status === 'success' || status === 'partial') return { health: status === 'partial' ? 'warning' : 'ok', stale: false }
  return { health: row?.is_active === 1 ? 'warning' : 'idle', stale: isStale }
}

const mapSource = (row) => {
  const derived = deriveSourceHealth(row)
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    baseUrl: row.base_url,
    isActive: row.is_active === 1,
    config: safeJsonParse(row.config_json, {}),
    lastSyncAt: row.last_sync_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    health: derived.health,
    stale: derived.stale,
  }
}

const IMPORT_JOB_STATUS_MAP = {
  success: 'successful',
  successful: 'successful',
  completed: 'successful',
  failed: 'failed',
  error: 'failed',
  running: 'pending',
  pending: 'pending',
  retrying: 'retrying',
  partial: 'partial',
  warning: 'warning',
}

const normalizeImportJobStatus = (status) => {
  const raw = String(status || '').trim().toLowerCase()
  return IMPORT_JOB_STATUS_MAP[raw] || raw || 'pending'
}

const mapImportJob = (row) => ({
  id: row.id,
  sourceId: row.source_id,
  sourceName: row.source_name,
  sourceCode: row.source_code,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: normalizeImportJobStatus(row.status),
  rawStatus: row.status,
  processedCount: row.processed_count,
  newCount: row.new_count,
  updatedCount: row.updated_count,
  inactiveCount: row.inactive_count,
  retryCount: Number(row.retry_count || 0),
  errorReason: row.error_reason || null,
  errorMessage: row.error_message || row.error_log || null,
  errorLog: row.error_log,
})

const createNotificationForAgency = (db, agencyId, title, message) => {
  try {
    const users = db.prepare('SELECT id FROM users WHERE agency_id = ? AND status = ?').all(agencyId, 'active')
    const stmt = db.prepare(`INSERT INTO notifications (id, user_id, agency_id, type, title, message, read, created_at, updated_at)
      VALUES (@id,@user_id,@agency_id,@type,@title,@message,@read,@created_at,@updated_at)`)
    const now = nowIso()
    for (const user of users) {
      stmt.run({
        id: randomUUID(),
        user_id: user.id,
        agency_id: agencyId,
        type: 'external_listing',
        title,
        message,
        read: 0,
        created_at: now,
        updated_at: now,
      })
    }
  } catch {
    // Optional integration: notifications table may be unavailable in some deployments.
  }
}


const getByPath = (obj, path, fallback = undefined) => {
  if (!path) return fallback
  const parts = String(path).split('.').filter(Boolean)
  let current = obj
  for (const part of parts) {
    if (current == null) return fallback
    current = current[part]
  }
  return current == null ? fallback : current
}

const adapterFetchFeedOrApi = async (source) => {
  const config = safeJsonParse(source.config_json, {})
  const endpoint = config.apiUrl || config.feedUrl
  if (!endpoint) return adapterFetchMock(source)

  const headers = {
    'Accept': 'application/json',
    ...(config.headers || {}),
  }
  if (config.apiToken) headers.Authorization = `Bearer ${config.apiToken}`

  const controller = new AbortController()
  const timeoutMs = Number(config.timeoutMs || 15000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let json
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`)
    json = await response.json()
  } finally {
    clearTimeout(timer)
  }

  const itemsPath = config.itemsPath || 'items'
  const rawItems = getByPath(json, itemsPath, Array.isArray(json) ? json : [])
  if (!Array.isArray(rawItems)) return []

  const mapping = config.mapping || {}
  return rawItems.map((it) => ({
    sourceListingId: getByPath(it, mapping.sourceListingId || 'id'),
    sourceUrl: getByPath(it, mapping.sourceUrl || 'url'),
    offerType: getByPath(it, mapping.offerType || 'offerType') || 'sale',
    propertyType: getByPath(it, mapping.propertyType || 'propertyType') || 'flat',
    plotType: getByPath(it, mapping.plotType || 'plotType') || null,
    title: getByPath(it, mapping.title || 'title') || '',
    description: getByPath(it, mapping.description || 'description') || '',
    locationText: getByPath(it, mapping.locationText || 'location') || '',
    city: getByPath(it, mapping.city || 'city') || '',
    district: getByPath(it, mapping.district || 'district') || '',
    voivodeship: getByPath(it, mapping.voivodeship || 'voivodeship') || '',
    price: getByPath(it, mapping.price || 'price') || 0,
    pricePerM2: getByPath(it, mapping.pricePerM2 || 'pricePerM2') || 0,
    areaM2: getByPath(it, mapping.areaM2 || 'areaM2') || getByPath(it, mapping.area || 'area') || 0,
    plotAreaM2: getByPath(it, mapping.plotAreaM2 || 'plotAreaM2') || getByPath(it, mapping.plotArea || 'plotArea') || 0,
    rooms: getByPath(it, mapping.rooms || 'rooms') || 0,
    marketType: getByPath(it, mapping.marketType || 'marketType') || '',
    latitude: getByPath(it, mapping.latitude || 'latitude') ?? null,
    longitude: getByPath(it, mapping.longitude || 'longitude') ?? null,
    images: getByPath(it, mapping.images || 'images') || [],
    contactName: getByPath(it, mapping.contactName || 'contactName') || '',
    contactPhone: getByPath(it, mapping.contactPhone || 'contactPhone') || '',
    agencyName: getByPath(it, mapping.agencyName || 'agencyName') || '',
    publishedAtSource: getByPath(it, mapping.publishedAtSource || 'publishedAt') || nowIso(),
    rawPayload: it,
  }))
}

const sanitizeUrl = (url) => {
  const value = String(url || '').trim()
  if (!value) return ''
  if (!value.startsWith('http://') && !value.startsWith('https://')) return ''
  return value
}

const assessImportCompleteness = (item) => {
  const missingFields = []
  if (!normalizeText(item.title)) missingFields.push('title')
  if (!Number(item.price || 0)) missingFields.push('price')
  if (!Number(item.areaM2 || 0) && !Number(item.plotAreaM2 || 0)) missingFields.push('area')
  if (!normalizeText(item.city) && !normalizeText(item.locationText)) missingFields.push('location')
  if (!Array.isArray(item.imagesJson) || item.imagesJson.length === 0) missingFields.push('images')
  if (!normalizeText(item.description) || normalizeText(item.description).length < 40) missingFields.push('description')
  return {
    isPartial: missingFields.length > 0,
    missingFields,
    completenessScore: Math.max(0, 100 - missingFields.length * 15),
  }
}

const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const extractPrimaryImageFromHtml = (html) => {
  const raw = String(html || '')
  const og = raw.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (og?.[1]) return og[1]
  const tw = raw.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
  if (tw?.[1]) return tw[1]
  const img = raw.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)
  if (img?.[1]) return img[1]
  return ''
}

const fetchPrimaryImageFromDetail = async (url, timeoutMs = 10000) => {
  const safe = sanitizeUrl(url)
  if (!safe) return ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(safe, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
      },
      signal: controller.signal,
    })
    if (!response.ok) return ''
    const html = await response.text()
    return extractPrimaryImageFromHtml(html)
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

const extractJsonLdObjects = (html) => {
  const scripts = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const out = []
  for (const m of scripts) {
    const raw = (m[1] || '').trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return out
}

const normalizePropertyTypeGuess = (text) => {
  const t = String(text || '').toLowerCase()
  if (t.includes('dział') || t.includes('dzialk') || t.includes('plot')) return 'plot'
  if (t.includes('dom') || t.includes('house')) return 'house'
  if (t.includes('lokal') || t.includes('commercial') || t.includes('office')) return 'commercial'
  return 'flat'
}

const parsePriceFromText = (text) => {
  const raw = String(text || '')
  if (!/(zł|zl|pln|€|eur)/i.test(raw)) return 0
  const m = raw.match(/([0-9][0-9\s\.,]{2,})\s*(zł|zl|pln|€|eur)/i)
  if (!m) return 0
  const digits = m[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const value = Number(digits)
  if (!Number.isFinite(value)) return 0
  return value
}

const parseLocationParts = (text) => {
  const raw = String(text || '').trim()
  if (!raw) return { city: '', district: '', voivodeship: '', locationText: '' }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  return {
    city: parts[0] || '',
    district: parts[1] || '',
    voivodeship: parts[2] || '',
    locationText: raw,
  }
}


const isLikelyDetailUrl = (sourceCode, url) => {
  const u = String(url || '').toLowerCase()
  if (!u) return false
  if (sourceCode === 'otodom') {
    return u.includes('/oferta/') || /\/id\w+/.test(u)
  }
  if (sourceCode === 'olx') {
    return u.includes('/d/oferta/')
  }
  if (sourceCode === 'gratka') {
    return u.includes('/oferta/') || /-id[a-z0-9]+/.test(u)
  }
  if (sourceCode === 'morizon') {
    return u.includes('/oferta/') || u.includes('/ogloszenie/')
  }
  if (sourceCode === 'domiporta') {
    return u.includes('/nieruchomosci/') || u.includes('/mieszkanie/') || u.includes('/dom/') || u.includes('/dzialka/')
  }
  if (sourceCode === 'facebook') {
    return u.includes('/marketplace/item/')
  }
  return /\/oferta\//.test(u)
}

const looksLikeCategoryTitle = (title) => {
  const t = String(title || '').toLowerCase().trim()
  if (!t) return true
  if (t.includes('.css-') || t.includes('{') || t.includes('display:-webkit-box')) return true
  const categoryHints = ['na sprzedaż', 'na sprzedaz', 'oferty', 'wyniki', 'nieruchomości', 'nieruchomosci']
  return categoryHints.some((h) => t.includes(h)) && t.split(' ').length <= 7
}


export const parseListingsFromHtml = (html, source) => {
  const items = []
  const jsonLdObjects = extractJsonLdObjects(html)

  for (const obj of jsonLdObjects) {
    const maybeList = Array.isArray(obj?.itemListElement) ? obj.itemListElement : null
    if (maybeList) {
      for (const el of maybeList) {
        const item = el?.item || el
        if (!item) continue
        const url = sanitizeUrl(item.url || item['@id'])
        const title = item.name || ''
        const description = item.description || ''
        const offers = item.offers || {}
        const price = Number(offers.price || 0) || 0
        const loc = parseLocationParts(item.address?.addressLocality || item.address?.addressRegion || '')
        if (url && title && isLikelyDetailUrl(source.code, url) && price > 0 && !looksLikeCategoryTitle(title)) {
          items.push({
            sourceListingId: item.identifier || item.sku || url,
            sourceUrl: url,
            offerType: 'sale',
            propertyType: normalizePropertyTypeGuess(title + ' ' + description),
            title,
            description,
            city: loc.city,
            district: loc.district,
            voivodeship: loc.voivodeship,
            locationText: loc.locationText,
            price,
            areaM2: Number(item.floorSize?.value || 0) || 0,
            rooms: Number(item.numberOfRooms || 0) || 0,
            images: item.image ? (Array.isArray(item.image) ? item.image : [item.image]) : [],
            publishedAtSource: nowIso(),
            rawPayload: item,
          })
        }
      }
    }
  }

  if (items.length > 0) return items

  const anchors = [...String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const a of anchors) {
    const href = a[1] || ''
    const rawAnchor = a[2] || ''
    const body = stripHtml(rawAnchor)
    const imgMatch = rawAnchor.match(/<img[^>]+src=["']([^"']+)["']/i)
    const imgSrc = imgMatch?.[1] || ''
    if (!href || body.length < 20) continue
    if (!/otodom|olx|gratka|morizon|domiporta|facebook/i.test(href) && !href.startsWith('/')) continue
    const absolute = href.startsWith('http') ? href : `${source.base_url}${href.startsWith('/') ? '' : '/'}${href}`
    if (!/nieruchomos|ofert|offer|dzialk|mieszkani|dom/i.test((absolute + ' ' + body).toLowerCase())) continue
    if (!isLikelyDetailUrl(source.code, absolute)) continue
    const price = parsePriceFromText(body)
    const loc = parseLocationParts(body)
    if (price <= 0 || looksLikeCategoryTitle(body)) continue
    items.push({
      sourceListingId: absolute,
      sourceUrl: absolute,
      offerType: 'sale',
      propertyType: normalizePropertyTypeGuess(body),
      title: body.slice(0, 140),
      description: body,
      city: loc.city,
      district: loc.district,
      voivodeship: loc.voivodeship,
      locationText: loc.locationText,
      price,
      areaM2: 0,
      rooms: 0,
      images: imgSrc ? [imgSrc] : [],
      publishedAtSource: nowIso(),
      rawPayload: { href: absolute, text: body },
    })
  }

  const dedup = new Map()
  for (const it of items) {
    const key = it.sourceUrl || it.sourceListingId
    if (!key) continue
    if (!dedup.has(key)) dedup.set(key, it)
  }
  return [...dedup.values()].slice(0, 300)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const adapterFetchHtmlPublic = async (source) => {
  const config = safeJsonParse(source.config_json, {})
  const searchUrls = Array.isArray(config.searchUrls) ? config.searchUrls.map(sanitizeUrl).filter(Boolean) : []
  const defaultSearch = {
    otodom: [`${source.base_url}/pl/wyniki/sprzedaz/mieszkanie/cala-polska`, `${source.base_url}/pl/wyniki/sprzedaz/dzialka/cala-polska`],
    olx: [`${source.base_url}/nieruchomosci/mieszkania/sprzedaz/`, `${source.base_url}/nieruchomosci/dzialki/sprzedaz/`],
    gratka: [`${source.base_url}/nieruchomosci/mieszkania/sprzedaz`, `${source.base_url}/nieruchomosci/dzialki-grunty/sprzedaz`],
    morizon: [`${source.base_url}/mieszkania/sprzedaz/`, `${source.base_url}/dzialki/sprzedaz/`],
    domiporta: [`${source.base_url}/mieszkanie/sprzedam`, `${source.base_url}/dzialka/sprzedam`],
    facebook: [
      'https://www.facebook.com/marketplace/category/propertyforsale/',
      'https://www.facebook.com/marketplace/category/propertyforrent/'
    ],
  }
  const urls = searchUrls.length > 0 ? searchUrls : (defaultSearch[source.code] || [`${source.base_url}`])
  const maxPages = Math.max(1, Math.min(5, Number(config.maxPages || 1)))
  const reqDelayMs = Math.max(500, Math.min(10000, Number(config.requestDelayMs || 1800)))
  const timeoutMs = Math.max(5000, Math.min(30000, Number(config.timeoutMs || 15000)))
  const userAgent = config.userAgent || 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36'

  const out = []
  for (const baseUrl of urls) {
    for (let page = 1; page <= maxPages; page += 1) {
      const pageUrl = page === 1 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(pageUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': userAgent,
          },
          signal: controller.signal,
        })
        if (!response.ok) break
        const html = await response.text()
        const parsed = parseListingsFromHtml(html, source)
        if (parsed.length === 0) break
        out.push(...parsed)
      } catch {
        // fail-soft on one page
        break
      } finally {
        clearTimeout(t)
      }
      await sleep(reqDelayMs)
    }
  }

  const dedup = new Map()
  for (const item of out) {
    const key = item.sourceUrl || item.sourceListingId
    if (!key) continue
    if (!dedup.has(key)) dedup.set(key, item)
  }
  return [...dedup.values()].slice(0, 500)
}




const adapterFetchHtmlBrowser = async (source) => {
  const config = safeJsonParse(source.config_json, {})
  const searchUrls = Array.isArray(config.searchUrls) ? config.searchUrls.map(sanitizeUrl).filter(Boolean) : []
  const defaultSearch = {
    otodom: [`${source.base_url}/pl/wyniki/sprzedaz/mieszkanie/cala-polska`, `${source.base_url}/pl/wyniki/sprzedaz/dzialka/cala-polska`],
    olx: [`${source.base_url}/nieruchomosci/mieszkania/sprzedaz/`, `${source.base_url}/nieruchomosci/dzialki/sprzedaz/`],
    gratka: [`${source.base_url}/nieruchomosci/mieszkania/sprzedaz`, `${source.base_url}/nieruchomosci/dzialki-grunty/sprzedaz`],
    morizon: [`${source.base_url}/mieszkania/sprzedaz/`, `${source.base_url}/dzialki/sprzedaz/`],
    domiporta: [`${source.base_url}/mieszkanie/sprzedam`, `${source.base_url}/dzialka/sprzedam`],
    facebook: [
      'https://www.facebook.com/marketplace/category/propertyforsale/',
      'https://www.facebook.com/marketplace/category/propertyforrent/'
    ],
  }
  const urls = searchUrls.length > 0 ? searchUrls : (defaultSearch[source.code] || [`${source.base_url}`])
  const maxPages = Math.max(1, Math.min(3, Number(config.maxPages || 1)))
  const reqDelayMs = Math.max(800, Math.min(12000, Number(config.requestDelayMs || 2200)))

  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: config.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
  })

  const collected = []
  try {
    for (const baseUrl of urls) {
      for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
        const pageUrl = pageNo === 1 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${pageNo}`
        const page = await context.newPage()
        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: Number(config.timeoutMs || 20000) })
          await page.waitForTimeout(1500)
          const html = await page.content()
          const parsed = parseListingsFromHtml(html, source)
          collected.push(...parsed)

          // additional DOM extraction fallback
          const domItems = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href]'))
            return anchors.slice(0, 2500).map((a) => {
              const img = a.querySelector('img')
              return {
                href: a.getAttribute('href') || '',
                text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
                image: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
              }
            })
          })
          for (const row of domItems) {
            const href = row.href || ''
            const body = row.text || ''
            if (!href || body.length < 25) continue
            const absolute = href.startsWith('http') ? href : `${source.base_url}${href.startsWith('/') ? '' : '/'}${href}`
            if (!isLikelyDetailUrl(source.code, absolute)) continue
            if (looksLikeCategoryTitle(body)) continue
            const price = parsePriceFromText(body)
            if (price <= 0) continue
            collected.push({
              sourceListingId: absolute,
              sourceUrl: absolute,
              offerType: 'sale',
              propertyType: normalizePropertyTypeGuess(body),
              title: body.slice(0, 140),
              description: body,
              ...parseLocationParts(body),
              price,
              areaM2: 0,
              rooms: 0,
              images: row.image ? [row.image] : [],
              publishedAtSource: nowIso(),
              rawPayload: row,
            })
          }
        } catch {
          // skip page on errors
        } finally {
          await page.close()
        }
        await sleep(reqDelayMs)
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const dedup = new Map()
  for (const item of collected) {
    const key = item.sourceUrl || item.sourceListingId
    if (!key) continue
    if (!dedup.has(key)) dedup.set(key, item)
  }
  return [...dedup.values()].slice(0, 500)
}



const safeFetchJson = async (url, init = {}) => {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

const sendExternalAlertDelivery = async ({ channels, title, message, listing, metadata = {} }) => {
  const normalizedChannels = Array.isArray(channels) ? channels : []
  const genericWebhook = process.env.EXTERNAL_ALERT_WEBHOOK_URL
  const discordWebhook = process.env.EXTERNAL_ALERT_DISCORD_WEBHOOK_URL
  const telegramBotToken = process.env.EXTERNAL_ALERT_TELEGRAM_BOT_TOKEN
  const telegramChatId = process.env.EXTERNAL_ALERT_TELEGRAM_CHAT_ID
  const resendApiKey = process.env.RESEND_API_KEY
  const alertEmailTo = process.env.EXTERNAL_ALERT_EMAIL_TO

  const payload = {
    title,
    message,
    listing,
    metadata,
    timestamp: nowIso(),
  }

  if (normalizedChannels.includes('webhook') && genericWebhook) {
    await fetch(genericWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  }
  if (normalizedChannels.includes('discord') && discordWebhook) {
    await fetch(discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🏠 **${title}**
${message}` }),
    })
  }
  if (normalizedChannels.includes('telegram') && telegramBotToken && telegramChatId) {
    const tgUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`
    await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text: `🏠 ${title}
${message}` }),
    })
  }
  if (normalizedChannels.includes('email') && resendApiKey && alertEmailTo) {
    await safeFetchJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EXTERNAL_ALERT_EMAIL_FROM || 'MWPanel Alerts <alerts@mwpanel.local>',
        to: [alertEmailTo],
        subject: title,
        html: `<p>${message}</p><pre>${JSON.stringify(payload, null, 2)}</pre>`,
      }),
    })
  }
}

const ruleMatchesListing = (rule, listing, eventType, context = {}) => {
  const ruleJson = safeJsonParse(rule.rule_json, {})
  const criteria = ruleJson.criteria || {}
  const events = Array.isArray(ruleJson.events) ? ruleJson.events : ['created']
  if (!events.includes(eventType)) return false

  if (criteria.offerType && listing.offerType !== criteria.offerType) return false
  if (criteria.propertyType && listing.propertyType !== criteria.propertyType) return false
  if (criteria.plotType && listing.plotType !== criteria.plotType) return false
  if (criteria.city && String(listing.city || '').toLowerCase() !== String(criteria.city).toLowerCase()) return false
  if (criteria.voivodeship && String(listing.voivodeship || '').toLowerCase() !== String(criteria.voivodeship).toLowerCase()) return false
  if (criteria.priceMin != null && Number(listing.price || 0) < Number(criteria.priceMin)) return false
  if (criteria.priceMax != null && Number(listing.price || 0) > Number(criteria.priceMax)) return false
  if (criteria.areaMin != null && Number(listing.areaM2 || 0) < Number(criteria.areaMin)) return false
  if (criteria.areaMax != null && Number(listing.areaM2 || 0) > Number(criteria.areaMax)) return false

  if (eventType === 'price_changed' && context.oldPrice == null) return false
  return true
}

const evaluateAlertRules = async (db, { listing, eventType, oldPrice = null, sourceName = '' }) => {
  const rules = db.prepare('SELECT * FROM external_alert_rules WHERE is_active = 1').all()
  for (const rule of rules) {
    if (!ruleMatchesListing(rule, listing, eventType, { oldPrice })) continue
    const ruleJson = safeJsonParse(rule.rule_json, {})
    const title = `Alert: ${rule.name}`
    const message = eventType === 'price_changed'
      ? `${sourceName}: ${listing.title} (${oldPrice} → ${listing.price})`
      : `${sourceName}: ${listing.title} (${listing.city || '-'})`

    createNotificationForAgency(db, rule.agency_id || 'agency-1', title, message)
    try {
      await sendExternalAlertDelivery({
        channels: ruleJson.channels || ['in_app'],
        title,
        message,
        listing,
        metadata: { ruleId: rule.id, eventType },
      })
    } catch (error) {
      // best effort delivery; never break sync
      console.warn('[external-listings] alert delivery failed', error?.message || error)
    }
  }
}


const adapterFetchMock = async (source) => {
  const config = safeJsonParse(source.config_json, {})
  if (Array.isArray(config.mockFeed)) return config.mockFeed
  const generatedAt = nowIso()
  return [
    {
      sourceListingId: `${source.code}-seed-1`,
      sourceUrl: `${source.base_url}/oferta/${source.code}-seed-1`,
      offerType: 'sale',
      propertyType: 'flat',
      title: `Mieszkanie 2-pok ${source.name}`,
      description: 'Oferta testowa importera.',
      city: 'Warszawa',
      district: 'Mokotów',
      voivodeship: 'mazowieckie',
      price: 799000,
      areaM2: 52,
      rooms: 2,
      images: ['https://via.placeholder.com/640x480'],
      publishedAtSource: generatedAt,
      status: 'active',
    },
    {
      sourceListingId: `${source.code}-seed-plot-1`,
      sourceUrl: `${source.base_url}/oferta/${source.code}-seed-plot-1`,
      offerType: 'sale',
      propertyType: 'plot',
      plotType: 'building',
      title: `Działka budowlana ${source.name}`,
      description: 'Działka testowa importera.',
      city: 'Wrocław',
      district: 'Krzyki',
      voivodeship: 'dolnośląskie',
      price: 420000,
      plotAreaM2: 950,
      images: ['https://via.placeholder.com/640x480'],
      publishedAtSource: generatedAt,
      status: 'active',
    },
  ]
}

const ADAPTERS = {
  otodom: adapterFetchMock,
  olx: adapterFetchMock,
  gratka: adapterFetchMock,
  test_feed: adapterFetchMock,
}

export const runExternalImportJob = async (db, source, opts = {}) => {
  const startedAt = nowIso()
  const jobId = randomUUID()
  const retryCount = Number(opts.retryCount || 0)
  db.prepare(`INSERT INTO import_jobs (id, source_id, started_at, finished_at, status, processed_count, new_count, updated_count, inactive_count, error_log, retry_count, error_reason, error_message, parent_job_id)
    VALUES (@id,@source_id,@started_at,NULL,@status,0,0,0,0,NULL,@retry_count,NULL,NULL,@parent_job_id)`).run({
    id: jobId,
    source_id: source.id,
    started_at: startedAt,
    status: retryCount > 0 ? 'retrying' : 'running',
    retry_count: retryCount,
    parent_job_id: opts.parentJobId || null,
  })

  let processed = 0
  let created = 0
  let updated = 0
  let inactive = 0

  try {
    const sourceConfig = safeJsonParse(source.config_json, {})
    const mode = sourceConfig.mode || 'mock_feed'
    const adapter = mode === 'api' || mode === 'feed'
      ? adapterFetchFeedOrApi
      : mode === 'html_browser'
        ? adapterFetchHtmlBrowser
        : mode === 'html_public'
          ? adapterFetchHtmlPublic
          : (ADAPTERS[source.code] || adapterFetchMock)
    const rawItems = await adapter(source, opts)
    const seenSourceKeys = new Set()
    const allForHeuristic = db.prepare('SELECT * FROM external_listings WHERE status IN (\'new\',\'active\',\'updated\')').all()

    for (const raw of rawItems) {
      if ((!Array.isArray(raw.images) || raw.images.length === 0) && raw.sourceUrl) {
        const detailImage = await fetchPrimaryImageFromDetail(raw.sourceUrl, Number(sourceConfig.timeoutMs || 10000))
        if (detailImage) raw.images = [detailImage]
      }
      const n = normalizeExternalListing(raw, source)
      const completeness = assessImportCompleteness(n)
      if (!n.sourceListingId && !n.sourceUrl) continue
      if (Number(n.price || 0) <= 0) continue
      if (!isLikelyDetailUrl(source.code, n.sourceUrl || '')) continue
      if (!isPolishListing(n)) continue
      processed += 1

      const naturalKey = `${source.id}:${n.sourceListingId || n.sourceUrl}`
      seenSourceKeys.add(naturalKey)
      const now = nowIso()

      const bySource = n.sourceListingId
        ? db.prepare('SELECT * FROM external_listings WHERE source_id = ? AND source_listing_id = ? LIMIT 1').get(source.id, n.sourceListingId)
        : null
      const byUrl = n.sourceUrl
        ? db.prepare('SELECT * FROM external_listings WHERE source_url = ? LIMIT 1').get(n.sourceUrl)
        : null

      let existing = bySource || byUrl
      if (!existing) {
        existing = allForHeuristic.find((row) => likelyDuplicateByHeuristic({
          title: row.title, city: row.city, district: row.district, price: row.price, areaM2: row.area_m2,
        }, n))
      }

      if (!existing) {
        const id = randomUUID()
        db.prepare(`INSERT INTO external_listings (
          id, source_id, source_listing_id, source_url, offer_type, property_type, plot_type, title, description,
          location_text, city, district, voivodeship, price, price_per_m2, area_m2, plot_area_m2, rooms,
          market_type, latitude, longitude, images_json, contact_name, contact_phone, agency_name,
          published_at_source, first_seen_at, last_seen_at, status, hash_signature, raw_payload_json, created_at, updated_at
        ) VALUES (
          @id,@source_id,@source_listing_id,@source_url,@offer_type,@property_type,@plot_type,@title,@description,
          @location_text,@city,@district,@voivodeship,@price,@price_per_m2,@area_m2,@plot_area_m2,@rooms,
          @market_type,@latitude,@longitude,@images_json,@contact_name,@contact_phone,@agency_name,
          @published_at_source,@first_seen_at,@last_seen_at,@status,@hash_signature,@raw_payload_json,@created_at,@updated_at
        )`).run({
          id,
          source_id: source.id,
          source_listing_id: n.sourceListingId || null,
          source_url: n.sourceUrl || null,
          offer_type: n.offerType,
          property_type: n.propertyType,
          plot_type: n.plotType,
          title: n.title,
          description: n.description,
          location_text: n.locationText,
          city: n.city,
          district: n.district,
          voivodeship: n.voivodeship,
          price: n.price,
          price_per_m2: n.pricePerM2,
          area_m2: n.areaM2,
          plot_area_m2: n.plotAreaM2,
          rooms: n.rooms,
          market_type: n.marketType,
          latitude: n.latitude,
          longitude: n.longitude,
          images_json: JSON.stringify(n.imagesJson || []),
          contact_name: n.contactName,
          contact_phone: n.contactPhone,
          agency_name: n.agencyName,
          published_at_source: n.publishedAtSource,
          first_seen_at: now,
          last_seen_at: now,
          status: 'new',
          hash_signature: n.hashSignature,
          raw_payload_json: JSON.stringify({
            ...(n.rawPayloadJson || {}),
            importMeta: {
              isPartial: completeness.isPartial,
              missingFields: completeness.missingFields,
              completenessScore: completeness.completenessScore,
            },
          }),
          created_at: now,
          updated_at: now,
        })
        db.prepare('INSERT INTO external_listing_events (id, listing_id, event_type, old_value_json, new_value_json, created_at) VALUES (?,?,?,?,?,?)')
          .run(randomUUID(), id, 'created', null, JSON.stringify({ source: source.code, title: n.title, price: n.price }), now)
        createNotificationForAgency(db, 'agency-1', 'Nowa oferta zewnętrzna', `${source.name}: ${n.title} (${n.city})`)
        await evaluateAlertRules(db, { listing: { ...n }, eventType: 'created', sourceName: source.name })
        created += 1
      } else {
        const oldHash = existing.hash_signature
        const nextStatus = existing.status === 'inactive' || existing.status === 'archived' ? 'active' : existing.status
        db.prepare(`UPDATE external_listings SET
          source_url = @source_url,
          title = @title,
          description = @description,
          location_text = @location_text,
          city = @city,
          district = @district,
          voivodeship = @voivodeship,
          price = @price,
          price_per_m2 = @price_per_m2,
          area_m2 = @area_m2,
          plot_area_m2 = @plot_area_m2,
          rooms = @rooms,
          market_type = @market_type,
          latitude = @latitude,
          longitude = @longitude,
          images_json = @images_json,
          contact_name = @contact_name,
          contact_phone = @contact_phone,
          agency_name = @agency_name,
          published_at_source = @published_at_source,
          last_seen_at = @last_seen_at,
          status = @status,
          hash_signature = @hash_signature,
          raw_payload_json = @raw_payload_json,
          updated_at = @updated_at
          WHERE id = @id`).run({
          id: existing.id,
          source_url: n.sourceUrl || existing.source_url,
          title: n.title,
          description: n.description,
          location_text: n.locationText,
          city: n.city,
          district: n.district,
          voivodeship: n.voivodeship,
          price: n.price,
          price_per_m2: n.pricePerM2,
          area_m2: n.areaM2,
          plot_area_m2: n.plotAreaM2,
          rooms: n.rooms,
          market_type: n.marketType,
          latitude: n.latitude,
          longitude: n.longitude,
          images_json: JSON.stringify(n.imagesJson || []),
          contact_name: n.contactName,
          contact_phone: n.contactPhone,
          agency_name: n.agencyName,
          published_at_source: n.publishedAtSource,
          last_seen_at: now,
          status: oldHash === n.hashSignature ? nextStatus : 'updated',
          hash_signature: n.hashSignature,
          raw_payload_json: JSON.stringify({
            ...(n.rawPayloadJson || {}),
            importMeta: {
              isPartial: completeness.isPartial,
              missingFields: completeness.missingFields,
              completenessScore: completeness.completenessScore,
            },
          }),
          updated_at: now,
        })
        if (oldHash !== n.hashSignature) {
          db.prepare('INSERT INTO external_listing_events (id, listing_id, event_type, old_value_json, new_value_json, created_at) VALUES (?,?,?,?,?,?)')
            .run(randomUUID(), existing.id, 'updated', JSON.stringify({ hash: oldHash, price: existing.price }), JSON.stringify({ hash: n.hashSignature, price: n.price }), now)
          if (Number(existing.price || 0) !== Number(n.price || 0)) {
            createNotificationForAgency(db, 'agency-1', 'Zmiana ceny oferty zewnętrznej', `${source.name}: ${n.title} (${existing.price} → ${n.price})`)
            await evaluateAlertRules(db, { listing: { ...n }, eventType: 'price_changed', oldPrice: Number(existing.price || 0), sourceName: source.name })
          }
          await evaluateAlertRules(db, { listing: { ...n }, eventType: 'updated', sourceName: source.name })
          updated += 1
        }
      }
    }

    const activeRows = db.prepare('SELECT * FROM external_listings WHERE source_id = ? AND status IN (\'new\',\'active\',\'updated\')').all(source.id)
    for (const row of activeRows) {
      const key = `${row.source_id}:${row.source_listing_id || row.source_url}`
      if (!seenSourceKeys.has(key)) {
        db.prepare('UPDATE external_listings SET status = ?, updated_at = ? WHERE id = ?').run('inactive', nowIso(), row.id)
        db.prepare('INSERT INTO external_listing_events (id, listing_id, event_type, old_value_json, new_value_json, created_at) VALUES (?,?,?,?,?,?)')
          .run(randomUUID(), row.id, 'disappeared', JSON.stringify({ status: row.status }), JSON.stringify({ status: 'inactive' }), nowIso())
        await evaluateAlertRules(db, { listing: mapExternalListing(row), eventType: 'disappeared', sourceName: source.name })
        inactive += 1
      }
    }

    const finishedAt = nowIso()
    const finalStatus = created > 0 && updated === 0 && processed > created ? 'partial' : 'success'
    db.prepare('UPDATE import_jobs SET finished_at=?, status=?, processed_count=?, new_count=?, updated_count=?, inactive_count=?, error_log=?, error_reason=?, error_message=? WHERE id=?')
      .run(finishedAt, finalStatus, processed, created, updated, inactive, null, null, null, jobId)
    db.prepare('UPDATE external_sources SET last_sync_at=?, last_status=?, last_error=? WHERE id=?')
      .run(finishedAt, 'success', null, source.id)

    return { jobId, processed, newCount: created, updatedCount: updated, inactiveCount: inactive }
  } catch (error) {
    const finishedAt = nowIso()
    const msg = error instanceof Error ? error.message.slice(0, 3000) : 'Unknown error'
    const reason = /timeout/i.test(msg)
      ? 'timeout'
      : /http\s*4\d\d|http\s*5\d\d/i.test(msg)
        ? 'source_http_error'
        : /parse|json|html/i.test(msg)
          ? 'processing_error'
          : 'import_failed'
    db.prepare('UPDATE import_jobs SET finished_at=?, status=?, error_log=?, error_reason=?, error_message=? WHERE id=?').run(finishedAt, 'failed', msg, reason, msg, jobId)
    db.prepare('UPDATE external_sources SET last_sync_at=?, last_status=?, last_error=? WHERE id=?').run(finishedAt, 'failed', msg, source.id)
    throw error
  }
}

export const registerExternalListingRoutes = ({ app, db, requireAuth, sendSuccess, corePgPool = null, isPostgresCoreEnabled = false }) => {
  app.get('/api/external-sources', requireAuth, (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM external_sources ORDER BY name ASC').all()
      sendSuccess(req, res, rows.map(mapSource))
    } catch (e) { next(e) }
  })

  app.patch('/api/external-sources/:id', requireAuth, (req, res, next) => {
    try {
      const id = req.params.id
      const existing = db.prepare('SELECT * FROM external_sources WHERE id = ?').get(id)
      if (!existing) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Source not found' }, requestId: req.requestId })
      const patch = req.body || {}
      db.prepare('UPDATE external_sources SET name=?, base_url=?, is_active=?, config_json=?, updated_at=? WHERE id=?').run(
        patch.name ?? existing.name,
        patch.baseUrl ?? existing.base_url,
        patch.isActive == null ? existing.is_active : (patch.isActive ? 1 : 0),
        patch.config ? JSON.stringify(patch.config) : existing.config_json,
        nowIso(),
        id,
      )
      const row = db.prepare('SELECT * FROM external_sources WHERE id = ?').get(id)
      sendSuccess(req, res, mapSource(row))
    } catch (e) { next(e) }
  })


  app.post('/api/external-import/run-async', requireAuth, (req, res, next) => {
    try {
      const { sourceId } = req.body || {}
      setTimeout(async () => {
        try {
          const sources = sourceId
            ? db.prepare('SELECT * FROM external_sources WHERE id = ? AND is_active = 1').all(sourceId)
            : db.prepare('SELECT * FROM external_sources WHERE is_active = 1').all()
          for (const source of sources) {
            await runExternalImportJob(db, source, { manual: true, async: true })
          }
        } catch (error) {
          console.warn('[external-import][run-async] failed', error?.message || error)
        }
      }, 0)
      sendSuccess(req, res, { queued: true })
    } catch (e) { next(e) }
  })

  app.post('/api/external-import/run', requireAuth, async (req, res, next) => {
    try {
      const { sourceId } = req.body || {}
      const sources = sourceId
        ? db.prepare('SELECT * FROM external_sources WHERE id = ? AND is_active = 1').all(sourceId)
        : db.prepare('SELECT * FROM external_sources WHERE is_active = 1').all()
      const results = []
      for (const source of sources) {
        // serial on purpose (rate limits / safer)
        const result = await runExternalImportJob(db, source, { manual: true })
        results.push({ sourceId: source.id, sourceCode: source.code, ...result })
      }
      sendSuccess(req, res, { results, count: results.length })
    } catch (e) { next(e) }
  })

  app.get('/api/external-listings', requireAuth, (req, res, next) => {
    try {
      const q = req.query || {}
      const where = []
      const params = {}
      if (q.sourceId) { where.push('el.source_id = @source_id'); params.source_id = q.sourceId }
      if (q.status) { where.push('el.status = @status'); params.status = q.status }
      if (q.offerType) { where.push('el.offer_type = @offer_type'); params.offer_type = q.offerType }
      if (q.propertyType) { where.push('el.property_type = @property_type'); params.property_type = q.propertyType }
      if (q.city) { where.push('LOWER(el.city) LIKE @city'); params.city = `%${String(q.city).toLowerCase()}%` }
      if (q.voivodeship) { where.push('LOWER(el.voivodeship) LIKE @voivodeship'); params.voivodeship = `%${String(q.voivodeship).toLowerCase()}%` }
      if (q.onlyNew === '1') where.push("el.status = 'new'")
      if (q.onlyActive === '1') where.push("el.status IN ('new','active','updated')")
      if (q.priceMin) { where.push('el.price >= @price_min'); params.price_min = Number(q.priceMin) }
      if (q.priceMax) { where.push('el.price <= @price_max'); params.price_max = Number(q.priceMax) }
      if (q.areaMin) { where.push('el.area_m2 >= @area_min'); params.area_min = Number(q.areaMin) }
      if (q.areaMax) { where.push('el.area_m2 <= @area_max'); params.area_max = Number(q.areaMax) }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db.prepare(`
        SELECT el.*, es.name as source_name, es.code as source_code
        FROM external_listings el
        JOIN external_sources es ON es.id = el.source_id
        ${whereSql}
        ORDER BY el.first_seen_at DESC
        LIMIT 500
      `).all(params)

      const latestPriceChangeStmt = db.prepare(`
        SELECT old_value_json, new_value_json, created_at
        FROM external_listing_events
        WHERE listing_id = ? AND event_type = 'updated'
        ORDER BY created_at DESC
        LIMIT 5
      `)

      const data = rows
        .map((r) => ({ ...mapExternalListing(r), sourceName: r.source_name, sourceCode: r.source_code }))
        .filter((item) => isPolishListing(item))
        .map((item) => {
          const events = latestPriceChangeStmt.all(item.id)
          let previousPrice = null
          for (const ev of events) {
            const oldVal = safeJsonParse(ev.old_value_json, {})
            const newVal = safeJsonParse(ev.new_value_json, {})
            const oldPrice = Number(oldVal?.price || 0)
            const newPrice = Number(newVal?.price || 0)
            if (oldPrice > 0 && newPrice > 0 && oldPrice !== newPrice) {
              previousPrice = oldPrice
              break
            }
          }
          const price = Number(item.price || 0)
          const priceChangePct = previousPrice && price > 0
            ? Number((((price - previousPrice) / previousPrice) * 100).toFixed(2))
            : null

          return {
            ...item,
            previousPrice,
            priceChangePct,
          }
        })
      sendSuccess(req, res, data)
    } catch (e) { next(e) }
  })

  app.get('/api/external-listings/watchlist', requireAuth, (req, res, next) => {
    try {
      const userId = req.auth?.userId
      if (!userId) return sendSuccess(req, res, [])
      const rows = db.prepare('SELECT listing_id FROM external_listing_watchlist WHERE user_id = ? ORDER BY created_at DESC').all(userId)
      sendSuccess(req, res, rows.map((r) => r.listing_id))
    } catch (e) { next(e) }
  })

  app.post('/api/external-listings/:id/watch', requireAuth, (req, res, next) => {
    try {
      const userId = req.auth?.userId
      if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'User token required' }, requestId: req.requestId })
      const id = req.params.id
      db.prepare('INSERT OR IGNORE INTO external_listing_watchlist (id, user_id, listing_id, created_at) VALUES (?,?,?,?)')
        .run(randomUUID(), userId, id, nowIso())
      sendSuccess(req, res, { listingId: id, watched: true })
    } catch (e) { next(e) }
  })

  app.delete('/api/external-listings/:id/watch', requireAuth, (req, res, next) => {
    try {
      const userId = req.auth?.userId
      if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'User token required' }, requestId: req.requestId })
      const id = req.params.id
      db.prepare('DELETE FROM external_listing_watchlist WHERE user_id = ? AND listing_id = ?').run(userId, id)
      sendSuccess(req, res, { listingId: id, watched: false })
    } catch (e) { next(e) }
  })

  app.get('/api/external-listings/compare', requireAuth, (req, res, next) => {
    try {
      const userId = req.auth?.userId
      if (!userId) return sendSuccess(req, res, [])
      const rows = db.prepare('SELECT listing_id FROM external_listing_compare WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all(userId)
      sendSuccess(req, res, rows.map((r) => r.listing_id))
    } catch (e) { next(e) }
  })

  app.post('/api/external-listings/:id/compare', requireAuth, (req, res, next) => {
    try {
      const userId = req.auth?.userId
      if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'User token required' }, requestId: req.requestId })
      const id = req.params.id

      const existing = db.prepare('SELECT listing_id FROM external_listing_compare WHERE user_id = ? ORDER BY created_at DESC').all(userId)
      if (!existing.find((x) => x.listing_id === id) && existing.length >= 3) {
        db.prepare('DELETE FROM external_listing_compare WHERE user_id = ? AND listing_id = ?').run(userId, existing[existing.length - 1].listing_id)
      }

      db.prepare('INSERT OR IGNORE INTO external_listing_compare (id, user_id, listing_id, created_at) VALUES (?,?,?,?)')
        .run(randomUUID(), userId, id, nowIso())

      const rows = db.prepare('SELECT listing_id FROM external_listing_compare WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all(userId)
      sendSuccess(req, res, rows.map((r) => r.listing_id))
    } catch (e) { next(e) }
  })

  app.delete('/api/external-listings/:id/compare', requireAuth, (req, res, next) => {
    try {
      const userId = req.auth?.userId
      if (!userId) return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'User token required' }, requestId: req.requestId })
      const id = req.params.id
      db.prepare('DELETE FROM external_listing_compare WHERE user_id = ? AND listing_id = ?').run(userId, id)
      const rows = db.prepare('SELECT listing_id FROM external_listing_compare WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all(userId)
      sendSuccess(req, res, rows.map((r) => r.listing_id))
    } catch (e) { next(e) }
  })

  app.get('/api/external-import/jobs', requireAuth, (req, res, next) => {
    try {
      const rows = db.prepare(`SELECT ij.*, es.name as source_name, es.code as source_code
        FROM import_jobs ij LEFT JOIN external_sources es ON es.id = ij.source_id
        ORDER BY ij.started_at DESC LIMIT 200`).all()
      sendSuccess(req, res, rows.map(mapImportJob))
    } catch (e) { next(e) }
  })

  app.get('/api/monitoring/stats', requireAuth, (req, res, next) => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const activeListings = db.prepare("SELECT COUNT(1) c FROM external_listings WHERE status IN ('new','active','updated')").get().c
      const activeSources = db.prepare('SELECT COUNT(1) c FROM external_sources WHERE is_active = 1').get().c
      const rows = db.prepare(`SELECT ij.*, es.name as source_name, es.code as source_code
        FROM import_jobs ij
        LEFT JOIN external_sources es ON es.id = ij.source_id
        WHERE ij.started_at >= ?
        ORDER BY ij.started_at DESC`).all(since)
      const mapped = rows.map(mapImportJob)
      const failedJobs = mapped.filter((row) => row.status === 'failed')
      const successfulJobs = mapped.filter((row) => row.status === 'successful')
      const pendingJobs = mapped.filter((row) => row.status === 'pending' || row.status === 'retrying')
      const statusCounts = mapped.reduce((acc, row) => {
        acc[row.status] = Number(acc[row.status] || 0) + 1
        return acc
      }, {})
      const failedJobsBySourceMap = new Map()
      for (const row of failedJobs) {
        const key = `${row.sourceCode || 'unknown'}::${row.sourceName || 'Nieznane źródło'}`
        const current = failedJobsBySourceMap.get(key) || { sourceCode: row.sourceCode || 'unknown', sourceName: row.sourceName || 'Nieznane źródło', count: 0 }
        current.count += 1
        failedJobsBySourceMap.set(key, current)
      }
      const failedJobsBySource = [...failedJobsBySourceMap.values()].sort((a, b) => b.count - a.count || a.sourceName.localeCompare(b.sourceName, 'pl'))
      const supportedStatuses = ['successful', 'failed', 'pending', 'retrying', 'partial', 'warning']
      const sourceHealth = db.prepare('SELECT * FROM external_sources ORDER BY name ASC').all().map(mapSource)
      const unhealthySources = sourceHealth.filter((source) => source.health === 'error' || source.health === 'warning').length
      const partialImportListings = db.prepare(`
        SELECT COUNT(1) as c
        FROM listings
        WHERE (tags_json LIKE '%partial_import%' OR publication_status_json LIKE '%"isPartial":true%')
      `).get().c
      sendSuccess(req, res, {
        activeListings,
        activeSources,
        successfulJobs24h: successfulJobs.length,
        failedJobs24h: failedJobs.length,
        pendingJobs: pendingJobs.length,
        partialImportListings: Number(partialImportListings || 0),
        unhealthySources,
        sourceHealth,
        failedJobsBySource,
        statusCounts,
        supportedStatuses,
        windowHours: 24,
      })
    } catch (e) { next(e) }
  })

  app.get('/api/monitoring/jobs', requireAuth, (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)))
      const offset = (page - 1) * pageSize
      const where = []
      const params = []
      if (req.query.status) {
        const requested = normalizeImportJobStatus(req.query.status)
        const matchingRawStatuses = Object.entries(IMPORT_JOB_STATUS_MAP).filter(([, normalized]) => normalized === requested).map(([raw]) => raw)
        if (matchingRawStatuses.length > 0) {
          where.push(`LOWER(ij.status) IN (${matchingRawStatuses.map(() => '?').join(',')})`)
          params.push(...matchingRawStatuses)
        }
      }
      if (req.query.source) {
        where.push('LOWER(es.code) = ?')
        params.push(String(req.query.source).toLowerCase())
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const totalRow = db.prepare(`SELECT COUNT(1) as c
        FROM import_jobs ij
        LEFT JOIN external_sources es ON es.id = ij.source_id
        ${whereSql}`).get(...params)
      const rows = db.prepare(`SELECT ij.*, es.name as source_name, es.code as source_code
        FROM import_jobs ij
        LEFT JOIN external_sources es ON es.id = ij.source_id
        ${whereSql}
        ORDER BY COALESCE(ij.finished_at, ij.started_at) DESC
        LIMIT ? OFFSET ?`).all(...params, pageSize, offset)
      const items = rows.map((row) => ({
        ...mapImportJob(row),
        details: {
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          processedCount: row.processed_count,
          newCount: row.new_count,
          updatedCount: row.updated_count,
          inactiveCount: row.inactive_count,
          errorLog: row.error_log,
        },
      }))
      sendSuccess(req, res, {
        items,
        total: Number(totalRow?.c || 0),
        page,
        pageSize,
        hasMore: offset + items.length < Number(totalRow?.c || 0),
        supportedStatuses: ['successful', 'failed', 'pending', 'retrying', 'partial', 'warning'],
      })
    } catch (e) { next(e) }
  })

  app.get('/api/monitoring/sources-summary', requireAuth, (req, res, next) => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const sources = db.prepare('SELECT * FROM external_sources ORDER BY name ASC').all().map(mapSource)
      const jobs24h = db.prepare(`SELECT ij.*, es.name as source_name, es.code as source_code
        FROM import_jobs ij
        LEFT JOIN external_sources es ON es.id = ij.source_id
        WHERE ij.started_at >= ?
        ORDER BY ij.started_at DESC`).all(since)
      const listingsRows = db.prepare(`SELECT source_id,
        COUNT(1) as total,
        SUM(CASE WHEN status IN ('new','active','updated') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN raw_payload_json LIKE '%"isPartial":true%' THEN 1 ELSE 0 END) as partial
        FROM external_listings
        GROUP BY source_id`).all()
      const listingsMap = new Map(listingsRows.map((row) => [row.source_id, row]))
      const jobsBySource = new Map()
      for (const job of jobs24h) {
        if (!job.source_id) continue
        if (!jobsBySource.has(job.source_id)) jobsBySource.set(job.source_id, [])
        jobsBySource.get(job.source_id).push(job)
      }
      const items = sources.map((source) => {
        const sourceJobs = (jobsBySource.get(source.id) || []).map(mapImportJob)
        const normalized = sourceJobs.map((job) => job.status)
        const listingStats = listingsMap.get(source.id) || {}
        const failed = normalized.filter((status) => status === 'failed').length
        const successful = normalized.filter((status) => status === 'successful').length
        const totalDone = failed + successful
        const successRate24h = totalDone > 0 ? Math.round((successful / totalDone) * 100) : null
        return {
          source,
          stats24h: {
            successful,
            failed,
            pending: normalized.filter((status) => status === 'pending').length,
            retrying: normalized.filter((status) => status === 'retrying').length,
            partial: normalized.filter((status) => status === 'partial').length,
            warning: normalized.filter((status) => status === 'warning').length,
            successRate24h,
          },
          listings: {
            total: Number(listingStats.total || 0),
            active: Number(listingStats.active || 0),
            partial: Number(listingStats.partial || 0),
          },
          latestJob: sourceJobs[0] || null,
        }
      })
      sendSuccess(req, res, { items })
    } catch (e) { next(e) }
  })

  app.get('/api/monitoring/sources/:id', requireAuth, (req, res, next) => {
    try {
      const source = db.prepare('SELECT * FROM external_sources WHERE id = ? LIMIT 1').get(req.params.id)
      if (!source) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Source not found' }, requestId: req.requestId })
      const mappedSource = mapSource(source)
      const recentJobs = db.prepare(`SELECT ij.*, es.name as source_name, es.code as source_code
        FROM import_jobs ij
        LEFT JOIN external_sources es ON es.id = ij.source_id
        WHERE ij.source_id = ?
        ORDER BY COALESCE(ij.finished_at, ij.started_at) DESC
        LIMIT 10`).all(source.id).map(mapImportJob)
      const stats24hRows = db.prepare(`SELECT * FROM import_jobs WHERE source_id = ? AND started_at >= ? ORDER BY started_at DESC`).all(source.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      const normalized24h = stats24hRows.map((row) => normalizeImportJobStatus(row.status))
      const listingsStats = db.prepare(`SELECT
        COUNT(1) as total,
        SUM(CASE WHEN status IN ('new','active','updated') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN raw_payload_json LIKE '%"isPartial":true%' THEN 1 ELSE 0 END) as partial
        FROM external_listings
        WHERE source_id = ?`).get(source.id)
      sendSuccess(req, res, {
        source: mappedSource,
        stats24h: {
          successful: normalized24h.filter((status) => status === 'successful').length,
          failed: normalized24h.filter((status) => status === 'failed').length,
          pending: normalized24h.filter((status) => status === 'pending').length,
          retrying: normalized24h.filter((status) => status === 'retrying').length,
          partial: normalized24h.filter((status) => status === 'partial').length,
          warning: normalized24h.filter((status) => status === 'warning').length,
        },
        listings: {
          total: Number(listingsStats?.total || 0),
          active: Number(listingsStats?.active || 0),
          partial: Number(listingsStats?.partial || 0),
        },
        recentJobs,
      })
    } catch (e) { next(e) }
  })

  app.post('/api/monitoring/jobs/:id/retry', requireAuth, async (req, res, next) => {
    try {
      const jobId = req.params.id
      const existing = db.prepare('SELECT * FROM import_jobs WHERE id = ? LIMIT 1').get(jobId)
      if (!existing) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' }, requestId: req.requestId })
      const source = existing.source_id ? db.prepare('SELECT * FROM external_sources WHERE id = ? LIMIT 1').get(existing.source_id) : null
      if (!source) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Source not found for job' }, requestId: req.requestId })
      const result = await runExternalImportJob(db, source, { manual: true, retryCount: Number(existing.retry_count || 0) + 1, parentJobId: existing.id })
      sendSuccess(req, res, { retried: true, sourceId: source.id, previousJobId: existing.id, ...result })
    } catch (e) { next(e) }
  })


  app.get('/api/external-alert-rules', requireAuth, (req, res, next) => {
    try {
      const agencyId = req.auth?.agencyId || 'agency-1'
      const rows = db.prepare('SELECT * FROM external_alert_rules WHERE agency_id = ? ORDER BY created_at DESC').all(agencyId)
      sendSuccess(req, res, rows.map((r) => ({
        id: r.id,
        agencyId: r.agency_id,
        name: r.name,
        rule: safeJsonParse(r.rule_json, {}),
        isActive: r.is_active === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })))
    } catch (e) { next(e) }
  })

  app.post('/api/external-alert-rules', requireAuth, (req, res, next) => {
    try {
      const agencyId = req.auth?.agencyId || 'agency-1'
      const body = req.body || {}
      const id = randomUUID()
      const now = nowIso()
      db.prepare('INSERT INTO external_alert_rules (id, agency_id, name, rule_json, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, agencyId, body.name || 'Nowa reguła', JSON.stringify(body.rule || {}), body.isActive === false ? 0 : 1, now, now)
      const row = db.prepare('SELECT * FROM external_alert_rules WHERE id = ?').get(id)
      sendSuccess(req, res, {
        id: row.id,
        agencyId: row.agency_id,
        name: row.name,
        rule: safeJsonParse(row.rule_json, {}),
        isActive: row.is_active === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }, 201)
    } catch (e) { next(e) }
  })

  app.patch('/api/external-alert-rules/:id', requireAuth, (req, res, next) => {
    try {
      const id = req.params.id
      const existing = db.prepare('SELECT * FROM external_alert_rules WHERE id = ?').get(id)
      if (!existing) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Rule not found' }, requestId: req.requestId })
      const body = req.body || {}
      db.prepare('UPDATE external_alert_rules SET name=?, rule_json=?, is_active=?, updated_at=? WHERE id=?').run(
        body.name ?? existing.name,
        body.rule ? JSON.stringify(body.rule) : existing.rule_json,
        body.isActive == null ? existing.is_active : (body.isActive ? 1 : 0),
        nowIso(),
        id,
      )
      const row = db.prepare('SELECT * FROM external_alert_rules WHERE id = ?').get(id)
      sendSuccess(req, res, {
        id: row.id,
        agencyId: row.agency_id,
        name: row.name,
        rule: safeJsonParse(row.rule_json, {}),
        isActive: row.is_active === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    } catch (e) { next(e) }
  })

  app.delete('/api/external-alert-rules/:id', requireAuth, (req, res, next) => {
    try {
      const id = req.params.id
      db.prepare('DELETE FROM external_alert_rules WHERE id = ?').run(id)
      sendSuccess(req, res, { id, deleted: true })
    } catch (e) { next(e) }
  })

  app.post('/api/external-listings/:id/ingest', requireAuth, async (req, res, next) => {
    try {
      const id = req.params.id
      const listing = db.prepare('SELECT * FROM external_listings WHERE id = ? LIMIT 1').get(id)
      if (!listing) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'External listing not found' }, requestId: req.requestId })

      const now = nowIso()
      const propertyId = randomUUID()
      const listingId = randomUUID()
      const agencyId = req.auth?.agencyId || 'agency-1'
      const currentYear = new Date().getFullYear()
      const seq = String(Date.now()).slice(-6)
      const listingNumber = `EXT/${currentYear}/${seq}`

      const address = {
        street: listing.location_text || String(listing.title || 'Oferta').slice(0, 50),
        buildingNumber: '',
        city: listing.city || '',
        zipCode: '',
        district: listing.district || '',
        voivodeship: listing.voivodeship || '',
        country: 'Poland',
      }

      const propertyTypeMap = { flat: 'apartment', house: 'house', plot: 'plot', commercial: 'commercial' }
      const propertyPayload = {
        id: propertyId,
        agencyId,
        addressJson: JSON.stringify(address),
        propertyType: propertyTypeMap[listing.property_type] || 'apartment',
        marketType: listing.market_type || 'secondary',
        area: Number(listing.area_m2 || 0),
        plotArea: Number(listing.plot_area_m2 || 0) || null,
        rooms: Number(listing.rooms || 0) || null,
        floorsJson: JSON.stringify({}),
        yearBuilt: null,
        buildingType: null,
        conditionText: null,
        price: Number(listing.price || 0),
        pricePerMeter: Number(listing.price_per_m2 || 0) || null,
        ownershipStatus: null,
        description: listing.description || '',
        featuresJson: JSON.stringify({}),
        mediaJson: listing.images_json || JSON.stringify([]),
        coordinatesJson: (listing.latitude != null && listing.longitude != null) ? JSON.stringify({ lat: listing.latitude, lng: listing.longitude }) : null,
        createdAt: now,
        updatedAt: now,
      }

      const importedStatus = ['active', 'new', 'updated'].includes(String(listing.status || '').toLowerCase()) ? 'active' : 'draft'
      const externalPayload = safeJsonParse(listing.raw_payload_json, {})
      const importMeta = externalPayload.importMeta || {}
      const partialMissingFields = Array.isArray(importMeta.missingFields) ? importMeta.missingFields : []
      const importTags = ['external_import']
      if (importMeta.isPartial) importTags.push('partial_import')
      const importNoteSuffix = importMeta.isPartial && partialMissingFields.length > 0
        ? ` | Partial import: missing ${partialMissingFields.join(', ')}`
        : ''
      const listingPayload = {
        id: listingId,
        propertyId,
        agencyId,
        assignedAgentId: null,
        clientId: null,
        listingNumber,
        status: importedStatus,
        source: 'other',
        sourceUrl: listing.source_url,
        price: Number(listing.price || 0),
        priceOriginal: null,
        priceHistoryJson: JSON.stringify([{ price: Number(listing.price || 0), currency: 'PLN', changedAt: now }]),
        publishedAt: now,
        reservedAt: null,
        soldAt: null,
        views: 0,
        inquiries: 0,
        publicationStatusJson: JSON.stringify({
          importedExternalListingId: id,
          importMeta: {
            isPartial: Boolean(importMeta.isPartial),
            missingFields: partialMissingFields,
            completenessScore: Number(importMeta.completenessScore || 0),
          },
        }),
        notes: `Imported from external listing module${importNoteSuffix}`,
        tagsJson: JSON.stringify(importTags),
        createdAt: now,
        updatedAt: now,
      }

      if (isPostgresCoreEnabled && corePgPool) {
        const client = await corePgPool.connect()
        try {
          await client.query('BEGIN')

          await client.query(
            `INSERT INTO properties (
              id, agency_id, address_json, property_type, market_type, area, plot_area, rooms, floors_json, year_built, building_type,
              condition_text, price, price_per_meter, ownership_status, description, features_json, media_json, coordinates_json, created_at, updated_at
            ) VALUES (
              $1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,
              $12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19::jsonb,$20,$21
            )`,
            [
              propertyPayload.id,
              propertyPayload.agencyId,
              propertyPayload.addressJson,
              propertyPayload.propertyType,
              propertyPayload.marketType,
              propertyPayload.area,
              propertyPayload.plotArea,
              propertyPayload.rooms,
              propertyPayload.floorsJson,
              propertyPayload.yearBuilt,
              propertyPayload.buildingType,
              propertyPayload.conditionText,
              propertyPayload.price,
              propertyPayload.pricePerMeter,
              propertyPayload.ownershipStatus,
              propertyPayload.description,
              propertyPayload.featuresJson,
              propertyPayload.mediaJson,
              propertyPayload.coordinatesJson,
              propertyPayload.createdAt,
              propertyPayload.updatedAt,
            ],
          )

          await client.query(
            `INSERT INTO listings (
              id, property_id, agency_id, assigned_agent_id, client_id, listing_number, status, source, source_url, price, price_original,
              price_history_json, published_at, reserved_at, sold_at, views, inquiries, publication_status_json, notes, tags_json, created_at, updated_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
              $12::jsonb,$13,$14,$15,$16,$17,$18::jsonb,$19,$20::jsonb,$21,$22
            )`,
            [
              listingPayload.id,
              listingPayload.propertyId,
              listingPayload.agencyId,
              listingPayload.assignedAgentId,
              listingPayload.clientId,
              listingPayload.listingNumber,
              listingPayload.status,
              listingPayload.source,
              listingPayload.sourceUrl,
              listingPayload.price,
              listingPayload.priceOriginal,
              listingPayload.priceHistoryJson,
              listingPayload.publishedAt,
              listingPayload.reservedAt,
              listingPayload.soldAt,
              listingPayload.views,
              listingPayload.inquiries,
              listingPayload.publicationStatusJson,
              listingPayload.notes,
              listingPayload.tagsJson,
              listingPayload.createdAt,
              listingPayload.updatedAt,
            ],
          )

          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      } else {
        db.prepare(`INSERT INTO properties (
          id, agency_id, address_json, property_type, market_type, area, plot_area, rooms, floors_json, year_built, building_type,
          condition_text, price, price_per_meter, ownership_status, description, features_json, media_json, coordinates_json,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          propertyPayload.id,
          propertyPayload.agencyId,
          propertyPayload.addressJson,
          propertyPayload.propertyType,
          propertyPayload.marketType,
          propertyPayload.area,
          propertyPayload.plotArea,
          propertyPayload.rooms,
          propertyPayload.floorsJson,
          propertyPayload.yearBuilt,
          propertyPayload.buildingType,
          propertyPayload.conditionText,
          propertyPayload.price,
          propertyPayload.pricePerMeter,
          propertyPayload.ownershipStatus,
          propertyPayload.description,
          propertyPayload.featuresJson,
          propertyPayload.mediaJson,
          propertyPayload.coordinatesJson,
          propertyPayload.createdAt,
          propertyPayload.updatedAt,
        )

        db.prepare(`INSERT INTO listings (
          id, property_id, agency_id, assigned_agent_id, client_id, listing_number, status, source, source_url, price, price_original,
          price_history_json, published_at, reserved_at, sold_at, views, inquiries, publication_status_json, notes, tags_json, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          listingPayload.id,
          listingPayload.propertyId,
          listingPayload.agencyId,
          listingPayload.assignedAgentId,
          listingPayload.clientId,
          listingPayload.listingNumber,
          listingPayload.status,
          listingPayload.source,
          listingPayload.sourceUrl,
          listingPayload.price,
          listingPayload.priceOriginal,
          listingPayload.priceHistoryJson,
          listingPayload.publishedAt,
          listingPayload.reservedAt,
          listingPayload.soldAt,
          listingPayload.views,
          listingPayload.inquiries,
          listingPayload.publicationStatusJson,
          listingPayload.notes,
          listingPayload.tagsJson,
          listingPayload.createdAt,
          listingPayload.updatedAt,
        )
      }

      db.prepare('UPDATE external_listings SET status = ?, updated_at = ? WHERE id = ?').run('archived', now, id)
      db.prepare('INSERT INTO external_listing_events (id, listing_id, event_type, old_value_json, new_value_json, created_at) VALUES (?,?,?,?,?,?)')
        .run(randomUUID(), id, 'status_changed', JSON.stringify({ status: listing.status }), JSON.stringify({ status: 'archived', internalListingId: listingId }), now)

      sendSuccess(req, res, { propertyId, listingId, listingNumber, externalListingId: id })
    } catch (e) { next(e) }
  })

  app.get('/api/external-module/health', requireAuth, (req, res, next) => {
    try {
      const activeSources = db.prepare('SELECT COUNT(1) c FROM external_sources WHERE is_active = 1').get().c
      const activeListings = db.prepare("SELECT COUNT(1) c FROM external_listings WHERE status IN ('new','active','updated')").get().c
      const newestJob = db.prepare('SELECT * FROM import_jobs ORDER BY started_at DESC LIMIT 1').get()
      sendSuccess(req, res, {
        ok: true,
        activeSources,
        activeListings,
        latestJob: newestJob ? {
          id: newestJob.id,
          status: newestJob.status,
          startedAt: newestJob.started_at,
          finishedAt: newestJob.finished_at,
          errorLog: newestJob.error_log,
        } : null,
      })
    } catch (e) { next(e) }
  })
}

let schedulerStarted = false
export const startExternalListingsScheduler = ({ db, intervalMs = 30 * 60 * 1000 }) => {
  if (schedulerStarted) return
  schedulerStarted = true
  const run = async () => {
    const sources = db.prepare('SELECT * FROM external_sources WHERE is_active = 1').all()
    for (const source of sources) {
      try {
        await runExternalImportJob(db, source, { scheduler: true })
      } catch (error) {
        // keep scheduler alive even when one source fails
        console.error('[external-listings] sync failed for source', source.code, error?.message || error)
      }
    }
  }
  setTimeout(() => { void run() }, 5000)
  setInterval(() => { void run() }, intervalMs)
}
