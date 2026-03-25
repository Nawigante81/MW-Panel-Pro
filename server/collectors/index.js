import { OtodomCollector } from './sources/otodom.collector.js';
import { OlxCollector } from './sources/olx.collector.js';
import { GratkaCollector } from './sources/gratka.collector.js';
import { MorizonCollector } from './sources/morizon.collector.js';
import { runAll } from './jobs/run_all.js';
import { runSource } from './jobs/run_source.js';
import { runCleanup } from './jobs/cleanup.js';
import { log, warn } from './utils/log.js';

export const buildCollectors = (env = process.env) => {
  const enabled = env.COLLECTORS_ENABLED !== 'false';
  return [
    new OtodomCollector({
      source: 'otodom',
      enabled,
      baseUrl: 'https://www.otodom.pl',
      searchUrls: env.COLLECTOR_OTODOM_SEARCH_URLS ? env.COLLECTOR_OTODOM_SEARCH_URLS.split(',').map((s) => s.trim()).filter(Boolean) : [],
      timeoutMs: Number(env.COLLECTORS_TIMEOUT_MS || 15000),
      rateLimitPerMinute: Number(env.COLLECTORS_RATE_LIMIT || 60),
      maxRetries: Number(env.COLLECTORS_MAX_RETRIES || 2),
      useBrowser: env.COLLECTORS_USE_BROWSER === '1',
    }),
    new OlxCollector({
      source: 'olx',
      enabled,
      baseUrl: 'https://www.olx.pl',
      searchUrls: env.COLLECTOR_OLX_SEARCH_URLS ? env.COLLECTOR_OLX_SEARCH_URLS.split(',').map((s) => s.trim()).filter(Boolean) : [],
      timeoutMs: Number(env.COLLECTORS_TIMEOUT_MS || 15000),
      rateLimitPerMinute: Number(env.COLLECTORS_RATE_LIMIT || 60),
      maxRetries: Number(env.COLLECTORS_MAX_RETRIES || 2),
      useBrowser: env.COLLECTORS_USE_BROWSER === '1',
    }),
    new GratkaCollector({
      source: 'gratka',
      enabled,
      baseUrl: 'https://gratka.pl',
      searchUrls: env.COLLECTOR_GRATKA_SEARCH_URLS ? env.COLLECTOR_GRATKA_SEARCH_URLS.split(',').map((s) => s.trim()).filter(Boolean) : [],
      timeoutMs: Number(env.COLLECTORS_TIMEOUT_MS || 15000),
      rateLimitPerMinute: Number(env.COLLECTORS_RATE_LIMIT || 60),
      maxRetries: Number(env.COLLECTORS_MAX_RETRIES || 2),
      useBrowser: env.COLLECTORS_USE_BROWSER === '1',
    }),
    new MorizonCollector({
      source: 'morizon',
      enabled,
      baseUrl: 'https://www.morizon.pl',
      searchUrls: env.COLLECTOR_MORIZON_SEARCH_URLS ? env.COLLECTOR_MORIZON_SEARCH_URLS.split(',').map((s) => s.trim()).filter(Boolean) : [],
      timeoutMs: Number(env.COLLECTORS_TIMEOUT_MS || 15000),
      rateLimitPerMinute: Number(env.COLLECTORS_RATE_LIMIT || 60),
      maxRetries: Number(env.COLLECTORS_MAX_RETRIES || 2),
      useBrowser: env.COLLECTORS_USE_BROWSER === '1',
    })
  ];
};

export const runCollectorsAll = async (collectors) => runAll(collectors);

export const runCollectorsSource = async (collectors, source) => {
  const collector = collectors.find((c) => c.source === source);
  if (!collector) throw new Error(`Collector not found: ${source}`);
  return runSource(collector);
};

let schedulerStarted = false;
export const startCollectorsScheduler = (collectors, env = process.env) => {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const enabled = env.COLLECTORS_ENABLED !== 'false';
  if (!enabled) {
    warn('scheduler', 'disabled via COLLECTORS_ENABLED');
    return;
  }

  const listingIntervalMs = Number(env.COLLECTORS_LISTING_INTERVAL_MS || 30 * 60 * 1000);
  const cleanupIntervalMs = Number(env.COLLECTORS_CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000);

  const runListing = async () => {
    try {
      await runAll(collectors);
    } catch (err) {
      warn('scheduler', 'listing run failed', err?.message || err);
    }
  };

  const runCleanupJob = async () => {
    try {
      const count = runCleanup({ olderThanDays: Number(env.COLLECTORS_INACTIVE_DAYS || 7) });
      log('scheduler', `cleanup done: ${count}`);
    } catch (err) {
      warn('scheduler', 'cleanup failed', err?.message || err);
    }
  };

  setTimeout(runListing, 5000);
  setInterval(runListing, listingIntervalMs);

  setTimeout(runCleanupJob, 20_000);
  setInterval(runCleanupJob, cleanupIntervalMs);
};
