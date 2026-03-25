import { db } from '../../db.js';

export const saveRawRun = ({ id, source, status, startedAt, finishedAt, processed, created, updated, errors, errorLog }) => {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO collector_raw_runs (
      id, source, status, started_at, finished_at, processed_count, new_count,
      updated_count, error_count, error_log, created_at, updated_at
    ) VALUES (
      @id, @source, @status, @started_at, @finished_at, @processed_count, @new_count,
      @updated_count, @error_count, @error_log, @created_at, @updated_at
    )
  `).run({
    id,
    source,
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    processed_count: processed,
    new_count: created,
    updated_count: updated,
    error_count: errors,
    error_log: errorLog || null,
    created_at: now,
    updated_at: now,
  });
};

export const listRuns = (limit = 100) => {
  return db.prepare('SELECT * FROM collector_raw_runs ORDER BY started_at DESC LIMIT ?').all(limit);
};
