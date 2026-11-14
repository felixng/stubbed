-- Split official-site work into two lanes behind a per-site switch (#544, epic #536, step C3).
-- crawl_sites.engine says which engine owns a site: 'legacy' (the old per-site loop) or 'frontier' (the page
-- queue reads its pages; the AI lane only sets up and repairs). Everything on 'legacy' keeps working as before.

alter table public.crawl_sites
  add column engine text not null default 'legacy' check (engine in ('legacy', 'frontier')),
  add column repair_requested_at timestamptz,
  add column repair_reason text;

-- The legacy lane no longer picks up frontier sites (copied whole from 20261106151245_crawl_loop.sql).
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
   and (s.id is null or s.engine = 'legacy')
)
select coalesce(jsonb_agg(to_jsonb(x) - 'site_rank' order by x.entry_count desc,x.major desc nulls last,x.name), '[]'::jsonb)
from (select * from ranked where site_rank=1 order by entry_count desc,major desc nulls last,name limit least(greatest(batch_size,0),100)) x;
$$;

-- The setup lane: frontier sites that need the AI lane (pending setup, or a repair requested by the reader).
create function public.crawl_setup_work(batch_size integer default 25) returns jsonb
language sql security definer set search_path = '' as $$
with ranked as (
 select v.id,v.name,v.city,v.country,v.website,v.wikidata_id,v.whats_on_url,v.crawl_site_id,v.website_source,v.whats_on_source,
   row_number() over(partition by coalesce(v.crawl_site_id,v.id) order by (select count(*) from public.entries e where e.venue_id=v.id) desc,v.id) as site_rank,
   (select count(*) from public.entries e where e.venue_id=v.id) as entry_count,
   v.circuit in ('west_end','broadway') as major
 from public.venues v left join public.crawl_sites s on s.id=v.crawl_site_id
 where v.crawl_site_id is not null and s.engine = 'frontier'
   and ((s.status = 'pending' and v.crawl_attempts < 3 and (v.crawl_attempt_at is null or v.crawl_attempt_at < now() - interval '1 day'))
     or (s.repair_requested_at is not null and s.status <> 'needs_attention'))
)
select coalesce(jsonb_agg(to_jsonb(x) - 'site_rank' order by x.entry_count desc,x.major desc nulls last,x.name), '[]'::jsonb)
from (select * from ranked where site_rank=1 order by entry_count desc,major desc nulls last,name limit least(greatest(batch_size,0),100)) x;
$$;
revoke execute on function public.crawl_setup_work(integer) from public, anon, authenticated;
grant execute on function public.crawl_setup_work(integer) to service_role;

-- A page that fails its extraction checks asks for a repair; it does not retry.
create function public.flag_official_site_repair(for_task uuid, flag_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  changed integer;
begin
  update public.crawl_sites s set repair_requested_at = coalesce(s.repair_requested_at, now()), repair_reason = left(flag_reason, 300)
  from public.crawl_tasks t join public.crawl_generations g on g.id = t.generation_id
  where t.id = for_task and s.id = g.site_id and s.engine = 'frontier' and s.status <> 'needs_attention';
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;
revoke execute on function public.flag_official_site_repair(uuid, text) from public, anon, authenticated;
grant execute on function public.flag_official_site_repair(uuid, text) to service_role;

-- Ready frontier sites that have no current generation yet.
create function public.official_sites_to_seed(batch_size integer default 25) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'whats_on_url', x.whats_on_url, 'archive_url', x.archive_url) order by x.updated_at), '[]'::jsonb)
  from (
    select s.id, s.whats_on_url, s.archive_url, s.updated_at from public.crawl_sites s
    where s.engine = 'frontier' and s.status = 'ready' and s.whats_on_url is not null and s.repair_requested_at is null
      and not exists (select 1 from public.crawl_generations g join public.crawl_sources o on o.id = g.source_id and o.source_key = 'official'
        where g.site_id = s.id and g.is_current)
    order by s.updated_at limit least(greatest(batch_size, 0), 100)
  ) x;
$$;
revoke execute on function public.official_sites_to_seed(integer) from public, anon, authenticated;
grant execute on function public.official_sites_to_seed(integer) to service_role;

-- One generation per site: the what's-on page and the archive's first page, both `venue`-stage tasks.
create function public.seed_official_site(for_site uuid, whats_on text, archive text, refresh boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  generation uuid;
begin
  generation := public.start_crawl_generation('official', for_site::text, 'venue', whats_on, for_site, refresh);
  if archive is not null then perform public.enqueue_crawl_task(generation, 'venue', archive); end if;
  update public.crawl_sites set repair_requested_at = null, repair_reason = null where id = for_site;
  return generation;
end;
$$;
revoke execute on function public.seed_official_site(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.seed_official_site(uuid, text, text, boolean) to service_role;

-- The canary: the three ready sites whose venues have the most logged entries (a no-op on an empty database).
update public.crawl_sites set engine = 'frontier' where id in (
  select s.id from public.crawl_sites s
  where s.status = 'ready' and s.whats_on_url is not null
  order by (select count(*) from public.entries e join public.venues v on v.id = e.venue_id
            where v.crawl_site_id = s.id and e.status = 'logged') desc, s.id
  limit 3);
