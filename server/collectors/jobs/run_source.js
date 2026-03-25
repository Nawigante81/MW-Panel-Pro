import { randomUUID } from 'node:crypto';
import { saveRawRun } from '../storage/raw_store.js';
import { upsertOffer } from '../storage/offer_repository.js';
import { log, error as logError } from '../utils/log.js';

export const runSource = async (collector) => {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  let processed = 0;
  let created = 0;
  let updated = 0;
  let errors = 0;
  let errorLog = null;

  try {
    const offers = await collector.run();
    for (const offer of offers) {
      processed += 1;
      const result = upsertOffer(offer);
      if (result.status === 'created') created += 1;
      if (result.status === 'updated') updated += 1;
    }
    const finishedAt = new Date().toISOString();
    saveRawRun({
      id: runId,
      source: collector.source,
      status: 'success',
      startedAt,
      finishedAt,
      processed,
      created,
      updated,
      errors,
      errorLog,
    });
    log(collector.source, `run ok: processed=${processed} created=${created} updated=${updated}`);
    return { runId, processed, created, updated, errors };
  } catch (err) {
    errorLog = err?.message || String(err);
    errors += 1;
    const finishedAt = new Date().toISOString();
    saveRawRun({
      id: runId,
      source: collector.source,
      status: 'failed',
      startedAt,
      finishedAt,
      processed,
      created,
      updated,
      errors,
      errorLog,
    });
    logError(collector.source, 'run failed', errorLog);
    throw err;
  }
};
