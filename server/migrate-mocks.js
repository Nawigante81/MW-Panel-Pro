import { db } from './db.js';

const now = () => new Date().toISOString();

const insertIfMissing = (sql, params, checkSql, checkParams) => {
  const exists = db.prepare(checkSql).get(checkParams);
  if (exists) return false;
  db.prepare(sql).run(params);
  return true;
};

const agencyId = 'agency-1';
const userId = 'user-admin-1';

// Agents
insertIfMissing(
  `INSERT INTO agents (id, user_id, agency_id, license_number, specialization_json, commission_rate, target_properties, target_clients, status, stats_json, created_at, updated_at)
   VALUES (@id,@user_id,@agency_id,@license_number,@specialization_json,@commission_rate,@target_properties,@target_clients,@status,@stats_json,@created_at,@updated_at)`,
  {
    id: 'agent-1',
    user_id: userId,
    agency_id: agencyId,
    license_number: '1234/2024',
    specialization_json: JSON.stringify(['Mieszkania', 'Domy']),
    commission_rate: 2.5,
    target_properties: 20,
    target_clients: 30,
    status: 'active',
    stats_json: JSON.stringify({ listingsCount: 12, clientsCount: 24, documentsCount: 45, dealsClosed: 8 }),
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM agents WHERE id = ? LIMIT 1',
  ['agent-1']
);

// Activities
insertIfMissing(
  `INSERT INTO activities (id, agency_id, user_id, type, entity_type, entity_id, entity_name, description, metadata_json, created_at, updated_at)
   VALUES (@id,@agency_id,@user_id,@type,@entity_type,@entity_id,@entity_name,@description,@metadata_json,@created_at,@updated_at)`,
  {
    id: 'seed-activity-1',
    agency_id: agencyId,
    user_id: userId,
    type: 'client_created',
    entity_type: 'client',
    entity_id: '1',
    entity_name: 'Anna Nowak',
    description: 'Utworzono klienta',
    metadata_json: JSON.stringify({}),
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM activities WHERE id = ? LIMIT 1',
  ['seed-activity-1']
);

// Notifications
insertIfMissing(
  `INSERT INTO notifications (id, user_id, agency_id, type, title, message, read, read_at, action_url, metadata_json, created_at, updated_at)
   VALUES (@id,@user_id,@agency_id,@type,@title,@message,@read,@read_at,@action_url,@metadata_json,@created_at,@updated_at)`,
  {
    id: 'seed-notification-1',
    user_id: userId,
    agency_id: agencyId,
    type: 'new_lead',
    title: 'Nowy lead',
    message: 'Otrzymano nowe zapytanie z formularza na stronie',
    read: 0,
    read_at: null,
    action_url: null,
    metadata_json: JSON.stringify({}),
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM notifications WHERE id = ? LIMIT 1',
  ['seed-notification-1']
);

// Portal integrations
insertIfMissing(
  `INSERT INTO portal_integrations (id, agency_id, portal, is_active, credentials_json, settings_json, last_import_at, last_import_status, created_at, updated_at)
   VALUES (@id,@agency_id,@portal,@is_active,@credentials_json,@settings_json,@last_import_at,@last_import_status,@created_at,@updated_at)`,
  {
    id: 'portal-otodom-1',
    agency_id: agencyId,
    portal: 'otodom',
    is_active: 0,
    credentials_json: JSON.stringify({}),
    settings_json: JSON.stringify({ autoImport: false, autoPublish: false, importInterval: 60 }),
    last_import_at: null,
    last_import_status: null,
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM portal_integrations WHERE id = ? LIMIT 1',
  ['portal-otodom-1']
);

// Import jobs
insertIfMissing(
  `INSERT INTO portal_import_jobs (id, agency_id, portal, status, started_at, completed_at, listings_imported, new_listings, price_changes, errors, error_message, created_at, updated_at)
   VALUES (@id,@agency_id,@portal,@status,@started_at,@completed_at,@listings_imported,@new_listings,@price_changes,@errors,@error_message,@created_at,@updated_at)`,
  {
    id: 'seed-import-job-1',
    agency_id: agencyId,
    portal: 'otodom',
    status: 'completed',
    started_at: now(),
    completed_at: now(),
    listings_imported: 12,
    new_listings: 3,
    price_changes: 1,
    errors: 0,
    error_message: null,
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM portal_import_jobs WHERE id = ? LIMIT 1',
  ['seed-import-job-1']
);

// Publication jobs
insertIfMissing(
  `INSERT INTO publication_jobs (id, agency_id, listing_id, portal, status, attempt, max_attempts, next_attempt_at, published_at, portal_listing_id, portal_url, response_json, error_json, created_at, updated_at)
   VALUES (@id,@agency_id,@listing_id,@portal,@status,@attempt,@max_attempts,@next_attempt_at,@published_at,@portal_listing_id,@portal_url,@response_json,@error_json,@created_at,@updated_at)`,
  {
    id: 'seed-publication-1',
    agency_id: agencyId,
    listing_id: '1',
    portal: 'otodom',
    status: 'published',
    attempt: 1,
    max_attempts: 3,
    next_attempt_at: null,
    published_at: now(),
    portal_listing_id: 'otodom-123',
    portal_url: 'https://otodom.pl/oferta/otodom-123',
    response_json: JSON.stringify({ statusCode: 200, message: 'OK' }),
    error_json: null,
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM publication_jobs WHERE id = ? LIMIT 1',
  ['seed-publication-1']
);

// Document versions
insertIfMissing(
  `INSERT INTO document_versions (id, agency_id, document_id, document_number, document_type, title, version, status, hash, note, created_at, updated_at)
   VALUES (@id,@agency_id,@document_id,@document_number,@document_type,@title,@version,@status,@hash,@note,@created_at,@updated_at)`,
  {
    id: 'seed-ver-1',
    agency_id: agencyId,
    document_id: 'seed-doc-1',
    document_number: 'UP/2026/0001',
    document_type: 'brokerage_agreement',
    title: 'Umowa posrednictwa - seed',
    version: 1,
    status: 'draft',
    hash: 'seedhash0001',
    note: 'Initial version',
    created_at: now(),
    updated_at: now(),
  },
  'SELECT id FROM document_versions WHERE id = ? LIMIT 1',
  ['seed-ver-1']
);

console.log('Mock migration finished.');
