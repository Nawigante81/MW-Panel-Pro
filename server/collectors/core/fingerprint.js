export const computeFingerprint = (offer) => {
  const core = [
    offer.title || '',
    offer.city || '',
    offer.district || '',
    String(offer.price || ''),
    String(offer.area_m2 || ''),
    String(offer.rooms || ''),
    offer.property_type || '',
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < core.length; i += 1) {
    hash = ((hash << 5) + hash) ^ core.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
};
