-- Helper: recompute price_per_m2
update public.market_offers
set price_per_m2 = case when area_m2 is not null and area_m2 > 0 then round((price / area_m2)::numeric, 2) else null end
where country = 'PL';

-- Dashboard query: opportunities top 5
-- select * from public.market_offers
-- where country = 'PL' and is_opportunity = true
-- order by opportunity_score desc, created_at desc
-- limit 5;

-- Dashboard query: newest alerts top 5
-- select * from public.market_alerts
-- order by created_at desc
-- limit 5;

-- Heatmap data query
-- select city,
--        avg(price_per_m2) as avg_price_per_m2,
--        percentile_cont(0.5) within group (order by price_per_m2) as median_price_per_m2,
--        count(*) as offers_count,
--        count(*) filter (where is_opportunity) as opportunities_count
-- from public.market_offers
-- where country = 'PL' and price_per_m2 is not null
-- group by city
-- order by offers_count desc
-- limit 200;
