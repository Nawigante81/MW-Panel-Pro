create table if not exists public.market_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  city text,
  title text not null,
  description text not null,
  severity text not null check (severity in ('low','medium','high')),
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_market_alerts_created_at on public.market_alerts(created_at desc);
create index if not exists idx_market_alerts_type_city on public.market_alerts(alert_type, city);
