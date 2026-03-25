-- Analytics extensions for market_offers (Supabase/PostgreSQL)
alter table if exists public.market_offers
  add column if not exists country text,
  add column if not exists voivodeship text,
  add column if not exists district text,
  add column if not exists property_type text,
  add column if not exists market_type text,
  add column if not exists postal_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists image_url text,
  add column if not exists price_per_m2 numeric(14,2),
  add column if not exists market_median_price_per_m2 numeric(14,2),
  add column if not exists opportunity_score numeric(8,2),
  add column if not exists is_opportunity boolean not null default false,
  add column if not exists opportunity_level text not null default 'normal';

create index if not exists idx_market_offers_country_city on public.market_offers(country, city);
create index if not exists idx_market_offers_created_at on public.market_offers(created_at desc);
create index if not exists idx_market_offers_opportunity on public.market_offers(is_opportunity, created_at desc);

-- Optional hard DB guard (uncomment to enforce strictly at DB level)
-- alter table public.market_offers add constraint chk_market_offers_country_pl check (country = 'PL');
