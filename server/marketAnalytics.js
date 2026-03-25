import { randomUUID } from 'node:crypto'

const POLISH_VOIVODESHIPS = new Set([
  'dolnośląskie','kujawsko-pomorskie','lubelskie','lubuskie','łódzkie','małopolskie','mazowieckie','opolskie',
  'podkarpackie','podlaskie','pomorskie','śląskie','świętokrzyskie','warmińsko-mazurskie','wielkopolskie','zachodniopomorskie',
  'dolnoslaskie','lodzkie','slaskie','swietokrzyskie','warminsko-mazurskie',
])

const FOREIGN_MARKERS = [
  'hiszpania','cypr','portugalia','wlochy','włochy','grecja','niemcy','francja','turcja','chorwacja','albania',
  'spain','italy','greece','germany','france','turkey','croatia','albania','czechy','czech republic','slovakia',
]

const normalize = (v) => String(v || '').trim().toLowerCase()

const isInPolandBounds = (lat, lng) => {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false
  const la = Number(lat)
  const lo = Number(lng)
  return la >= 49.0 && la <= 55.0 && lo >= 14.0 && lo <= 24.5
}

const isPolishListing = (row) => {
  const text = [row.title, row.location_text, row.city, row.district, row.voivodeship].map(normalize).join(' | ')
  if (FOREIGN_MARKERS.some((m) => text.includes(m))) return false

  const voivodeship = normalize(row.voivodeship)
  if (voivodeship && POLISH_VOIVODESHIPS.has(voivodeship)) return true

  if (isInPolandBounds(row.latitude, row.longitude)) return true

  if (text.includes('polska')) return true

  return false
}

const median = (arr) => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const toPricePerM2 = (row) => {
  const price = Number(row.price || 0)
  const area = Number(row.area_m2 || 0)
  if (!price || !area) return 0
  return price / area
}

const getComparableSet = (all, target) => {
  const area = Number(target.area_m2 || 0)
  const minArea = area * 0.85
  const maxArea = area * 1.15
  return all.filter((x) => {
    if (x.id === target.id) return false
    if (normalize(x.city) !== normalize(target.city)) return false
    if (normalize(x.property_type) !== normalize(target.property_type)) return false
    if (target.market_type && x.market_type && normalize(x.market_type) !== normalize(target.market_type)) return false
    const a = Number(x.area_m2 || 0)
    if (!a) return false
    return a >= minArea && a <= maxArea
  })
}

export const computeOpportunities = (rows) => {
  const valid = rows.filter((r) => Number(r.price || 0) > 0 && Number(r.area_m2 || 0) > 0)

  return valid.map((row) => {
    const ppm2 = toPricePerM2(row)
    const comparable = getComparableSet(valid, row)
    const comparablePpm2 = comparable.map(toPricePerM2).filter((v) => v > 0)
    const localMedian = median(comparablePpm2)
    const belowMedianPct = localMedian > 0 ? ((localMedian - ppm2) / localMedian) * 100 : 0

    const level = belowMedianPct >= 15 ? 'strong_opportunity' : belowMedianPct >= 10 ? 'opportunity' : 'normal'

    return {
      id: row.id,
      title: row.title,
      city: row.city,
      district: row.district,
      source: row.source_code || row.source_id,
      created_at: row.first_seen_at,
      price: Number(row.price || 0),
      area_m2: Number(row.area_m2 || 0),
      price_per_m2: Number(ppm2.toFixed(2)),
      market_median_price_per_m2: Number(localMedian.toFixed(2)),
      below_median_pct: Number(belowMedianPct.toFixed(2)),
      is_opportunity: level !== 'normal',
      opportunity_level: level,
      opportunity_score: Number(Math.max(0, belowMedianPct).toFixed(2)),
    }
  })
}

const buildAlerts = (rows, opportunities) => {
  const now = Date.now()
  const last24h = rows.filter((r) => now - new Date(r.first_seen_at).getTime() <= 24 * 60 * 60 * 1000)

  const alerts = []

  const byCity = new Map()
  for (const r of last24h) {
    const city = normalize(r.city) || 'nieznane miasto'
    byCity.set(city, (byCity.get(city) || 0) + 1)
  }
  for (const [city, count] of byCity.entries()) {
    if (count >= 8) alerts.push({
      alert_type: 'new_offers_spike',
      city,
      title: `Wzrost liczby ofert: ${city}`,
      description: `${count} nowych ofert w 24h`,
      severity: count >= 15 ? 'high' : 'medium',
      created_at: new Date().toISOString(),
      metadata: { count24h: count },
    })
  }

  const strongOpp = opportunities.filter((o) => o.opportunity_level === 'strong_opportunity')
  if (strongOpp.length > 0) {
    alerts.push({
      alert_type: 'new_opportunity',
      city: strongOpp[0].city,
      title: 'Nowe mocne okazje inwestycyjne',
      description: `Wykryto ${strongOpp.length} mocnych okazji`,
      severity: 'high',
      created_at: new Date().toISOString(),
      metadata: { count: strongOpp.length },
    })
  }

  const bySource = new Map()
  for (const r of last24h) {
    const source = normalize(r.source_code || r.source_id) || 'inne'
    bySource.set(source, (bySource.get(source) || 0) + 1)
  }
  for (const [source, count] of bySource.entries()) {
    if (count >= 10) alerts.push({
      alert_type: 'source_activity_spike',
      city: null,
      title: `Wysoka aktywność źródła: ${source}`,
      description: `${count} nowych ofert ze źródła`,
      severity: 'medium',
      created_at: new Date().toISOString(),
      metadata: { source, count24h: count },
    })
  }

  return alerts.slice(0, 20)
}

const buildHeatmap = (rows, opportunities) => {
  const grouped = new Map()
  for (const r of rows) {
    const city = normalize(r.city)
    if (!city) continue
    if (!grouped.has(city)) grouped.set(city, [])
    grouped.get(city).push(r)
  }

  return [...grouped.entries()].map(([city, list]) => {
    const prices = list.map(toPricePerM2).filter((v) => v > 0)
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
    const med = median(prices)
    const latVals = list.map((x) => Number(x.latitude)).filter(Number.isFinite)
    const lngVals = list.map((x) => Number(x.longitude)).filter(Number.isFinite)
    const oppCount = opportunities.filter((o) => normalize(o.city) === city && o.is_opportunity).length

    return {
      city,
      lat: latVals.length ? latVals.reduce((a, b) => a + b, 0) / latVals.length : null,
      lng: lngVals.length ? lngVals.reduce((a, b) => a + b, 0) / lngVals.length : null,
      avg_price_per_m2: Number(avg.toFixed(2)),
      median_price_per_m2: Number(med.toFixed(2)),
      offers_count: list.length,
      opportunities_count: oppCount,
    }
  }).sort((a, b) => b.offers_count - a.offers_count)
}

const syncAlertsToDb = (db, alerts) => {
  const now = new Date().toISOString()
  const cutoffTs = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

  const findRecent = db.prepare(`
    SELECT id FROM market_alerts
    WHERE alert_type = ?
      AND COALESCE(city, '') = COALESCE(?, '')
      AND title = ?
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `)

  const insertStmt = db.prepare(`
    INSERT INTO market_alerts (id, alert_type, city, title, description, severity, metadata_json, created_at, is_read)
    VALUES (@id, @alert_type, @city, @title, @description, @severity, @metadata_json, @created_at, 0)
  `)

  for (const alert of alerts) {
    const exists = findRecent.get(alert.alert_type, alert.city || null, alert.title, cutoffTs)
    if (exists) continue
    insertStmt.run({
      id: randomUUID(),
      alert_type: alert.alert_type,
      city: alert.city || null,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      metadata_json: JSON.stringify(alert.metadata || {}),
      created_at: now,
    })
  }
}

const getRowsForAnalytics = (db, limit = 1200) => db.prepare(`
  SELECT el.*, es.code as source_code
  FROM external_listings el
  LEFT JOIN external_sources es ON es.id = el.source_id
  WHERE el.status IN ('new','active','updated')
  ORDER BY el.first_seen_at DESC
  LIMIT ?
`).all(limit).filter(isPolishListing)

export const registerMarketAnalyticsRoutes = ({ app, db, requireAuth, sendSuccess }) => {
  app.get('/api/market-analytics/opportunities', requireAuth, (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit || 5), 20)
      const rows = getRowsForAnalytics(db, 1200)

      const opportunities = computeOpportunities(rows)
        .filter((o) => o.is_opportunity)
        .sort((a, b) => b.opportunity_score - a.opportunity_score)
        .slice(0, limit)

      sendSuccess(req, res, opportunities)
    } catch (e) { next(e) }
  })

  app.get('/api/market-analytics/alerts', requireAuth, (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit || 5), 50)
      const rows = getRowsForAnalytics(db, 1200)
      const opportunities = computeOpportunities(rows)
      const generated = buildAlerts(rows, opportunities)
      syncAlertsToDb(db, generated)

      const persisted = db.prepare(`
        SELECT id, alert_type, city, title, description, severity, metadata_json, created_at, is_read
        FROM market_alerts
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit).map((r) => ({
        id: r.id,
        alert_type: r.alert_type,
        city: r.city,
        title: r.title,
        description: r.description,
        severity: r.severity,
        metadata: (() => { try { return JSON.parse(r.metadata_json || '{}') } catch { return {} } })(),
        created_at: r.created_at,
        is_read: r.is_read === 1,
      }))

      sendSuccess(req, res, persisted)
    } catch (e) { next(e) }
  })

  app.post('/api/market-analytics/alerts/:id/read', requireAuth, (req, res, next) => {
    try {
      const id = String(req.params.id || '')
      const result = db.prepare('UPDATE market_alerts SET is_read = 1 WHERE id = ?').run(id)
      sendSuccess(req, res, { id, updated: result.changes > 0 })
    } catch (e) { next(e) }
  })

  app.post('/api/market-analytics/alerts/read-all', requireAuth, (req, res, next) => {
    try {
      const result = db.prepare('UPDATE market_alerts SET is_read = 1 WHERE is_read = 0').run()
      sendSuccess(req, res, { updated: result.changes })
    } catch (e) { next(e) }
  })

  app.get('/api/market-analytics/heatmap', requireAuth, (req, res, next) => {
    try {
      const rows = db.prepare(`
        SELECT el.*, es.code as source_code
        FROM external_listings el
        LEFT JOIN external_sources es ON es.id = el.source_id
        WHERE el.status IN ('new','active','updated')
        ORDER BY el.first_seen_at DESC
        LIMIT 3000
      `).all().filter(isPolishListing)

      const opportunities = computeOpportunities(rows)
      const data = buildHeatmap(rows, opportunities)
      sendSuccess(req, res, data)
    } catch (e) { next(e) }
  })
}
