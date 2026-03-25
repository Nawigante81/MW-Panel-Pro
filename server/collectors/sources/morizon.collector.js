import { BaseCollector } from '../core/base_collector.js';
import { parseDetailFromHtml } from '../utils/html_detail.js';

export class MorizonCollector extends BaseCollector {
  async detail(offer) {
    if (!offer?.source_url) return offer;
    const html = await this.fetchDetailHtml(offer.source_url);
    const detail = parseDetailFromHtml(html, this.source);
    return { ...offer, ...detail, source_url: offer.source_url };
  }

  async listing() {
    const defaultSearch = [
      'https://www.morizon.pl/mieszkania/sprzedaz/',
      'https://www.morizon.pl/dzialki/sprzedaz/',
    ];
    const urls = this.searchUrls && this.searchUrls.length ? this.searchUrls : defaultSearch;
    let items = [];
    try {
      items = await this.listingFromHtml(urls);
    } catch {
      items = [];
    }
    if (items.length === 0 && this.useBrowser) {
      items = await this.listingFromBrowser(urls);
    }

    const now = new Date().toISOString();
    return items.map((it) => ({
      source: 'morizon',
      external_id: it.external_id || it.source_url,
      source_url: it.source_url,
      title: it.title,
      description: it.description || '',
      price: it.price || 0,
      currency: 'PLN',
      area_m2: it.area_m2 || 0,
      rooms: it.rooms || 0,
      market_type: 'secondary',
      offer_type: 'sale',
      property_type: it.property_type || 'flat',
      country: 'Poland',
      region: it.region,
      city: it.city,
      district: it.district,
      street: it.street,
      latitude: it.latitude,
      longitude: it.longitude,
      images: it.images || [],
      published_at: now,
      raw_payload: it,
    }));
  }
}
