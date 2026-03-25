insert into public.market_offers (
  external_id, title, price, currency, area_m2, city, voivodeship, country, source, url, image_url, created_at,
  property_type, market_type, price_per_m2, market_median_price_per_m2, opportunity_score, is_opportunity, opportunity_level
) values
('ext-test-1','Mieszkanie 58m² centrum',420000,'PLN',58,'Zgorzelec','dolnośląskie','PL','OLX','https://example.com/1','https://picsum.photos/300/200',now() - interval '1 hour','flat','secondary',7241.38,8300,12.75,true,'opportunity'),
('ext-test-2','Mieszkanie 61m² po remoncie',399000,'PLN',61,'Zgorzelec','dolnośląskie','PL','Otodom','https://example.com/2','https://picsum.photos/301/200',now() - interval '2 hour','flat','secondary',6540.98,8200,20.23,true,'strong_opportunity')
on conflict do nothing;

insert into public.market_alerts (alert_type, city, title, description, severity, metadata)
values
('new_offers_spike','zgorzelec','Wzrost liczby ofert','W ciągu 24h dodano 12 nowych ofert','medium','{"count24h":12}'::jsonb),
('new_opportunity','zgorzelec','Nowe okazje inwestycyjne','Wykryto 3 mocne okazje','high','{"count":3}'::jsonb)
on conflict do nothing;
