import Database from 'better-sqlite3';
import { Pool } from 'pg';

const sqlitePath = process.env.DB_PATH || 'data/mwpanel.sqlite';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Brak DATABASE_URL');
  process.exit(1);
}

const tables = [
  'agencies', 'users', 'profiles',
  'clients', 'properties', 'listings',
  'documents', 'document_versions', 'document_usage_logs',
  'tasks', 'transactions', 'transaction_checklist_items',
  'activities', 'notifications',
  'email_templates', 'email_messages', 'email_attachments',
];

const sqlite = new Database(sqlitePath, { readonly: true });
const pg = new Pool({ connectionString: databaseUrl });

const isJsonLikeColumn = (col) => col.endsWith('_json') || col.endsWith('_jsonb');

try {
  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    console.log(`[migrate] ${table}: ${rows.length}`);

    if (!rows.length) continue;

    const cols = Object.keys(rows[0]);

    await pg.query('BEGIN');
    try {
      await pg.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);

      const colList = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = cols.map((c) => {
          const value = row[c];
          if (value === undefined) return null;
          if (value === null) return null;
          if (isJsonLikeColumn(c)) {
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                return JSON.stringify(parsed);
              } catch {
                return null;
              }
            }
            return JSON.stringify(value);
          }
          return value;
        });

        await pg.query(sql, values);
      }

      await pg.query('COMMIT');
    } catch (error) {
      await pg.query('ROLLBACK');
      throw error;
    }
  }

  console.log('[migrate] done');
} catch (error) {
  console.error('[migrate] error:', error.message);
  process.exitCode = 1;
} finally {
  sqlite.close();
  await pg.end();
}
