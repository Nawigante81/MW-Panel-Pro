import { Pool } from 'pg';

export const isPostgresEnabled = Boolean(process.env.DATABASE_URL);

export const pgPool = isPostgresEnabled
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PG_SSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export const ensureEmailSchemaPostgres = async () => {
  if (!pgPool) return;

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      subject_template TEXT NOT NULL,
      html_template TEXT NOT NULL,
      text_template TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (agency_id, code)
    );

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
      sent_at TIMESTAMPTZ,
      scheduled_at TIMESTAMPTZ,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_attachments (
      id TEXT PRIMARY KEY,
      email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
      document_id TEXT,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_email_templates_agency_code ON email_templates(agency_id, code);
    CREATE INDEX IF NOT EXISTS idx_email_messages_agency_id ON email_messages(agency_id);
    CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status);
    CREATE INDEX IF NOT EXISTS idx_email_messages_scheduled_at ON email_messages(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_email_messages_related_entity ON email_messages(related_entity_type, related_entity_id);
    CREATE INDEX IF NOT EXISTS idx_email_attachments_email_message_id ON email_attachments(email_message_id);
  `);
};
