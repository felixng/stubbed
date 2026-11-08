-- Run chips latency (#428). catalogue_effective_runs read its `bounded` CTE
-- twice, so PostgreSQL materialised every engagement before any venue filter:
-- ~640 ms at 100k evidence rows. NOT MATERIALIZED lets a venue filter reach the
-- evidence scan. Same columns and meaning; grants are unchanged.
create or replace view public.catalogue_effective_runs with (security_invoker = true) as
with active as (
  select e.*, case s.source_key when 'official' then 3 when 'london_theatre' then 2
    when 'playbill' then 2 else 1 end as authority,
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
