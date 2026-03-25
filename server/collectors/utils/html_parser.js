export const sanitizeUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (!value.startsWith('http://') && !value.startsWith('https://')) return '';
  return value;
};

export const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export const extractJsonLdObjects = (html) => {
  const scripts = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out = [];
  for (const m of scripts) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore
    }
  }
  return out;
};

export const parsePriceFromText = (text) => {
  const raw = String(text || '');
  if (!/(zł|zl|pln|€|eur)/i.test(raw)) return 0;
  const m = raw.match(/([0-9][0-9\s\.,]{2,})\s*(zł|zl|pln|€|eur)/i);
  if (!m) return 0;
  const digits = m[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(digits);
  if (!Number.isFinite(value)) return 0;
  return value;
};

export const parseLocationParts = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return { city: '', district: '', region: '', locationText: '' };
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return {
    city: parts[0] || '',
    district: parts[1] || '',
    region: parts[2] || '',
    locationText: raw,
  };
};

export const isLikelyDetailUrl = (sourceCode, url) => {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  if (sourceCode === 'otodom') return u.includes('/oferta/') || /\/id\w+/.test(u);
  if (sourceCode === 'olx') return u.includes('/d/oferta/');
  if (sourceCode === 'gratka') return u.includes('/oferta/') || /-id[a-z0-9]+/.test(u);
  if (sourceCode === 'morizon') return u.includes('/oferta/') || u.includes('/ogloszenie/');
  return /\/oferta\//.test(u);
};

export const parseListingsFromHtml = (html, { sourceCode, baseUrl }) => {
  const items = [];
  const jsonLdObjects = extractJsonLdObjects(html);

  for (const obj of jsonLdObjects) {
    const maybeList = Array.isArray(obj?.itemListElement) ? obj.itemListElement : null;
    if (!maybeList) continue;
    for (const el of maybeList) {
      const item = el?.item || el;
      if (!item) continue;
      const url = sanitizeUrl(item.url || item['@id']);
      const title = item.name || '';
      const description = item.description || '';
      const offers = item.offers || {};
      const price = Number(offers.price || 0) || 0;
      const loc = parseLocationParts(item.address?.addressLocality || item.address?.addressRegion || '');
      if (url && title && isLikelyDetailUrl(sourceCode, url) && price > 0) {
        items.push({
          source_url: url,
          external_id: item.identifier || item.sku || url,
          title,
          description,
          price,
          area_m2: Number(item.floorSize?.value || 0) || 0,
          rooms: Number(item.numberOfRooms || 0) || 0,
          city: loc.city,
          district: loc.district,
          region: loc.region,
          location_text: loc.locationText,
          images: item.image ? (Array.isArray(item.image) ? item.image : [item.image]) : [],
        });
      }
    }
  }

  if (items.length > 0) return items;

  const anchors = [...String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const a of anchors) {
    const href = a[1] || '';
    const body = stripHtml(a[2] || '');
    if (!href || body.length < 20) continue;
    if (!/otodom|olx|gratka|morizon/i.test(href) && !href.startsWith('/')) continue;
    const absolute = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
    if (!isLikelyDetailUrl(sourceCode, absolute)) continue;
    const price = parsePriceFromText(body);
    const loc = parseLocationParts(body);
    if (price <= 0) continue;
    items.push({
      source_url: absolute,
      external_id: absolute,
      title: body.slice(0, 140),
      description: body,
      price,
      area_m2: 0,
      rooms: 0,
      city: loc.city,
      district: loc.district,
      region: loc.region,
      location_text: loc.locationText,
      images: [],
    });
  }

  const dedup = new Map();
  for (const it of items) {
    const key = it.source_url || it.external_id;
    if (!key) continue;
    if (!dedup.has(key)) dedup.set(key, it);
  }
  return [...dedup.values()].slice(0, 300);
};
