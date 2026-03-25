import { Pool } from 'pg';

export const isPostgresCoreEnabled = process.env.DB_DRIVER === 'postgres';

export const corePgPool = isPostgresCoreEnabled
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PG_SSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export const ensureCoreSchemaPostgres = async () => {
  if (!corePgPool) return;

  await corePgPool.query(`
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
      settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      profile_id TEXT,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_users_agency_id ON users(agency_id);

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      avatar TEXT,
      cover TEXT,
      address TEXT,
      city TEXT,
      zip_code TEXT,
      country TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      assigned_agent_id TEXT,
      profile_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT,
      notes TEXT,
      preferences_json JSONB,
      tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      properties_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      address_json JSONB NOT NULL,
      property_type TEXT NOT NULL,
      market_type TEXT NOT NULL,
      area DOUBLE PRECISION NOT NULL,
      plot_area DOUBLE PRECISION,
      rooms INTEGER,
      floors_json JSONB,
      year_built INTEGER,
      building_type TEXT,
      condition_text TEXT,
      price DOUBLE PRECISION NOT NULL,
      price_per_meter DOUBLE PRECISION,
      ownership_status TEXT,
      description TEXT,
      features_json JSONB,
      media_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      coordinates_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_properties_agency_id ON properties(agency_id);

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      assigned_agent_id TEXT,
      client_id TEXT,
      listing_number TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      price DOUBLE PRECISION NOT NULL,
      price_original DOUBLE PRECISION,
      price_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      published_at TIMESTAMPTZ,
      reserved_at TIMESTAMPTZ,
      sold_at TIMESTAMPTZ,
      views INTEGER NOT NULL DEFAULT 0,
      inquiries INTEGER NOT NULL DEFAULT 0,
      publication_status_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT,
      tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_listings_agency_id ON listings(agency_id);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      document_number TEXT NOT NULL,
      type TEXT NOT NULL,
      document_type TEXT,
      template_key TEXT,
      template_version INTEGER NOT NULL DEFAULT 1,
      transaction_id TEXT,
      created_by TEXT,
      file_url TEXT,
      storage_key TEXT,
      output_format TEXT NOT NULL DEFAULT 'pdf',
      category TEXT,
      generated_payload_snapshot_json JSONB,
      renderer_key TEXT NOT NULL DEFAULT 'html-base',
      status TEXT NOT NULL,
      client_id TEXT,
      property_id TEXT,
      agent_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pdf_url TEXT,
      sent_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_documents_agency_id ON documents(agency_id);

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      document_number TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      hash TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS document_usage_logs (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      document_type TEXT NOT NULL,
      user_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      assigned_to_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      client_id TEXT,
      property_id TEXT,
      listing_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      due_date TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      parties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      milestones_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      payment_status_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_win_probability DOUBLE PRECISION,
      ai_score_updated_at TIMESTAMPTZ,
      ai_score_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transaction_checklist_items (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      item_key TEXT,
      is_required INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ,
      completed_by TEXT,
      linked_document_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      read_at TIMESTAMPTZ,
      action_url TEXT,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agency_subscriptions (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL UNIQUE REFERENCES agencies(id),
      plan_code TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trial',
      seats_limit INTEGER NOT NULL DEFAULT 3,
      seats_used INTEGER NOT NULL DEFAULT 0,
      trial_ends_at TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      billing_email TEXT,
      stripe_customer_id TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_status ON agency_subscriptions(status);

    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL REFERENCES agencies(id),
      subscription_id TEXT REFERENCES agency_subscriptions(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'PLN',
      status TEXT NOT NULL DEFAULT 'recorded',
      external_ref TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_events_agency_id ON billing_events(agency_id);
    CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at);
  `);
};
