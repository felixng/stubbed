-- The adapter file is the registry of a source's static facts (#540, epic #536). The database keeps
-- only switches and state. The worker copies display name, kind, hosts, pacing, authority and parser
-- version into crawl_sources at the start of every run (sync_crawl_source), so a new source or a
-- parser version bump needs no migration. New sources always arrive switched off.

alter table public.crawl_sources
  add column display_name text,
  add column kind text not null default 'aggregate' check (kind in ('aggregate', 'official')),
  add column authority smallint not null default 1 check (authority between 1 and 3);
update public.crawl_sources set display_name = 'London Theatre', kind = 'aggregate', authority = 2 where source_key = 'london_theatre';
update public.crawl_sources set display_name = 'Playbill', kind = 'aggregate', authority = 2 where source_key = 'playbill';
update public.crawl_sources set display_name = 'Official theatre sites', kind = 'official', authority = 3 where source_key = 'official';

create function public.sync_crawl_source(key text, name text, source_kind text, hosts text[],
  interval_ms integer, source_authority integer, version text)
returns void language plpgsql set search_path = '' as $$
begin
  if key is null or key !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'Invalid source key' using errcode = '22023'; end if;
  if source_authority is null or source_authority not between 1 and 3 then raise exception 'Invalid authority' using errcode = '22023'; end if;
  if interval_ms is null or interval_ms < 1000 then raise exception 'Invalid interval' using errcode = '22023'; end if;
  -- Switches (collection, publication), pauses, withdrawal and claim order are state, never written here.
  insert into public.crawl_sources (source_key, display_name, kind, allowed_hosts, min_interval_ms, authority, adapter_version)
  values (key, name, source_kind, coalesce(hosts, '{}'), interval_ms, source_authority, version)
  on conflict (source_key) do update set display_name = excluded.display_name, kind = excluded.kind,
    allowed_hosts = excluded.allowed_hosts, min_interval_ms = excluded.min_interval_ms,
    authority = excluded.authority, adapter_version = excluded.adapter_version;
end;
$$;
revoke all on function public.sync_crawl_source(text, text, text, text[], integer, integer, text) from public, anon, authenticated;
grant execute on function public.sync_crawl_source(text, text, text, text[], integer, integer, text) to service_role;

-- Authority now comes from the column (copied whole from 20261108130000_effective_runs_pushdown.sql).
create or replace view public.catalogue_effective_runs with (security_invoker = true) as
with active as (
  select e.*, s.authority,
    greatest(e.last_seen_at, case when t.parser_version = x.parser_version and t.content_hash = x.content_hash
      then t.last_success_at end) as seen_at,
    case when e.kind in ('cancelled','reopened') then 'status' else e.kind end as fact_group
  from public.crawl_run_evidence e
  join public.crawl_sources s on s.id = e.source_id and s.withdrawn_at is null
  left join public.crawl_extractions x on x.id = e.extraction_id
  left join public.crawl_tasks t on t.id = x.task_id
  where e.superseded_at is null and e.withdrawn_at is null and e.page_checked and e.venue_id is not null
    and (e.precision = 'day' or e.kind in ('cancelled','reopened'))
), ranked as (
  select active.*, dense_rank() over (partition by engagement_id, venue_id, fact_group order by authority desc) as precedence
  from active
), aggregated as (
  select engagement_id as id, venue_id,
    (array_agg(show_id order by authority desc, seen_at desc, id) filter (where show_id is not null))[1] as show_id,
    count(distinct show_id) as show_id_count,
    (array_agg(raw_title order by authority desc, seen_at desc, id))[1] as title,
    (array_agg(legacy_run_id) filter (where legacy_run_id is not null))[1] as legacy_run_id,
    min(on_date) filter (where kind in ('start','preview')) as first_attendance,
    min(on_date) filter (where kind = 'opening') as opening_date,
    min(on_date) filter (where kind = 'preview') as preview_date,
    min(on_date) filter (where kind = 'closing') as closing_date,
    min(on_date) filter (where kind = 'booking_until') as booking_until,
    min(on_date) filter (where kind = 'end') as scheduled_end,
    coalesce(array_agg(distinct on_date order by on_date) filter (where kind = 'performance'), '{}') as performance_dates,
    coalesce(array_agg(distinct on_date order by on_date) filter (where kind = 'exception'), '{}') as exception_dates,
    bool_or(kind = 'cancelled') as cancelled,
    count(distinct kind) filter (where fact_group = 'status') > 1
      or count(distinct on_date) filter (where kind = 'start') > 1
      or count(distinct on_date) filter (where kind = 'preview') > 1
      or count(distinct on_date) filter (where kind = 'opening') > 1
      or count(distinct on_date) filter (where kind = 'closing') > 1
      or count(distinct on_date) filter (where kind = 'booking_until') > 1
      or count(distinct on_date) filter (where kind = 'end') > 1 as conflicting_facts,
    max(seen_at) as last_observed_at,
    max(seen_at) filter (where kind in ('start','preview','opening')) as start_seen_at,
    max(seen_at) filter (where kind = 'closing') as closing_seen_at
  from ranked where precedence = 1
  group by engagement_id, venue_id
), resolved as (
  select *, coalesce(first_attendance, opening_date, performance_dates[1]) as start_date
  from aggregated
), bounded as not materialized (
  select *, coalesce(closing_date, booking_until, scheduled_end) as proposed_end,
    conflicting_facts or show_id_count > 1
      or coalesce(closing_date < start_date, false)
      or coalesce(booking_until < start_date, false)
      or coalesce(scheduled_end < start_date, false) as conflict
  from resolved where start_date is not null
), catalogue as (
select id, venue_id, case when show_id_count = 1 then show_id end as show_id, title, start_date,
  preview_date, opening_date,
  case when not conflict then closing_date end as confirmed_end_date,
  case when not conflict then booking_until end as booking_until,
  case when not conflict then scheduled_end end as scheduled_end_date,
  case when not conflict and cardinality(performance_dates) = 0 then proposed_end end as support_end_date,
  performance_dates, exception_dates, cancelled, conflict as conflicting, last_observed_at, false as legacy,
  case
    when cancelled then 'cancelled'
    when conflict then 'conflicting_evidence'
    when show_id_count <> 1 then 'show_unresolved'
    when closing_date is null then 'no_confirmed_closing'
    when cardinality(performance_dates) > 0 or cardinality(exception_dates) > 0 then 'specific_dates_only'
    when closing_date >= current_date and
      (least(start_seen_at, closing_seen_at) < now() - interval '7 days' or start_seen_at is null) then 'stale'
    else 'eligible'
  end as autofill_reason
from bounded
union all
select r.id, r.venue_id, r.show_id, r.title, r.start_date, null::date, null::date,
  null::date, null::date, r.end_date, r.end_date, '{}'::date[], '{}'::date[], false, false, r.last_seen_at,
  true, 'legacy_unknown'
from public.runs r where not exists (select 1 from bounded b where b.legacy_run_id = r.id)
  and not exists (select 1 from public.crawl_sources s where s.source_key = 'official' and s.withdrawn_at is not null)
)
select catalogue.*, autofill_reason = 'eligible' as autofill_eligible from catalogue;

alter table public.venue_aliases drop constraint venue_aliases_source_check;
alter table public.venue_aliases add constraint venue_aliases_source_check check (source ~ '^[a-z][a-z0-9_]*$');

create or replace function public.record_venue_alias(for_venue uuid, label text, alias_kind text, alias_source text)
returns void language plpgsql set search_path = '' as $$
declare
  trimmed text := left(nullif(btrim(label), ''), 200);
begin
  if trimmed is null or char_length(trimmed) < 2 then return; end if;
  if exists (select 1 from public.venues v where v.id = for_venue
    and public.normalise_search_text(v.name) = public.normalise_search_text(trimmed)) then return; end if;
  insert into public.venue_aliases (venue_id, alias, kind, source, created_by)
  values (for_venue, trimmed, alias_kind,
    case when alias_source in ('osm', 'admin', 'merge')
      or exists (select 1 from public.crawl_sources cs where cs.source_key = alias_source) then alias_source else 'admin' end,
    null)
  on conflict (venue_id, search_text) do nothing;
end;
$$;

create function public.admin_crawl_sources()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('source_key', s.source_key, 'display_name', coalesce(s.display_name, s.source_key),
      'kind', s.kind, 'collection_enabled', s.collection_enabled, 'publication_enabled', s.publication_enabled)
      order by (s.kind = 'official'), coalesce(s.display_name, s.source_key))
    from public.crawl_sources s), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_crawl_sources() from public, anon;
grant execute on function public.admin_crawl_sources() to authenticated;
