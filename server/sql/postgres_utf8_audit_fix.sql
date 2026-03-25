-- UTF-8 audit + repair script for PostgreSQL (production-safe sequence)
-- 1) Verify database/server/client encoding
SHOW SERVER_ENCODING;
SHOW CLIENT_ENCODING;

-- 2) UTF-8 probe row in DB (debug step)
CREATE TABLE IF NOT EXISTS public.utf8_probe (
  id BIGSERIAL PRIMARY KEY,
  probe_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.utf8_probe (probe_text)
VALUES ('Zarządzanie');

-- 3) Detect likely mojibake in a known business table/column set
SELECT id, name
FROM public.agencies
WHERE name ~ '(Ä|Å|Ã|â€|Â)';

-- 4) Fix known corrupted rows (example: agencies.name)
UPDATE public.agencies
SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8')
WHERE name ~ '(Ä|Å|Ã|â€|Â)';

-- 5) Bulk repair pass across all TEXT/VARCHAR columns in public schema
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = convert_from(convert_to(%I, ''LATIN1''), ''UTF8'') WHERE %I ~ ''(Ä|Å|Ã|â€|Â)''',
      r.table_schema, r.table_name, r.column_name, r.column_name, r.column_name
    );
  END LOOP;
END $$;

-- 6) Validation probe
SELECT id, probe_text, created_at
FROM public.utf8_probe
ORDER BY id DESC
LIMIT 5;
