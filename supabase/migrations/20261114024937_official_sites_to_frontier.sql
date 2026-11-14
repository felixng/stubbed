-- Move every official site to the two lanes proven in C3 (#545, epic #536, step C4). Data only: if the gate fails the
-- rollback is one migration. Sites in needs_attention move too and stay parked (the setup lane skips them as the old
-- engine did). Venues with no site now belong to the setup lane, so the AI discovery of new sites has one home.
update public.crawl_sites set engine = 'frontier' where engine = 'legacy';
alter table public.crawl_sites alter column engine set default 'frontier';

-- The legacy lane now only takes venues whose site is explicitly legacy (copied whole from 20261114005352_official_site_engine.sql).
create or replace function public.crawl_work(batch_size integer default 25) returns jsonb
language sql security definer set search_path = '' as $$
with ranked as (
 select v.id,v.name,v.city,v.country,v.website,v.wikidata_id,v.whats_on_url,v.crawl_site_id,v.website_source,v.whats_on_source,
   row_number() over(partition by coalesce(v.crawl_site_id,v.id) order by (select count(*) from public.entries e where e.venue_id=v.id) desc,v.id) as site_rank,
   (select count(*) from public.entries e where e.venue_id=v.id) as entry_count,
   v.circuit in ('west_end','broadway') as major
 from public.venues v left join public.crawl_sites s on s.id=v.crawl_site_id
 where v.crawl_attempts < 3 and (v.crawl_attempt_at is null or v.crawl_attempt_at < now()-interval '1 day')
   and (s.id is null or (s.status <> 'needs_attention' and (s.last_crawled_at is null or s.last_crawled_at < now()-interval '7 days' or s.archive_status <> 'done' or s.status <> 'ready')))
   and (s.id is not null and s.engine = 'legacy')
)
select coalesce(jsonb_agg(to_jsonb(x) - 'site_rank' order by x.entry_count desc,x.major desc nulls last,x.name), '[]'::jsonb)
from (select * from ranked where site_rank=1 order by entry_count desc,major desc nulls last,name limit least(greatest(batch_size,0),100)) x;
$$;

-- The setup lane also takes venues with no site (copied whole from 20261114005352_official_site_engine.sql).
create or replace function public.crawl_setup_work(batch_size integer default 25) returns jsonb
language sql security definer set search_path = '' as $$
with ranked as (
 select v.id,v.name,v.city,v.country,v.website,v.wikidata_id,v.whats_on_url,v.crawl_site_id,v.website_source,v.whats_on_source,
   row_number() over(partition by coalesce(v.crawl_site_id,v.id) order by (select count(*) from public.entries e where e.venue_id=v.id) desc,v.id) as site_rank,
   (select count(*) from public.entries e where e.venue_id=v.id) as entry_count,
   v.circuit in ('west_end','broadway') as major
 from public.venues v left join public.crawl_sites s on s.id=v.crawl_site_id
 where (s.id is null and v.crawl_attempts < 3 and (v.crawl_attempt_at is null or v.crawl_attempt_at < now() - interval '1 day'))
   or (s.engine = 'frontier'
     and ((s.status = 'pending' and v.crawl_attempts < 3 and (v.crawl_attempt_at is null or v.crawl_attempt_at < now() - interval '1 day'))
       or (s.repair_requested_at is not null and s.status <> 'needs_attention')))
)
select coalesce(jsonb_agg(to_jsonb(x) - 'site_rank' order by x.entry_count desc,x.major desc nulls last,x.name), '[]'::jsonb)
from (select * from ranked where site_rank=1 order by entry_count desc,major desc nulls last,name limit least(greatest(batch_size,0),100)) x;
$$;
