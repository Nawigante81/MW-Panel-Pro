import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { DOCUMENT_DEFINITIONS } from './documentRegistry.js';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const configuredDbPath = process.env.DB_PATH;
const dbPath = configuredDbPath
  ? path.resolve(process.cwd(), configuredDbPath)
  : path.join(dataDir, 'mwpanel.sqlite');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const DB_PATH = dbPath;
export const BACKUP_DIR = path.join(dbDir, 'backups');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nip TEXT NOT NULL,
  regon TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT,
  license_number TEXT,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  profile_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(agency_id) REFERENCES agencies(id)
);

CREATE INDEX IF NOT EXISTS idx_users_agency_id ON users(agency_id);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  avatar TEXT,
  cover TEXT,
  address TEXT,
  city TEXT,
  zip_code TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  assigned_agent_id TEXT,
  profile_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  notes TEXT,
  preferences_json TEXT,
  tags_json TEXT NOT NULL,
  properties_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  address_json TEXT NOT NULL,
  property_type TEXT NOT NULL,
  market_type TEXT NOT NULL,
  area REAL NOT NULL,
  plot_area REAL,
  rooms INTEGER,
  floors_json TEXT,
  year_built INTEGER,
  building_type TEXT,
  condition_text TEXT,
  price REAL NOT NULL,
  price_per_meter REAL,
  ownership_status TEXT,
  description TEXT,
  features_json TEXT,
  media_json TEXT NOT NULL,
  coordinates_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_agency_id ON properties(agency_id);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  assigned_agent_id TEXT,
  client_id TEXT,
  listing_number TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  price REAL NOT NULL,
  price_original REAL,
  price_history_json TEXT NOT NULL,
  published_at TEXT,
  reserved_at TEXT,
  sold_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  inquiries INTEGER NOT NULL DEFAULT 0,
  publication_status_json TEXT NOT NULL,
  notes TEXT,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(property_id) REFERENCES properties(id)
);

CREATE INDEX IF NOT EXISTS idx_listings_agency_id ON listings(agency_id);
CREATE INDEX IF NOT EXISTS idx_listings_property_id ON listings(property_id);

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  category TEXT NOT NULL,
  entity TEXT,
  entity_type TEXT,
  uploaded_by TEXT,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_assets_agency_id ON file_assets(agency_id);
CREATE INDEX IF NOT EXISTS idx_file_assets_created_at ON file_assets(created_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  assigned_agent_id TEXT,
  client_id TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  property_interest TEXT,
  budget_min REAL,
  budget_max REAL,
  notes TEXT,
  follow_up_date TEXT,
  converted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_agency_id ON leads(agency_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  assigned_to_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  client_id TEXT,
  property_id TEXT,
  listing_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT,
  completed_at TEXT,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_agency_id ON tasks(agency_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  document_number TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  client_id TEXT,
  property_id TEXT,
  agent_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  pdf_url TEXT,
  sent_at TEXT,
  signed_at TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_agency_id ON documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_documents_number ON documents(document_number);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_number TEXT NOT NULL,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  hash TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_at ON document_versions(created_at);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  text_template TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agency_id, code)
);
CREATE INDEX IF NOT EXISTS idx_email_templates_agency_code ON email_templates(agency_id, code);

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  template_id TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  scheduled_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(template_id) REFERENCES email_templates(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_email_messages_agency_id ON email_messages(agency_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status);
CREATE INDEX IF NOT EXISTS idx_email_messages_scheduled_at ON email_messages(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_related_entity ON email_messages(related_entity_type, related_entity_id);

CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY,
  email_message_id TEXT NOT NULL,
  document_id TEXT,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  created_at TEXT NOT NULL,
  FOREIGN KEY(email_message_id) REFERENCES email_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_attachments_email_message_id ON email_attachments(email_message_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_agency_id ON chat_messages(agency_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_call_logs_agency_id ON call_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  audience TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_agency_id ON campaigns(agency_id);

CREATE TABLE IF NOT EXISTS workflow_rules (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  action_text TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_agency_id ON workflow_rules(agency_id);

CREATE TABLE IF NOT EXISTS agency_subscriptions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'trial',
  seats_limit INTEGER NOT NULL DEFAULT 3,
  seats_used INTEGER NOT NULL DEFAULT 0,
  trial_ends_at TEXT,
  current_period_end TEXT,
  billing_email TEXT,
  stripe_customer_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(agency_id) REFERENCES agencies(id)
);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_agency_id ON agency_subscriptions(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_status ON agency_subscriptions(status);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  subscription_id TEXT,
  event_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PLN',
  status TEXT NOT NULL DEFAULT 'recorded',
  external_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(agency_id) REFERENCES agencies(id),
  FOREIGN KEY(subscription_id) REFERENCES agency_subscriptions(id)
);
CREATE INDEX IF NOT EXISTS idx_billing_events_agency_id ON billing_events(agency_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  parties_json TEXT NOT NULL,
  milestones_json TEXT NOT NULL,
  payment_status_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_agency_id ON transactions(agency_id);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  agent_name TEXT,
  listing_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_agency_id ON reservations(agency_id);
CREATE INDEX IF NOT EXISTS idx_reservations_start_at ON reservations(start_at);

CREATE TABLE IF NOT EXISTS transaction_checklist_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transaction_checklist_transaction_id ON transaction_checklist_items(transaction_id);

CREATE TABLE IF NOT EXISTS document_type_registry (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  template_key TEXT NOT NULL,
  active_template_version INTEGER NOT NULL DEFAULT 1,
  required_fields_json TEXT NOT NULL,
  output_format TEXT NOT NULL DEFAULT 'pdf',
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  linked_client INTEGER NOT NULL DEFAULT 0,
  linked_property INTEGER NOT NULL DEFAULT 0,
  linked_transaction INTEGER NOT NULL DEFAULT 0,
  legacy_type TEXT,
  numbering_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_type_registry_category ON document_type_registry(category);
CREATE INDEX IF NOT EXISTS idx_document_type_registry_enabled ON document_type_registry(enabled);

CREATE TABLE IF NOT EXISTS document_template_versions (
  id TEXT PRIMARY KEY,
  document_type_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  renderer_key TEXT NOT NULL DEFAULT 'html-base',
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(document_type_key) REFERENCES document_type_registry(key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_template_unique
  ON document_template_versions(document_type_key, template_key, template_version);
`);



db.exec(`
CREATE TABLE IF NOT EXISTS collector_raw_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_log TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collector_raw_runs_source ON collector_raw_runs(source);
CREATE INDEX IF NOT EXISTS idx_collector_raw_runs_started_at ON collector_raw_runs(started_at);

CREATE TABLE IF NOT EXISTS property_offers (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  source_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  price REAL,
  currency TEXT,
  area_m2 REAL,
  rooms REAL,
  market_type TEXT,
  offer_type TEXT,
  property_type TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  district TEXT,
  street TEXT,
  latitude REAL,
  longitude REAL,
  images_json TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  agency_name TEXT,
  published_at TEXT,
  scraped_at TEXT,
  fingerprint TEXT,
  raw_payload_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_offers_source_external ON property_offers(source, external_id);
CREATE INDEX IF NOT EXISTS idx_property_offers_fingerprint ON property_offers(fingerprint);
CREATE INDEX IF NOT EXISTS idx_property_offers_last_seen ON property_offers(last_seen_at);

CREATE TABLE IF NOT EXISTS property_offer_changes (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(offer_id) REFERENCES property_offers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_property_offer_changes_offer_id ON property_offer_changes(offer_id);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS external_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  last_sync_at TEXT,
  last_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_listings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_listing_id TEXT,
  source_url TEXT,
  offer_type TEXT NOT NULL,
  property_type TEXT NOT NULL,
  plot_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location_text TEXT,
  city TEXT,
  district TEXT,
  voivodeship TEXT,
  price REAL,
  price_per_m2 REAL,
  area_m2 REAL,
  plot_area_m2 REAL,
  rooms REAL,
  market_type TEXT,
  latitude REAL,
  longitude REAL,
  images_json TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  agency_name TEXT,
  published_at_source TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  status TEXT NOT NULL,
  hash_signature TEXT,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES external_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_external_listings_source_status ON external_listings(source_id, status);
CREATE INDEX IF NOT EXISTS idx_external_listings_source_listing_id ON external_listings(source_id, source_listing_id);
CREATE INDEX IF NOT EXISTS idx_external_listings_source_url ON external_listings(source_url);
CREATE INDEX IF NOT EXISTS idx_external_listings_city ON external_listings(city);
CREATE INDEX IF NOT EXISTS idx_external_listings_first_seen_at ON external_listings(first_seen_at);

CREATE TABLE IF NOT EXISTS external_listing_events (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES external_listings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_external_listing_events_listing_id ON external_listing_events(listing_id);

CREATE TABLE IF NOT EXISTS external_listing_watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, listing_id),
  FOREIGN KEY(listing_id) REFERENCES external_listings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_external_listing_watchlist_user ON external_listing_watchlist(user_id);

CREATE TABLE IF NOT EXISTS external_listing_compare (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, listing_id),
  FOREIGN KEY(listing_id) REFERENCES external_listings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_external_listing_compare_user ON external_listing_compare(user_id);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  inactive_count INTEGER NOT NULL DEFAULT 0,
  error_log TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_reason TEXT,
  error_message TEXT,
  parent_job_id TEXT,
  FOREIGN KEY(source_id) REFERENCES external_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_source_id ON import_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_started_at ON import_jobs(started_at);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status_started_at ON import_jobs(status, started_at);

CREATE TABLE IF NOT EXISTS market_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  city TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_market_alerts_created_at ON market_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_market_alerts_type_city ON market_alerts(alert_type, city);
CREATE INDEX IF NOT EXISTS idx_market_alerts_is_read ON market_alerts(is_read);

CREATE TABLE IF NOT EXISTS external_alert_rules (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_alert_rules_agency_id ON external_alert_rules(agency_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_agency_id ON activities(agency_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  action_url TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  license_number TEXT,
  specialization_json TEXT NOT NULL,
  commission_rate REAL,
  target_properties INTEGER,
  target_clients INTEGER,
  status TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_agency_id ON agents(agency_id);

CREATE TABLE IF NOT EXISTS portal_integrations (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  portal TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  credentials_json TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  last_import_at TEXT,
  last_import_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portal_integrations_agency_id ON portal_integrations(agency_id);

CREATE TABLE IF NOT EXISTS portal_import_jobs (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  portal TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  listings_imported INTEGER NOT NULL DEFAULT 0,
  new_listings INTEGER NOT NULL DEFAULT 0,
  price_changes INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portal_import_jobs_agency_id ON portal_import_jobs(agency_id);

CREATE TABLE IF NOT EXISTS publication_jobs (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  portal TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TEXT,
  published_at TEXT,
  portal_listing_id TEXT,
  portal_url TEXT,
  response_json TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_agency_id ON publication_jobs(agency_id);

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  prompt_version TEXT,
  source_snapshot_json TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_agency_entity ON ai_runs(agency_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_feature_status ON ai_runs(feature, status);

CREATE TABLE IF NOT EXISTS ai_entity_insights (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT,
  key_points_json TEXT,
  open_issues_json TEXT,
  next_best_action TEXT,
  next_best_action_reason TEXT,
  next_best_action_priority TEXT,
  next_best_action_due_in_hours INTEGER,
  win_probability REAL,
  win_probability_reason TEXT,
  confidence REAL,
  signals_json TEXT,
  source_snapshot_json TEXT,
  generated_at TEXT NOT NULL,
  generated_by_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (agency_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_insights_agency_entity ON ai_entity_insights(agency_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS ai_feedback (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  ai_run_id TEXT NOT NULL,
  profile_id TEXT,
  feedback_type TEXT NOT NULL,
  feedback_note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_run_id ON ai_feedback(ai_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_agency_id ON ai_feedback(agency_id);

CREATE TABLE IF NOT EXISTS document_usage_logs (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_usage_logs_agency_type ON document_usage_logs(agency_id, document_type);
CREATE INDEX IF NOT EXISTS idx_document_usage_logs_created_at ON document_usage_logs(created_at);
`);

const hasColumn = (tableName, columnName) => {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
};

const ensureColumn = (tableName, columnName, sqlTypeWithConstraints) => {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlTypeWithConstraints}`);
  }
};

ensureColumn('documents', 'document_type', 'TEXT');
ensureColumn('documents', 'template_key', 'TEXT');
ensureColumn('documents', 'template_version', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('documents', 'transaction_id', 'TEXT');
ensureColumn('documents', 'created_by', 'TEXT');
ensureColumn('documents', 'file_url', 'TEXT');
ensureColumn('documents', 'storage_key', 'TEXT');
ensureColumn('documents', 'output_format', "TEXT NOT NULL DEFAULT 'pdf'");
ensureColumn('documents', 'category', 'TEXT');
ensureColumn('documents', 'generated_payload_snapshot_json', 'TEXT');
ensureColumn('documents', 'renderer_key', "TEXT NOT NULL DEFAULT 'html-base'");

db.exec('CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);');
db.exec('CREATE INDEX IF NOT EXISTS idx_documents_transaction_id ON documents(transaction_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);');

ensureColumn('transaction_checklist_items', 'item_key', 'TEXT');
ensureColumn('transaction_checklist_items', 'is_required', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('transaction_checklist_items', 'completed_at', 'TEXT');
ensureColumn('transaction_checklist_items', 'completed_by', 'TEXT');
ensureColumn('transaction_checklist_items', 'linked_document_id', 'TEXT');
ensureColumn('transaction_checklist_items', 'notes', 'TEXT');
ensureColumn('import_jobs', 'retry_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('import_jobs', 'error_reason', 'TEXT');
ensureColumn('import_jobs', 'error_message', 'TEXT');
ensureColumn('import_jobs', 'parent_job_id', 'TEXT');

ensureColumn('transactions', 'ai_win_probability', 'REAL');
ensureColumn('transactions', 'ai_score_updated_at', 'TEXT');
ensureColumn('transactions', 'ai_score_reason', 'TEXT');

ensureColumn('ai_entity_insights', 'summary', 'TEXT');
ensureColumn('ai_entity_insights', 'key_points_json', 'TEXT');
ensureColumn('ai_entity_insights', 'open_issues_json', 'TEXT');
ensureColumn('ai_entity_insights', 'next_best_action', 'TEXT');
ensureColumn('ai_entity_insights', 'next_best_action_reason', 'TEXT');
ensureColumn('ai_entity_insights', 'next_best_action_priority', 'TEXT');
ensureColumn('ai_entity_insights', 'next_best_action_due_in_hours', 'INTEGER');
ensureColumn('ai_entity_insights', 'win_probability', 'REAL');
ensureColumn('ai_entity_insights', 'win_probability_reason', 'TEXT');
ensureColumn('ai_entity_insights', 'confidence', 'REAL');
ensureColumn('ai_entity_insights', 'signals_json', 'TEXT');
ensureColumn('ai_entity_insights', 'source_snapshot_json', 'TEXT');
ensureColumn('ai_entity_insights', 'generated_at', 'TEXT');
ensureColumn('ai_entity_insights', 'generated_by_run_id', 'TEXT');

ensureColumn('users', 'last_seen_at', 'TEXT');

db.exec('CREATE INDEX IF NOT EXISTS idx_transaction_checklist_item_key ON transaction_checklist_items(item_key);');
db.exec('CREATE INDEX IF NOT EXISTS idx_transaction_checklist_linked_document ON transaction_checklist_items(linked_document_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_ai_score ON transactions(agency_id, ai_win_probability DESC);');

const nowIso = new Date().toISOString();
for (const definition of DOCUMENT_DEFINITIONS) {
  db.prepare(`
    INSERT INTO document_type_registry (
      key, name, category, template_key, active_template_version, required_fields_json,
      output_format, enabled, description, linked_client, linked_property, linked_transaction,
      legacy_type, numbering_code, created_at, updated_at
    ) VALUES (
      @key, @name, @category, @template_key, @active_template_version, @required_fields_json,
      @output_format, @enabled, @description, @linked_client, @linked_property, @linked_transaction,
      @legacy_type, @numbering_code, @created_at, @updated_at
    )
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      template_key = excluded.template_key,
      active_template_version = excluded.active_template_version,
      required_fields_json = excluded.required_fields_json,
      output_format = excluded.output_format,
      enabled = excluded.enabled,
      description = excluded.description,
      linked_client = excluded.linked_client,
      linked_property = excluded.linked_property,
      linked_transaction = excluded.linked_transaction,
      legacy_type = excluded.legacy_type,
      numbering_code = excluded.numbering_code,
      updated_at = excluded.updated_at
  `).run({
    key: definition.key,
    name: definition.name,
    category: definition.category,
    template_key: definition.templateKey,
    active_template_version: definition.templateVersion,
    required_fields_json: JSON.stringify(definition.requiredFields || []),
    output_format: definition.outputFormat || 'pdf',
    enabled: definition.enabled ? 1 : 0,
    description: definition.description || null,
    linked_client: definition.linkedClient ? 1 : 0,
    linked_property: definition.linkedProperty ? 1 : 0,
    linked_transaction: definition.linkedTransaction ? 1 : 0,
    legacy_type: definition.legacyType || null,
    numbering_code: definition.numberingCode || 'DOC',
    created_at: nowIso,
    updated_at: nowIso,
  });

  db.prepare(`
    INSERT INTO document_template_versions (
      id, document_type_key, template_key, template_version, renderer_key, is_active, notes, created_at, updated_at
    ) VALUES (
      @id, @document_type_key, @template_key, @template_version, @renderer_key, @is_active, @notes, @created_at, @updated_at
    )
    ON CONFLICT(document_type_key, template_key, template_version) DO UPDATE SET
      renderer_key = excluded.renderer_key,
      is_active = excluded.is_active,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run({
    id: `${definition.key}-v${definition.templateVersion}`,
    document_type_key: definition.key,
    template_key: definition.templateKey,
    template_version: definition.templateVersion,
    renderer_key: 'html-base',
    is_active: 1,
    notes: 'Seeded template version',
    created_at: nowIso,
    updated_at: nowIso,
  });
}

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const hasAgencies = db.prepare('SELECT COUNT(1) as count FROM agencies').get();
if (!hasAgencies || hasAgencies.count === 0) {
  const seedNow = new Date().toISOString();
  const agencyId = 'agency-1';
  db.prepare(`
    INSERT INTO agencies (
      id, name, nip, regon, address, city, zip_code, phone, email,
      website, license_number, settings_json, created_at, updated_at
    ) VALUES (
      @id, @name, @nip, @regon, @address, @city, @zip_code, @phone, @email,
      @website, @license_number, @settings_json, @created_at, @updated_at
    )
  `).run({
    id: agencyId,
    name: 'MW Partner Michał Walenkiewicz Partnership',
    nip: '615-19-45-090',
    regon: '123456789',
    address: 'ul. 10 Lutego 16',
    city: 'Gdynia',
    zip_code: '81-364',
    phone: '+48 516 949 612',
    email: 'kontakt@mwpartner.pl',
    website: 'https://mwpartner.pl',
    license_number: '1234/2024',
    settings_json: JSON.stringify({
      defaultDocumentTemplate: 'standard',
      documentNumberPrefix: true,
      autoPublishListings: false,
      notificationEmail: 'kontakt@mwpartner.pl',
      primaryColor: '#2563eb',
    }),
    created_at: seedNow,
    updated_at: seedNow,
  });

  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@mwpanel.local';
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !bootstrapPassword) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required to initialize the first admin in production.');
  }

  const password = bootstrapPassword || randomBytes(24).toString('base64url');
  const userId = 'user-admin-1';
  const profileId = 'profile-admin-1';

  db.prepare(`
    INSERT INTO users (
      id, agency_id, email, password_hash, role, status, profile_id, last_login_at, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @email, @password_hash, @role, @status, @profile_id, @last_login_at, @created_at, @updated_at
    )
  `).run({
    id: userId,
    agency_id: agencyId,
    email: bootstrapEmail,
    password_hash: hashPassword(password),
    role: 'admin',
    status: 'active',
    profile_id: profileId,
    last_login_at: null,
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO profiles (
      id, user_id, first_name, last_name, phone, avatar, cover, address, city, zip_code, country, created_at, updated_at
    ) VALUES (
      @id, @user_id, @first_name, @last_name, @phone, @avatar, @cover, @address, @city, @zip_code, @country, @created_at, @updated_at
    )
  `).run({
    id: profileId,
    user_id: userId,
    first_name: 'Admin',
    last_name: 'System',
    phone: null,
    avatar: null,
    cover: null,
    address: null,
    city: null,
    zip_code: null,
    country: 'Poland',
    created_at: seedNow,
    updated_at: seedNow,
  });

  if (!bootstrapPassword) {
    console.warn('Bootstrap admin created with random password. Set BOOTSTRAP_ADMIN_PASSWORD explicitly in non-production environments.');
  }
}



const buildExternalSourceConfig = (code, mode, env = process.env) => {
  const envKey = `EXTERNAL_SOURCE_${code.toUpperCase()}_SEARCH_URLS`;
  const raw = env[envKey] || '';
  const searchUrls = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const base = {
    mode,
    maxPages: mode === 'html_browser' ? 2 : 3,
    requestDelayMs: mode === 'html_browser' ? 2500 : 1800,
    timeoutMs: mode === 'html_browser' ? 25000 : 15000,
  };
  if (searchUrls.length > 0) return { ...base, searchUrls };
  return base;
};

const ensureExternalSource = ({ id, name, code, base_url, mode }) => {
  const now = new Date().toISOString();
  const fbEnabled = String(process.env.EXTERNAL_SOURCE_FACEBOOK_ENABLED || '0') === '1';
  const isActive = code === 'facebook' ? (fbEnabled ? 1 : 0) : 1;
  const existing = db.prepare('SELECT id, config_json FROM external_sources WHERE code = ? LIMIT 1').get(code);
  if (!existing) {
    db.prepare(`INSERT INTO external_sources (
      id, name, code, base_url, is_active, config_json, last_sync_at, last_status, last_error, created_at, updated_at
    ) VALUES (
      @id, @name, @code, @base_url, @is_active, @config_json, @last_sync_at, @last_status, @last_error, @created_at, @updated_at
    )`).run({
      id,
      name,
      code,
      base_url,
      is_active: isActive,
      config_json: JSON.stringify(buildExternalSourceConfig(code, mode)),
      last_sync_at: null,
      last_status: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    });
    return;
  }

  let parsed = null;
  try { parsed = JSON.parse(existing.config_json || 'null'); } catch { parsed = null; }
  const shouldOverride = !parsed || parsed.mode === 'mock_feed';
  if (shouldOverride) {
    db.prepare('UPDATE external_sources SET base_url = ?, is_active = ?, config_json = ?, updated_at = ? WHERE code = ?')
      .run(base_url, isActive, JSON.stringify(buildExternalSourceConfig(code, mode)), now, code);
  }
};

const hasExternalSources = db.prepare('SELECT COUNT(1) as count FROM external_sources').get();
if (!hasExternalSources || hasExternalSources.count === 0) {
  const seedNow = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO external_sources (
      id, name, code, base_url, is_active, config_json, last_sync_at, last_status, last_error, created_at, updated_at
    ) VALUES (
      @id, @name, @code, @base_url, @is_active, @config_json, @last_sync_at, @last_status, @last_error, @created_at, @updated_at
    )
  `);

  [
    { id: 'src-otodom', name: 'Otodom', code: 'otodom', base_url: 'https://www.otodom.pl' },
    { id: 'src-olx', name: 'OLX Nieruchomości', code: 'olx', base_url: 'https://www.olx.pl' },
    { id: 'src-gratka', name: 'Gratka', code: 'gratka', base_url: 'https://gratka.pl' },
    { id: 'src-morizon', name: 'Morizon', code: 'morizon', base_url: 'https://www.morizon.pl' },
    { id: 'src-domiporta', name: 'Domiporta', code: 'domiporta', base_url: 'https://www.domiporta.pl' },
    { id: 'src-facebook', name: 'Facebook Marketplace', code: 'facebook', base_url: 'https://www.facebook.com' },
  ].forEach((source) => {
    stmt.run({
      ...source,
      is_active: 1,
      config_json: JSON.stringify({ mode: 'mock_feed', note: 'Use official API/feed when available; HTML parsing as last-resort fallback.' }),
      last_sync_at: null,
      last_status: null,
      last_error: null,
      created_at: seedNow,
      updated_at: seedNow,
    });
  });
}

// Ensure external sources exist and switch to HTML scraping by default when mock config is detected
[
  { id: 'src-otodom', name: 'Otodom', code: 'otodom', base_url: 'https://www.otodom.pl', mode: 'html_public' },
  { id: 'src-olx', name: 'OLX Nieruchomości', code: 'olx', base_url: 'https://www.olx.pl', mode: 'html_public' },
  { id: 'src-gratka', name: 'Gratka', code: 'gratka', base_url: 'https://gratka.pl', mode: 'html_public' },
  { id: 'src-morizon', name: 'Morizon', code: 'morizon', base_url: 'https://www.morizon.pl', mode: 'html_public' },
  { id: 'src-domiporta', name: 'Domiporta', code: 'domiporta', base_url: 'https://www.domiporta.pl', mode: 'html_public' },
  { id: 'src-facebook', name: 'Facebook Marketplace', code: 'facebook', base_url: 'https://www.facebook.com', mode: 'html_browser' },
].forEach(ensureExternalSource);

const hasClients = db.prepare('SELECT COUNT(1) as count FROM clients').get();
if (!hasClients || hasClients.count === 0) {
  const seedNow = new Date().toISOString();

  db.prepare(`
    INSERT INTO clients (
      id, agency_id, assigned_agent_id, profile_id, type, status, source, notes,
      preferences_json, tags_json, properties_count, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @assigned_agent_id, @profile_id, @type, @status, @source, @notes,
      @preferences_json, @tags_json, @properties_count, @created_at, @updated_at
    )
  `).run({
    id: '1',
    agency_id: 'agency-1',
    assigned_agent_id: '1',
    profile_id: null,
    type: 'buyer',
    status: 'active',
    source: 'website',
    notes: null,
    preferences_json: JSON.stringify({
      locations: ['Warszawa'],
      priceMin: 500000,
      priceMax: 800000,
    }),
    tags_json: JSON.stringify(['glowne', 'gotowka']),
    properties_count: 3,
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO clients (
      id, agency_id, assigned_agent_id, profile_id, type, status, source, notes,
      preferences_json, tags_json, properties_count, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @assigned_agent_id, @profile_id, @type, @status, @source, @notes,
      @preferences_json, @tags_json, @properties_count, @created_at, @updated_at
    )
  `).run({
    id: '2',
    agency_id: 'agency-1',
    assigned_agent_id: '2',
    profile_id: null,
    type: 'seller',
    status: 'active',
    source: 'referral',
    notes: null,
    preferences_json: null,
    tags_json: JSON.stringify(['wazny']),
    properties_count: 1,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasProperties = db.prepare('SELECT COUNT(1) as count FROM properties').get();
if (!hasProperties || hasProperties.count === 0) {
  const seedNow = new Date().toISOString();

  db.prepare(`
    INSERT INTO properties (
      id, agency_id, address_json, property_type, market_type, area, plot_area, rooms,
      floors_json, year_built, building_type, condition_text, price, price_per_meter,
      ownership_status, description, features_json, media_json, coordinates_json,
      created_at, updated_at
    ) VALUES (
      @id, @agency_id, @address_json, @property_type, @market_type, @area, @plot_area, @rooms,
      @floors_json, @year_built, @building_type, @condition_text, @price, @price_per_meter,
      @ownership_status, @description, @features_json, @media_json, @coordinates_json,
      @created_at, @updated_at
    )
  `).run({
    id: '1',
    agency_id: 'agency-1',
    address_json: JSON.stringify({
      street: 'Marszalkowska',
      buildingNumber: '10',
      apartmentNumber: '15',
      city: 'Warszawa',
      zipCode: '00-001',
      country: 'Poland',
    }),
    property_type: 'apartment',
    market_type: 'secondary',
    area: 55,
    plot_area: null,
    rooms: 2,
    floors_json: JSON.stringify({ total: 5, current: 4 }),
    year_built: 2010,
    building_type: 'Kamienica',
    condition_text: 'Do wykonczenia',
    price: 650000,
    price_per_meter: 11818,
    ownership_status: null,
    description: 'Przestronne 2-pokojowe mieszkanie w centrum miasta',
    features_json: JSON.stringify({
      balconies: 1,
      elevator: true,
      HeatingType: 'Miejskie',
    }),
    media_json: JSON.stringify([
      {
        id: 'm1',
        type: 'image',
        url: 'https://via.placeholder.com/800x600',
        order: 0,
        isPrimary: true,
      },
    ]),
    coordinates_json: JSON.stringify({ lat: 52.2297, lng: 21.0122 }),
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO properties (
      id, agency_id, address_json, property_type, market_type, area, plot_area, rooms,
      floors_json, year_built, building_type, condition_text, price, price_per_meter,
      ownership_status, description, features_json, media_json, coordinates_json,
      created_at, updated_at
    ) VALUES (
      @id, @agency_id, @address_json, @property_type, @market_type, @area, @plot_area, @rooms,
      @floors_json, @year_built, @building_type, @condition_text, @price, @price_per_meter,
      @ownership_status, @description, @features_json, @media_json, @coordinates_json,
      @created_at, @updated_at
    )
  `).run({
    id: '2',
    agency_id: 'agency-1',
    address_json: JSON.stringify({
      street: 'Dluga',
      buildingNumber: '25',
      city: 'Gdansk',
      zipCode: '80-001',
      country: 'Poland',
    }),
    property_type: 'house',
    market_type: 'secondary',
    area: 120,
    plot_area: null,
    rooms: 4,
    floors_json: JSON.stringify({ total: 2, current: 0 }),
    year_built: 2005,
    building_type: 'Wolnostojacy',
    condition_text: 'Bardzo dobry',
    price: 850000,
    price_per_meter: 7083,
    ownership_status: null,
    description: 'Dom w cichej okolicy z duzym ogrodkiem',
    features_json: JSON.stringify({
      balconies: 0,
      terraces: 1,
      garage: true,
      parkingSpaces: 2,
      basement: true,
      HeatingType: 'Gazowe',
    }),
    media_json: JSON.stringify([]),
    coordinates_json: null,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasListings = db.prepare('SELECT COUNT(1) as count FROM listings').get();
if (!hasListings || hasListings.count === 0) {
  const seedNow = new Date().toISOString();
  const properties = db.prepare('SELECT id, agency_id FROM properties ORDER BY created_at ASC LIMIT 2').all();
  const firstAgency = db.prepare('SELECT id FROM agencies ORDER BY created_at ASC LIMIT 1').get();
  const agent = db.prepare('SELECT id FROM agents ORDER BY created_at ASC LIMIT 1').get();

  if (properties.length > 0) {
    const insertListing = db.prepare(`
      INSERT INTO listings (
        id, property_id, agency_id, assigned_agent_id, client_id, listing_number, status,
        source, source_url, price, price_original, price_history_json, published_at,
        reserved_at, sold_at, views, inquiries, publication_status_json, notes, tags_json,
        created_at, updated_at
      ) VALUES (
        @id, @property_id, @agency_id, @assigned_agent_id, @client_id, @listing_number, @status,
        @source, @source_url, @price, @price_original, @price_history_json, @published_at,
        @reserved_at, @sold_at, @views, @inquiries, @publication_status_json, @notes, @tags_json,
        @created_at, @updated_at
      )
    `);

    properties.forEach((prop, idx) => {
      const price = idx === 0 ? 650000 : 850000;
      insertListing.run({
        id: String(idx + 1),
        property_id: prop.id,
        agency_id: prop.agency_id || firstAgency?.id || 'agency-1',
        assigned_agent_id: agent?.id || null,
        client_id: null,
        listing_number: `MW/2025/${String(idx + 1).padStart(4, '0')}`,
        status: 'active',
        source: 'manual',
        source_url: null,
        price,
        price_original: null,
        price_history_json: JSON.stringify([{ price, currency: 'PLN', changedAt: seedNow }]),
        published_at: seedNow,
        reserved_at: null,
        sold_at: null,
        views: idx === 0 ? 156 : 89,
        inquiries: idx === 0 ? 12 : 5,
        publication_status_json: JSON.stringify({}),
        notes: null,
        tags_json: JSON.stringify(idx === 0 ? ['glowne', 'prezentacja'] : []),
        created_at: seedNow,
        updated_at: seedNow,
      });
    });
  }
}

const hasTasks = db.prepare('SELECT COUNT(1) as count FROM tasks').get();
if (!hasTasks || hasTasks.count === 0) {
  const seedNow = new Date().toISOString();

  db.prepare(`
    INSERT INTO tasks (
      id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
      title, description, priority, status, due_date, completed_at, tags_json,
      created_at, updated_at
    ) VALUES (
      @id, @agency_id, @assigned_to_id, @created_by, @client_id, @property_id, @listing_id,
      @title, @description, @priority, @status, @due_date, @completed_at, @tags_json,
      @created_at, @updated_at
    )
  `).run({
    id: '1',
    agency_id: 'agency-1',
    assigned_to_id: '1',
    created_by: '1',
    client_id: null,
    property_id: null,
    listing_id: null,
    title: 'Zadzwon do klienta - umowa',
    description: null,
    priority: 'high',
    status: 'todo',
    due_date: new Date(Date.now() + 86400000).toISOString(),
    completed_at: null,
    tags_json: JSON.stringify(['pilne']),
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO tasks (
      id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
      title, description, priority, status, due_date, completed_at, tags_json,
      created_at, updated_at
    ) VALUES (
      @id, @agency_id, @assigned_to_id, @created_by, @client_id, @property_id, @listing_id,
      @title, @description, @priority, @status, @due_date, @completed_at, @tags_json,
      @created_at, @updated_at
    )
  `).run({
    id: '2',
    agency_id: 'agency-1',
    assigned_to_id: '1',
    created_by: '2',
    client_id: '1',
    property_id: null,
    listing_id: null,
    title: 'Prezentacja mieszkania M/15',
    description: null,
    priority: 'medium',
    status: 'todo',
    due_date: new Date(Date.now() + 172800000).toISOString(),
    completed_at: null,
    tags_json: JSON.stringify([]),
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO tasks (
      id, agency_id, assigned_to_id, created_by, client_id, property_id, listing_id,
      title, description, priority, status, due_date, completed_at, tags_json,
      created_at, updated_at
    ) VALUES (
      @id, @agency_id, @assigned_to_id, @created_by, @client_id, @property_id, @listing_id,
      @title, @description, @priority, @status, @due_date, @completed_at, @tags_json,
      @created_at, @updated_at
    )
  `).run({
    id: '3',
    agency_id: 'agency-1',
    assigned_to_id: '2',
    created_by: '2',
    client_id: null,
    property_id: '2',
    listing_id: null,
    title: 'Zdjecia do nieruchomosci',
    description: null,
    priority: 'low',
    status: 'todo',
    due_date: null,
    completed_at: null,
    tags_json: JSON.stringify([]),
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasDocuments = db.prepare('SELECT COUNT(1) as count FROM documents').get();
if (!hasDocuments || hasDocuments.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO documents (
      id, agency_id, document_number, type, status, client_id, property_id, agent_id,
      title, content, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @document_number, @type, @status, @client_id, @property_id, @agent_id,
      @title, @content, @metadata_json, @created_at, @updated_at
    )
  `).run({
    id: 'seed-doc-1',
    agency_id: 'agency-1',
    document_number: 'UP/2026/0001',
    type: 'brokerage_agreement',
    status: 'draft',
    client_id: '1',
    property_id: '1',
    agent_id: '1',
    title: 'Umowa posrednictwa - seed',
    content: '',
    metadata_json: JSON.stringify({ source: 'seed' }),
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO document_versions (
      id, agency_id, document_id, document_number, document_type, title,
      version, status, hash, note, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @document_id, @document_number, @document_type, @title,
      @version, @status, @hash, @note, @created_at, @updated_at
    )
  `).run({
    id: 'seed-ver-1',
    agency_id: 'agency-1',
    document_id: 'seed-doc-1',
    document_number: 'UP/2026/0001',
    document_type: 'brokerage_agreement',
    title: 'Umowa posrednictwa - seed',
    version: 1,
    status: 'draft',
    hash: 'seedhash0001',
    note: 'Initial version',
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasEmailTemplates = db.prepare('SELECT COUNT(1) as count FROM email_templates').get();
if (!hasEmailTemplates || hasEmailTemplates.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO email_templates (
      id, agency_id, code, name, subject_template, html_template, text_template,
      is_active, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @code, @name, @subject_template, @html_template, @text_template,
      @is_active, @created_at, @updated_at
    )
  `).run({
    id: randomUUID(),
    agency_id: 'agency-1',
    code: 'document_send',
    name: 'Wysłanie dokumentu',
    subject_template: 'Przesyłamy dokument {{document_title}}',
    html_template: '<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5"><p>Dzień dobry {{client_name}},</p><p>Przesyłamy dokument: <strong>{{document_title}}</strong>.</p><p>Agent prowadzący: {{agent_name}} ({{agent_email}})</p><p>Pozdrawiamy,<br/>MWPanel</p></body></html>',
    text_template: 'Dzień dobry {{client_name}},\nPrzesyłamy dokument: {{document_title}}.\nKontakt: {{agent_name}} ({{agent_email}}).',
    is_active: 1,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasChatMessages = db.prepare('SELECT COUNT(1) as count FROM chat_messages').get();
if (!hasChatMessages || hasChatMessages.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO chat_messages (id, agency_id, author, message, created_at)
    VALUES (@id, @agency_id, @author, @message, @created_at)
  `).run({
    id: 'seed-chat-1',
    agency_id: 'agency-1',
    author: 'Anna',
    message: 'Nowy lead z Mokotowa, kto przejmuje?',
    created_at: seedNow,
  });
  db.prepare(`
    INSERT INTO chat_messages (id, agency_id, author, message, created_at)
    VALUES (@id, @agency_id, @author, @message, @created_at)
  `).run({
    id: 'seed-chat-2',
    agency_id: 'agency-1',
    author: 'Piotr',
    message: 'Przejmuje i oddzwonie do 15:00.',
    created_at: seedNow,
  });
}

const hasCallLogs = db.prepare('SELECT COUNT(1) as count FROM call_logs').get();
if (!hasCallLogs || hasCallLogs.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO call_logs (id, agency_id, client_name, summary, created_by, created_at)
    VALUES (@id, @agency_id, @client_name, @summary, @created_by, @created_at)
  `).run({
    id: 'seed-call-1',
    agency_id: 'agency-1',
    client_name: 'Jan Kowalski',
    summary: 'Ustalono prezentacje na piatek 17:00.',
    created_by: '1',
    created_at: seedNow,
  });
}

const hasCampaigns = db.prepare('SELECT COUNT(1) as count FROM campaigns').get();
if (!hasCampaigns || hasCampaigns.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO campaigns (id, agency_id, name, audience, status, created_at, updated_at)
    VALUES (@id, @agency_id, @name, @audience, @status, @created_at, @updated_at)
  `).run({
    id: 'seed-campaign-1',
    agency_id: 'agency-1',
    name: 'Follow-up po prezentacji',
    audience: 'Klienci po prezentacji',
    status: 'draft',
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasWorkflowRules = db.prepare('SELECT COUNT(1) as count FROM workflow_rules').get();
if (!hasWorkflowRules || hasWorkflowRules.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO workflow_rules (
      id, agency_id, name, trigger_event, action_text, active, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @name, @trigger_event, @action_text, @active, @created_at, @updated_at
    )
  `).run({
    id: 'seed-rule-1',
    agency_id: 'agency-1',
    name: 'Lead -> przypisz agenta',
    trigger_event: 'lead_created',
    action_text: 'assign_lowest_load_agent',
    active: 1,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasTransactions = db.prepare('SELECT COUNT(1) as count FROM transactions').get();
if (!hasTransactions || hasTransactions.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO transactions (
      id, agency_id, title, status, parties_json, milestones_json, payment_status_json, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @title, @status, @parties_json, @milestones_json, @payment_status_json, @created_at, @updated_at
    )
  `).run({
    id: 'seed-tx-1',
    agency_id: 'agency-1',
    title: 'Mokotow M3 - Jan Kowalski',
    status: 'negotiation',
    parties_json: JSON.stringify({ buyer: 'Jan Kowalski', seller: 'Anna Nowak', bank: 'Bank XYZ', notary: 'Kancelaria ABC' }),
    milestones_json: JSON.stringify({ preAgreementDate: null, mortgageDecisionDate: null, notaryDate: null }),
    payment_status_json: JSON.stringify({ advance: 'pending', deposit: 'pending' }),
    created_at: seedNow,
    updated_at: seedNow,
  });

  db.prepare(`
    INSERT INTO transaction_checklist_items (id, transaction_id, label, done, sort_order, created_at, updated_at)
    VALUES (@id, @transaction_id, @label, @done, @sort_order, @created_at, @updated_at)
  `).run({
    id: 'seed-tx-item-1',
    transaction_id: 'seed-tx-1',
    label: 'Umowa posrednictwa',
    done: 1,
    sort_order: 1,
    created_at: seedNow,
    updated_at: seedNow,
  });
  db.prepare(`
    INSERT INTO transaction_checklist_items (id, transaction_id, label, done, sort_order, created_at, updated_at)
    VALUES (@id, @transaction_id, @label, @done, @sort_order, @created_at, @updated_at)
  `).run({
    id: 'seed-tx-item-2',
    transaction_id: 'seed-tx-1',
    label: 'Negocjacje ceny',
    done: 0,
    sort_order: 2,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasReservations = db.prepare('SELECT COUNT(1) as count FROM reservations').get();
if (!hasReservations || hasReservations.count === 0) {
  const seedNow = new Date().toISOString();
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 2);
  startAt.setHours(17, 0, 0, 0);
  const endAt = new Date(startAt);
  endAt.setMinutes(endAt.getMinutes() + 60);

  db.prepare(`
    INSERT INTO reservations (
      id, agency_id, client_name, agent_name, listing_id, title, status, location, notes,
      start_at, end_at, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @client_name, @agent_name, @listing_id, @title, @status, @location, @notes,
      @start_at, @end_at, @created_at, @updated_at
    )
  `).run({
    id: 'seed-reservation-1',
    agency_id: 'agency-1',
    client_name: 'Jan Kowalski',
    agent_name: 'Anna',
    listing_id: '1',
    title: 'Prezentacja mieszkania Mokotow',
    status: 'scheduled',
    location: 'ul. Pulawska 45, Warszawa',
    notes: 'Potwierdzic telefonicznie dzien przed.',
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    created_at: seedNow,
    updated_at: seedNow,
  });
}


const hasAgents = db.prepare('SELECT COUNT(1) as count FROM agents').get();
if (!hasAgents || hasAgents.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO agents (
      id, user_id, agency_id, license_number, specialization_json,
      commission_rate, target_properties, target_clients, status, stats_json,
      created_at, updated_at
    ) VALUES (
      @id, @user_id, @agency_id, @license_number, @specialization_json,
      @commission_rate, @target_properties, @target_clients, @status, @stats_json,
      @created_at, @updated_at
    )
  `).run({
    id: 'agent-1',
    user_id: 'user-admin-1',
    agency_id: 'agency-1',
    license_number: '1234/2024',
    specialization_json: JSON.stringify(['Mieszkania', 'Domy']),
    commission_rate: 2.5,
    target_properties: 20,
    target_clients: 30,
    status: 'active',
    stats_json: JSON.stringify({ listingsCount: 12, clientsCount: 24, documentsCount: 45, dealsClosed: 8 }),
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasActivities = db.prepare('SELECT COUNT(1) as count FROM activities').get();
if (!hasActivities || hasActivities.count === 0) {
  const seedNow = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO activities (
      id, agency_id, user_id, type, entity_type, entity_id, entity_name,
      description, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @user_id, @type, @entity_type, @entity_id, @entity_name,
      @description, @metadata_json, @created_at, @updated_at
    )
  `);
  stmt.run({
    id: 'seed-activity-1',
    agency_id: 'agency-1',
    user_id: 'user-admin-1',
    type: 'client_created',
    entity_type: 'client',
    entity_id: '1',
    entity_name: 'Anna Nowak',
    description: 'Utworzono klienta',
    metadata_json: JSON.stringify({}),
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasNotifications = db.prepare('SELECT COUNT(1) as count FROM notifications').get();
if (!hasNotifications || hasNotifications.count === 0) {
  const seedNow = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO notifications (
      id, user_id, agency_id, type, title, message, read, read_at, action_url, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @user_id, @agency_id, @type, @title, @message, @read, @read_at, @action_url, @metadata_json, @created_at, @updated_at
    )
  `);
  stmt.run({
    id: 'seed-notification-1',
    user_id: 'user-admin-1',
    agency_id: 'agency-1',
    type: 'new_lead',
    title: 'Nowy lead',
    message: 'Otrzymano nowe zapytanie z formularza na stronie',
    read: 0,
    read_at: null,
    action_url: null,
    metadata_json: JSON.stringify({}),
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasPortalIntegrations = db.prepare('SELECT COUNT(1) as count FROM portal_integrations').get();
if (!hasPortalIntegrations || hasPortalIntegrations.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO portal_integrations (
      id, agency_id, portal, is_active, credentials_json, settings_json,
      last_import_at, last_import_status, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @portal, @is_active, @credentials_json, @settings_json,
      @last_import_at, @last_import_status, @created_at, @updated_at
    )
  `).run({
    id: 'portal-otodom-1',
    agency_id: 'agency-1',
    portal: 'otodom',
    is_active: 0,
    credentials_json: JSON.stringify({}),
    settings_json: JSON.stringify({ autoImport: false, autoPublish: false, importInterval: 60 }),
    last_import_at: null,
    last_import_status: null,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasPortalImportJobs = db.prepare('SELECT COUNT(1) as count FROM portal_import_jobs').get();
if (!hasPortalImportJobs || hasPortalImportJobs.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO portal_import_jobs (
      id, agency_id, portal, status, started_at, completed_at, listings_imported,
      new_listings, price_changes, errors, error_message, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @portal, @status, @started_at, @completed_at, @listings_imported,
      @new_listings, @price_changes, @errors, @error_message, @created_at, @updated_at
    )
  `).run({
    id: 'seed-import-job-1',
    agency_id: 'agency-1',
    portal: 'otodom',
    status: 'completed',
    started_at: seedNow,
    completed_at: seedNow,
    listings_imported: 12,
    new_listings: 3,
    price_changes: 1,
    errors: 0,
    error_message: null,
    created_at: seedNow,
    updated_at: seedNow,
  });
}

const hasPublicationJobs = db.prepare('SELECT COUNT(1) as count FROM publication_jobs').get();
if (!hasPublicationJobs || hasPublicationJobs.count === 0) {
  const seedNow = new Date().toISOString();
  db.prepare(`
    INSERT INTO publication_jobs (
      id, agency_id, listing_id, portal, status, attempt, max_attempts, next_attempt_at,
      published_at, portal_listing_id, portal_url, response_json, error_json, created_at, updated_at
    ) VALUES (
      @id, @agency_id, @listing_id, @portal, @status, @attempt, @max_attempts, @next_attempt_at,
      @published_at, @portal_listing_id, @portal_url, @response_json, @error_json, @created_at, @updated_at
    )
  `).run({
    id: 'seed-publication-1',
    agency_id: 'agency-1',
    listing_id: '1',
    portal: 'otodom',
    status: 'published',
    attempt: 1,
    max_attempts: 3,
    next_attempt_at: null,
    published_at: seedNow,
    portal_listing_id: 'otodom-123',
    portal_url: 'https://otodom.pl/oferta/otodom-123',
    response_json: JSON.stringify({ statusCode: 200, message: 'OK' }),
    error_json: null,
    created_at: seedNow,
    updated_at: seedNow,
  });
}
