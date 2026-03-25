import { withRetry } from './retry.js';
import { httpFetch } from './http.js';
import { rateLimit } from './rate_limit.js';
import { computeFingerprint } from './fingerprint.js';
import { parseListingsFromHtml } from '../utils/html_parser.js';
import { fetchHtmlWithBrowser } from './browser_fetch.js';
import { CollectedOfferSchema } from '../types/offer.js';
import { log, warn } from '../utils/log.js';

const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/16.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
];

export class BaseCollector {
  constructor(config = {}) {
    this.config = config;
    this.source = config.source;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs || 15000;
    this.searchUrls = config.searchUrls || [];
    this.rateLimitPerMinute = config.rateLimitPerMinute || 60;
    this.maxRetries = config.maxRetries ?? 2;
    this.useBrowser = config.useBrowser || false;
  }

  getUserAgent() {
    const idx = Math.floor(Math.random() * DEFAULT_USER_AGENTS.length);
    return DEFAULT_USER_AGENTS[idx];
  }

  async fetchJson(url, init = {}) {
    await rateLimit(this.baseUrl || this.source, { perMinute: this.rateLimitPerMinute });
    return withRetry(async () => {
      const response = await httpFetch(url, {
        timeoutMs: this.timeoutMs,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json',
          ...(init.headers || {}),
        },
        ...init,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${body.slice(0, 200)}`);
      }
      return response.json();
    }, { retries: this.maxRetries });
  }


  async fetchHtml(url) {
    await rateLimit(this.baseUrl || this.source, { perMinute: this.rateLimitPerMinute });
    return withRetry(async () => {
      const response = await httpFetch(url, {
        timeoutMs: this.timeoutMs,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${body.slice(0, 200)}`);
      }
      return response.text();
    }, { retries: this.maxRetries });
  }

  async listingFromHtml(urls = []) {
    const collected = [];
    for (const url of urls) {
      const html = await this.fetchHtml(url);
      const items = parseListingsFromHtml(html, { sourceCode: this.source, baseUrl: this.baseUrl || url });
      collected.push(...items);
    }
    return collected;
  }


  async fetchDetailHtml(url) {
    try {
      return await this.fetchHtml(url);
    } catch (err) {
      if (this.useBrowser) {
        return await fetchHtmlWithBrowser(url, { timeoutMs: this.timeoutMs, userAgent: this.getUserAgent() });
      }
      throw err;
    }
  }

  async listingFromBrowser(urls = []) {
    const collected = [];
    for (const url of urls) {
      const html = await fetchHtmlWithBrowser(url, { timeoutMs: this.timeoutMs, userAgent: this.getUserAgent() });
      const items = parseListingsFromHtml(html, { sourceCode: this.source, baseUrl: this.baseUrl || url });
      collected.push(...items);
    }
    return collected;
  }

  async listing() {
    throw new Error('listing() not implemented');
  }

  async detail(_offer) {
    return _offer;
  }

  normalize(raw) {
    const parsed = CollectedOfferSchema.parse(raw);
    return {
      ...parsed,
      fingerprint: parsed.fingerprint || computeFingerprint(parsed),
      scraped_at: parsed.scraped_at || new Date().toISOString(),
    };
  }

  async run() {
    log(this.source, 'Listing start');
    const rawItems = await this.listing();
    const offers = [];
    for (const raw of rawItems) {
      try {
        const enriched = await this.detail(raw);
        const normalized = this.normalize(enriched);
        offers.push(normalized);
      } catch (err) {
        warn(this.source, 'normalize error', err?.message || err);
      }
    }
    log(this.source, `Listing done (${offers.length})`);
    return offers;
  }
}
