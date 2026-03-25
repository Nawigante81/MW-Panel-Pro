-- MWPanel: market offers widget source table (Supabase / PostgreSQL)
create table if not exists public.market_offers (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  title text not null,
  price numeric(14,2),
  currency text not null default 'PLN',
  area_m2 numeric(10,2),
  city text,
  source text not null,
  url text,
  created_at timestamptz not null default now(),
  imported_to_crm boolean not null default false
);

create unique index if not exists ux_market_offers_external_id on public.market_offers(external_id);
create index if not exists idx_market_offers_created_at_desc on public.market_offers(created_at desc);
create index if not exists idx_market_offers_imported_to_crm on public.market_offers(imported_to_crm);
