import { extractJsonLdObjects, parsePriceFromText, stripHtml, parseLocationParts } from './html_parser.js';

const parseNumber = (value) => {
  const v = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

const parseAreaFromText = (text) => {
  const raw = String(text || '');
  const m = raw.match(/([0-9][0-9\s\.,]{1,})\s*(m2|m²|m\s*kw|m2\.)/i);
  if (!m) return null;
  const digits = m[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
};

const parseRoomsFromText = (text) => {
  const raw = String(text || '');
  const m = raw.match(/([0-9]+)\s*(pok|pokoj|pokoje|rooms?)/i);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
};

const mapPropertyTypeFromText = (text) => {
  const t = String(text || '').toLowerCase();
  if (/dzia[lł]k|plot|grunt/.test(t)) return 'plot';
  if (/dom|house|villa/.test(t)) return 'house';
  if (/lokal|commercial|biuro|office|usług/.test(t)) return 'commercial';
  if (/mieszkan|apart|flat|apartment/.test(t)) return 'flat';
  return undefined;
};

const findFirstByKeys = (obj, keys = []) => {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findFirstByKeys(item, keys);
      if (found != null) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    if (keys.includes(key) && obj[key] != null) return obj[key];
  }
  for (const key of Object.keys(obj)) {
    const found = findFirstByKeys(obj[key], keys);
    if (found != null) return found;
  }
  return null;
};

const extractScriptJson = (html, { id, varName, windowVar }) => {
  if (id) {
    const m = String(html || '').match(new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* ignore */ }
    }
  }
  if (varName) {
    const re = new RegExp(`${varName}\\s*=\\s*({[\\s\\S]*?});`, 'i');
    const m = String(html || '').match(re);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* ignore */ }
    }
  }
  if (windowVar) {
    const re = new RegExp(`window\\.${windowVar}\\s*=\\s*({[\\s\\S]*?});`, 'i');
    const m = String(html || '').match(re);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* ignore */ }
    }
  }
  return null;
};

const extractNextData = (html) => extractScriptJson(html, { id: '__NEXT_DATA__' });

const extractOtodomDetail = (html) => {
  const data = extractNextData(html);
  if (!data) return {};

  const offer = findFirstByKeys(data, ['offer', 'listing', 'advert', 'ad', 'data']) || null;
  const detail = typeof offer === 'object' ? offer : data;

  const description = findFirstByKeys(detail, ['description', 'desc', 'fullDescription']);
  const title = findFirstByKeys(detail, ['title', 'name']);
  const price = findFirstByKeys(detail, ['price', 'totalPrice', 'priceAmount']);
  const currency = findFirstByKeys(detail, ['currency', 'priceCurrency']);
  const rooms = findFirstByKeys(detail, ['rooms', 'numberOfRooms']);
  const area = findFirstByKeys(detail, ['area', 'areaM2', 'area_m2', 'usableArea']);
  const offerType = findFirstByKeys(detail, ['offerType', 'offer_type']);
  const propertyType = findFirstByKeys(detail, ['propertyType', 'category', 'estateType']);
  const images = findFirstByKeys(detail, ['images', 'photos', 'gallery']) || [];
  const address = findFirstByKeys(detail, ['address', 'location']) || {};
  const geo = findFirstByKeys(detail, ['coordinates', 'geo', 'location']) || {};

  const imageUrls = Array.isArray(images)
    ? images.map((img) => img?.url || img?.large || img?.source || img).filter(Boolean)
    : [];

  return {
    title: title || undefined,
    description: description || undefined,
    price: parseNumber(price) || undefined,
    currency: currency || undefined,
    rooms: parseNumber(rooms) || undefined,
    area_m2: parseNumber(area) || undefined,
    offer_type: typeof offerType === 'string' ? offerType : undefined,
    property_type: typeof propertyType === 'string' ? propertyType : undefined,
    images: imageUrls.length ? imageUrls : undefined,
    city: address.city || address.addressLocality || undefined,
    district: address.district || address.addressDistrict || undefined,
    region: address.region || address.addressRegion || undefined,
    street: address.street || address.streetAddress || undefined,
    latitude: parseNumber(geo.lat || geo.latitude) || undefined,
    longitude: parseNumber(geo.lng || geo.longitude) || undefined,
  };
};

const extractOlxDetail = (html) => {
  const data = extractScriptJson(html, { id: '__NEXT_DATA__' }) || extractScriptJson(html, { windowVar: '__PRELOADED_STATE__' });
  if (!data) return {};
  const ad = findFirstByKeys(data, ['ad', 'advert', 'offer', 'listing', 'data']) || data;

  const title = findFirstByKeys(ad, ['title', 'name']);
  const description = findFirstByKeys(ad, ['description', 'desc', 'body']);
  const price = findFirstByKeys(ad, ['price', 'priceValue', 'totalPrice']);
  const currency = findFirstByKeys(ad, ['currency', 'priceCurrency']);
  const area = findFirstByKeys(ad, ['area', 'areaM2', 'usableArea']);
  const rooms = findFirstByKeys(ad, ['rooms', 'numberOfRooms']);
  const images = findFirstByKeys(ad, ['photos', 'images', 'gallery']) || [];
  const address = findFirstByKeys(ad, ['address', 'location']) || {};
  const geo = findFirstByKeys(ad, ['coordinates', 'geo', 'location']) || {};

  const imageUrls = Array.isArray(images)
    ? images.map((img) => img?.url || img?.large || img?.source || img).filter(Boolean)
    : [];

  return {
    title: title || undefined,
    description: description || undefined,
    price: parseNumber(price) || undefined,
    currency: currency || undefined,
    rooms: parseNumber(rooms) || undefined,
    area_m2: parseNumber(area) || undefined,
    images: imageUrls.length ? imageUrls : undefined,
    city: address.city || address.addressLocality || undefined,
    district: address.district || address.addressDistrict || undefined,
    region: address.region || address.addressRegion || undefined,
    street: address.street || address.streetAddress || undefined,
    latitude: parseNumber(geo.lat || geo.latitude) || undefined,
    longitude: parseNumber(geo.lng || geo.longitude) || undefined,
  };
};

const extractGratkaDetail = (html) => {
  const data = extractScriptJson(html, { id: '__NEXT_DATA__' })
    || extractScriptJson(html, { windowVar: '__STATE__' })
    || extractScriptJson(html, { varName: 'window.__STATE__' });
  if (!data) return {};
  const offer = findFirstByKeys(data, ['offer', 'listing', 'advert', 'ad', 'data']) || data;

  const title = findFirstByKeys(offer, ['title', 'name']);
  const description = findFirstByKeys(offer, ['description', 'desc']);
  const price = findFirstByKeys(offer, ['price', 'totalPrice']);
  const currency = findFirstByKeys(offer, ['currency', 'priceCurrency']);
  const area = findFirstByKeys(offer, ['area', 'areaM2']);
  const rooms = findFirstByKeys(offer, ['rooms', 'numberOfRooms']);
  const images = findFirstByKeys(offer, ['images', 'photos', 'gallery']) || [];
  const address = findFirstByKeys(offer, ['address', 'location']) || {};
  const geo = findFirstByKeys(offer, ['geo', 'coordinates', 'location']) || {};

  const imageUrls = Array.isArray(images)
    ? images.map((img) => img?.url || img?.large || img?.source || img).filter(Boolean)
    : [];

  return {
    title: title || undefined,
    description: description || undefined,
    price: parseNumber(price) || undefined,
    currency: currency || undefined,
    rooms: parseNumber(rooms) || undefined,
    area_m2: parseNumber(area) || undefined,
    images: imageUrls.length ? imageUrls : undefined,
    city: address.city || address.addressLocality || undefined,
    district: address.district || address.addressDistrict || undefined,
    region: address.region || address.addressRegion || undefined,
    street: address.street || address.streetAddress || undefined,
    latitude: parseNumber(geo.lat || geo.latitude) || undefined,
    longitude: parseNumber(geo.lng || geo.longitude) || undefined,
  };
};

const extractMorizonDetail = (html) => {
  const data = extractScriptJson(html, { id: '__NEXT_DATA__' })
    || extractScriptJson(html, { windowVar: '__STATE__' });
  if (!data) return {};
  const offer = findFirstByKeys(data, ['offer', 'listing', 'advert', 'ad', 'data']) || data;

  const title = findFirstByKeys(offer, ['title', 'name']);
  const description = findFirstByKeys(offer, ['description', 'desc']);
  const price = findFirstByKeys(offer, ['price', 'totalPrice']);
  const currency = findFirstByKeys(offer, ['currency', 'priceCurrency']);
  const area = findFirstByKeys(offer, ['area', 'areaM2']);
  const rooms = findFirstByKeys(offer, ['rooms', 'numberOfRooms']);
  const images = findFirstByKeys(offer, ['images', 'photos', 'gallery']) || [];
  const address = findFirstByKeys(offer, ['address', 'location']) || {};
  const geo = findFirstByKeys(offer, ['geo', 'coordinates', 'location']) || {};

  const imageUrls = Array.isArray(images)
    ? images.map((img) => img?.url || img?.large || img?.source || img).filter(Boolean)
    : [];

  return {
    title: title || undefined,
    description: description || undefined,
    price: parseNumber(price) || undefined,
    currency: currency || undefined,
    rooms: parseNumber(rooms) || undefined,
    area_m2: parseNumber(area) || undefined,
    images: imageUrls.length ? imageUrls : undefined,
    city: address.city || address.addressLocality || undefined,
    district: address.district || address.addressDistrict || undefined,
    region: address.region || address.addressRegion || undefined,
    street: address.street || address.streetAddress || undefined,
    latitude: parseNumber(geo.lat || geo.latitude) || undefined,
    longitude: parseNumber(geo.lng || geo.longitude) || undefined,
  };
};

export const parseDetailFromHtml = (html, sourceCode) => {
  const result = {};

  if (sourceCode === 'otodom') Object.assign(result, extractOtodomDetail(html));
  if (sourceCode === 'olx') Object.assign(result, extractOlxDetail(html));
  if (sourceCode === 'gratka') Object.assign(result, extractGratkaDetail(html));
  if (sourceCode === 'morizon') Object.assign(result, extractMorizonDetail(html));

  const jsonLd = extractJsonLdObjects(html);
  for (const obj of jsonLd) {
    const offers = obj.offers || obj.Offers || null;
    const address = obj.address || (obj.location && obj.location.address) || null;

    if (!result.title && obj.name) result.title = obj.name;
    if (!result.description && obj.description) result.description = obj.description;

    if (offers && !result.price) {
      const offerObj = Array.isArray(offers) ? offers[0] : offers;
      if (offerObj?.price) result.price = parseNumber(offerObj.price);
      if (offerObj?.priceCurrency) result.currency = offerObj.priceCurrency;
      if (offerObj?.url && !result.source_url) result.source_url = offerObj.url;
    }

    if (address) {
      if (!result.city && address.addressLocality) result.city = address.addressLocality;
      if (!result.region && address.addressRegion) result.region = address.addressRegion;
      if (!result.district && address.addressDistrict) result.district = address.addressDistrict;
      if (!result.street && address.streetAddress) result.street = address.streetAddress;
      if (!result.country && address.addressCountry) result.country = address.addressCountry;
    }

    const geo = obj.geo || (obj.location && obj.location.geo);
    if (geo) {
      if (geo.latitude != null && !result.latitude) { const lat = parseNumber(geo.latitude); if (lat !== null) result.latitude = lat; }
      if (geo.longitude != null && !result.longitude) { const lng = parseNumber(geo.longitude); if (lng !== null) result.longitude = lng; }
    }

    if (!result.images && obj.image) {
      result.images = Array.isArray(obj.image) ? obj.image : [obj.image];
    }

    if (!result.area_m2 && obj.floorSize?.value) result.area_m2 = parseNumber(obj.floorSize.value);
    if (!result.rooms && obj.numberOfRooms) result.rooms = parseNumber(obj.numberOfRooms);
  }

  if (!result.price) { const p = parsePriceFromText(html); if (p !== null) result.price = p; }
  if (!result.area_m2) { const a = parseAreaFromText(html); if (a !== null) result.area_m2 = a; }
  if (!result.rooms) { const r = parseRoomsFromText(html); if (r !== null) result.rooms = r; }

  if (!result.property_type || typeof result.property_type !== 'string') {
    result.property_type = mapPropertyTypeFromText(result.title || result.description || stripHtml(html));
  }

  if (!result.city || !result.region || !result.district) {
    const loc = parseLocationParts(stripHtml(html));
    if (!result.city && loc.city) result.city = loc.city;
    if (!result.district && loc.district) result.district = loc.district;
    if (!result.region && loc.region) result.region = loc.region;
  }

  if (!result.description) result.description = stripHtml(html).slice(0, 2400);

  return result;
};
