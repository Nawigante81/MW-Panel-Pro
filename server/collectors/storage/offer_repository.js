import { db } from '../../db.js';
import { randomUUID } from 'node:crypto';

const nowIso = () => new Date().toISOString();


const softDuplicateCandidate = (a, b) => {
  const titleA = (a.title || '').toLowerCase().replace(/\s+/g, ' ');
  const titleB = (b.title || '').toLowerCase().replace(/\s+/g, ' ');
  const titleClose = titleA && titleB && (titleA.includes(titleB.slice(0, 12)) || titleB.includes(titleA.slice(0, 12)));
  const priceDelta = Math.abs((a.price || 0) - (b.price || 0));
  const areaDelta = Math.abs((a.area_m2 || 0) - (b.area_m2 || 0));
  const sameCity = (a.city || '').toLowerCase() === (b.city || '').toLowerCase();
  return sameCity && titleClose && priceDelta <= 25000 && areaDelta <= 8;
};


const pickChangedFields = (current, next) => {
  const fields = [
    'title','description','price','currency','area_m2','rooms','market_type','offer_type','property_type',
    'country','region','city','district','street','latitude','longitude','images_json','contact_name',
    'contact_phone','agency_name','published_at','fingerprint','source_url'
  ];
  const changed = [];
  for (const field of fields) {
    if ((current[field] ?? null) !== (next[field] ?? null)) {
      changed.push(field);
    }
  }
  return changed;
};

export const upsertOffer = (offer) => {
  const now = nowIso();
  const imagesJson = JSON.stringify(offer.images || []);
  const rawPayloadJson = offer.raw_payload ? JSON.stringify(offer.raw_payload) : null;

  let existing = null;
  if (offer.external_id) {
    existing = db.prepare('SELECT * FROM property_offers WHERE source = ? AND external_id = ? LIMIT 1')
      .get(offer.source, offer.external_id);
  }
  if (!existing && offer.fingerprint) {
    existing = db.prepare('SELECT * FROM property_offers WHERE fingerprint = ? LIMIT 1')
      .get(offer.fingerprint);
  }
  if (!existing) {
    const candidates = db.prepare(`SELECT * FROM property_offers WHERE LOWER(city) = LOWER(@city) AND price BETWEEN @minPrice AND @maxPrice AND area_m2 BETWEEN @minArea AND @maxArea LIMIT 50`).all({
      city: offer.city || '',
      minPrice: Number(offer.price || 0) - 25000,
      maxPrice: Number(offer.price || 0) + 25000,
      minArea: Number(offer.area_m2 || 0) - 8,
      maxArea: Number(offer.area_m2 || 0) + 8,
    });
    for (const row of candidates) {
      if (softDuplicateCandidate(row, { ...offer, city: offer.city })) {
        existing = row;
        break;
      }
    }
  }

  if (!existing) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO property_offers (
        id, source, external_id, source_url, title, description, price, currency, area_m2, rooms,
        market_type, offer_type, property_type, country, region, city, district, street, latitude, longitude,
        images_json, contact_name, contact_phone, agency_name, published_at, scraped_at, fingerprint,
        raw_payload_json, is_active, last_seen_at, created_at, updated_at
      ) VALUES (
        @id, @source, @external_id, @source_url, @title, @description, @price, @currency, @area_m2, @rooms,
        @market_type, @offer_type, @property_type, @country, @region, @city, @district, @street, @latitude, @longitude,
        @images_json, @contact_name, @contact_phone, @agency_name, @published_at, @scraped_at, @fingerprint,
        @raw_payload_json, @is_active, @last_seen_at, @created_at, @updated_at
      )
    `).run({
      id,
      source: offer.source,
      external_id: offer.external_id || null,
      source_url: offer.source_url || null,
      title: offer.title,
      description: offer.description || null,
      price: offer.price ?? null,
      currency: offer.currency || null,
      area_m2: offer.area_m2 ?? null,
      rooms: offer.rooms ?? null,
      market_type: offer.market_type || null,
      offer_type: offer.offer_type || null,
      property_type: offer.property_type || null,
      country: offer.country || null,
      region: offer.region || null,
      city: offer.city || null,
      district: offer.district || null,
      street: offer.street || null,
      latitude: offer.latitude ?? null,
      longitude: offer.longitude ?? null,
      images_json: imagesJson,
      contact_name: offer.contact_name || null,
      contact_phone: offer.contact_phone || null,
      agency_name: offer.agency_name || null,
      published_at: offer.published_at || null,
      scraped_at: offer.scraped_at || now,
      fingerprint: offer.fingerprint || null,
      raw_payload_json: rawPayloadJson,
      is_active: 1,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    });
    return { status: 'created', id };
  }

  const next = {
    ...existing,
    source_url: offer.source_url || existing.source_url,
    title: offer.title,
    description: offer.description || existing.description,
    price: offer.price ?? existing.price,
    currency: offer.currency || existing.currency,
    area_m2: offer.area_m2 ?? existing.area_m2,
    rooms: offer.rooms ?? existing.rooms,
    market_type: offer.market_type || existing.market_type,
    offer_type: offer.offer_type || existing.offer_type,
    property_type: offer.property_type || existing.property_type,
    country: offer.country || existing.country,
    region: offer.region || existing.region,
    city: offer.city || existing.city,
    district: offer.district || existing.district,
    street: offer.street || existing.street,
    latitude: offer.latitude ?? existing.latitude,
    longitude: offer.longitude ?? existing.longitude,
    images_json: imagesJson,
    contact_name: offer.contact_name || existing.contact_name,
    contact_phone: offer.contact_phone || existing.contact_phone,
    agency_name: offer.agency_name || existing.agency_name,
    published_at: offer.published_at || existing.published_at,
    scraped_at: offer.scraped_at || now,
    fingerprint: offer.fingerprint || existing.fingerprint,
    raw_payload_json: rawPayloadJson || existing.raw_payload_json,
    last_seen_at: now,
    is_active: 1,
  };

  const changedFields = pickChangedFields(existing, next);
  if (changedFields.length === 0) {
    db.prepare('UPDATE property_offers SET last_seen_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, existing.id);
    return { status: 'unchanged', id: existing.id };
  }

  db.prepare(`
    UPDATE property_offers
    SET
      source_url = @source_url,
      title = @title,
      description = @description,
      price = @price,
      currency = @currency,
      area_m2 = @area_m2,
      rooms = @rooms,
      market_type = @market_type,
      offer_type = @offer_type,
      property_type = @property_type,
      country = @country,
      region = @region,
      city = @city,
      district = @district,
      street = @street,
      latitude = @latitude,
      longitude = @longitude,
      images_json = @images_json,
      contact_name = @contact_name,
      contact_phone = @contact_phone,
      agency_name = @agency_name,
      published_at = @published_at,
      scraped_at = @scraped_at,
      fingerprint = @fingerprint,
      raw_payload_json = @raw_payload_json,
      last_seen_at = @last_seen_at,
      is_active = 1,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: existing.id,
    source_url: next.source_url,
    title: next.title,
    description: next.description,
    price: next.price,
    currency: next.currency,
    area_m2: next.area_m2,
    rooms: next.rooms,
    market_type: next.market_type,
    offer_type: next.offer_type,
    property_type: next.property_type,
    country: next.country,
    region: next.region,
    city: next.city,
    district: next.district,
    street: next.street,
    latitude: next.latitude,
    longitude: next.longitude,
    images_json: next.images_json,
    contact_name: next.contact_name,
    contact_phone: next.contact_phone,
    agency_name: next.agency_name,
    published_at: next.published_at,
    scraped_at: next.scraped_at,
    fingerprint: next.fingerprint,
    raw_payload_json: next.raw_payload_json,
    last_seen_at: now,
    updated_at: now,
  });

  db.prepare(`
    INSERT INTO property_offer_changes (
      id, offer_id, changed_fields_json, old_value_json, new_value_json, created_at
    ) VALUES (
      @id, @offer_id, @changed_fields_json, @old_value_json, @new_value_json, @created_at
    )
  `).run({
    id: randomUUID(),
    offer_id: existing.id,
    changed_fields_json: JSON.stringify(changedFields),
    old_value_json: JSON.stringify(existing),
    new_value_json: JSON.stringify(next),
    created_at: now,
  });

  return { status: 'updated', id: existing.id };
};

export const listOffers = ({ limit = 100, offset = 0 } = {}) => {
  return db.prepare('SELECT * FROM property_offers ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
};

export const getOffer = (id) => db.prepare('SELECT * FROM property_offers WHERE id = ?').get(id);

export const getStats = () => {
  const total = db.prepare('SELECT COUNT(1) as c FROM property_offers').get().c;
  const active = db.prepare('SELECT COUNT(1) as c FROM property_offers WHERE is_active = 1').get().c;
  return { total, active };
};

export const cleanupInactive = ({ olderThanDays = 7 } = {}) => {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('UPDATE property_offers SET is_active = 0, updated_at = ? WHERE last_seen_at < ?').run(nowIso(), cutoff);
  return result.changes || 0;
};
