-- Extend market_offers for compact dashboard + PL-only policy
alter table if exists public.market_offers
  add column if not exists voivodeship text,
  add column if not exists country text,
  add column if not exists image_url text;

-- enforce PL only in this module
alter table if exists public.market_offers
  alter column country set default 'PL';

-- optional hard guard: only PL rows can be inserted
-- (uncomment if you want strict DB-level block)
-- alter table public.market_offers
--   add constraint chk_market_offers_country_pl check (country = 'PL');

create index if not exists idx_market_offers_country_created_at
  on public.market_offers(country, created_at desc);
