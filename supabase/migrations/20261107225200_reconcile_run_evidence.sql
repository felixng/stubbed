alter table public.crawl_sources add column withdrawn_at timestamptz;
alter table public.crawl_publication_queue add column run_available_at timestamptz not null default now();

-- These are observations and a durable engagement key, with no relationship
-- from entries. The old runs table retains its IDs and uniqueness contract.
create table public.crawl_run_evidence (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.crawl_sources (id),
  source_event_key text not null check (length(source_event_key) between 1 and 500),
  segment_key text not null check (length(segment_key) between 1 and 500),
  engagement_id uuid not null,
  shared_ref text,
  venue_id uuid references public.venues (id) on delete set null,
  show_id uuid references public.shows (id) on delete set null,
  legacy_run_id uuid references public.runs (id) on delete set null,
  raw_title text not null check (length(raw_title) between 1 and 300),
  fact_key text not null,
  kind text not null check (kind in ('start','preview','opening','closing','booking_until','end',
    'performance','exception','cancelled','reopened','unknown')),
  precision text not null check (precision in ('day','month','year','unknown')),
  on_date date,
  evidence_text text,
  evidence_field text not null,
  source_url text not null,
  parser_version text not null,
  extraction_method text not null,
  match_status text not null check (match_status in ('show_resolved','venue_only')),
  page_checked boolean not null,
  observed_at timestamptz not null,
  last_seen_at timestamptz not null,
  extraction_id uuid references public.crawl_extractions (id),
  superseded_at timestamptz,
  withdrawn_at timestamptz,
  value_hash text not null,
  check ((precision = 'day') = (on_date is not null)),
  unique (source_id, source_event_key, segment_key, fact_key, value_hash)
);
create index crawl_run_evidence_engagement on public.crawl_run_evidence (engagement_id)
  where superseded_at is null;
create index crawl_run_evidence_venue on public.crawl_run_evidence (venue_id)
  where superseded_at is null;
create index crawl_run_evidence_show on public.crawl_run_evidence (show_id) where show_id is not null;
create index crawl_run_evidence_extraction on public.crawl_run_evidence (extraction_id) where extraction_id is not null;
create index crawl_run_evidence_legacy on public.crawl_run_evidence (legacy_run_id) where legacy_run_id is not null;
create index crawl_run_evidence_shared on public.crawl_run_evidence (shared_ref, venue_id, show_id)
  where shared_ref is not null and superseded_at is null;
create index crawl_run_publication_due on public.crawl_publication_queue (run_available_at, queued_at)
  where processed_at is null and identity_processed_at is not null;

alter table public.crawl_run_evidence enable row level security;
revoke all on public.crawl_run_evidence from public, anon, authenticated;
grant select on public.crawl_run_evidence to authenticated;
grant select, insert, update, delete on public.crawl_run_evidence to service_role;
create policy "Admins read run evidence" on public.crawl_run_evidence for select
  to authenticated using ((select public.is_admin()));

create function public.record_crawl_run_segment(
  for_source uuid, event_key text, for_segment text, source_shared_ref text,
  at_venue uuid, for_show uuid, title text, claims jsonb,
  fetched_url text, fetched_at timestamptz, version text, method text,
  for_extraction uuid default null, legacy_id uuid default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  engagement uuid;
  matches uuid[];
  claim jsonb;
  fact_kind text;
  fact_precision text;
  field text;
  raw_text text;
  day date;
  key text;
  hash text;
  has_start boolean;
  recorded_fact boolean := false;
begin
  if at_venue is null or nullif(btrim(title), '') is null or length(event_key) not between 1 and 500
     or length(for_segment) not between 1 and 500 or jsonb_typeof(claims) is distinct from 'array' then
    return null;
  end if;

  select exists(
    select 1 from jsonb_array_elements(claims) c
    where c->>'kind' in ('start','preview','opening','performance')
      and c->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(c->>'date', 'date')
  ) into has_start;

  -- Keep the source's engagement across corrected start dates. A transfer
  -- with a different resolved venue keeps its own segment.
  select e.engagement_id into engagement from public.crawl_run_evidence e
  where e.source_id = for_source and e.source_event_key = event_key and e.segment_key = for_segment
    and e.venue_id = at_venue
  order by e.observed_at, e.id limit 1;

  if engagement is null and has_start and for_show is not null and nullif(source_shared_ref, '') is not null then
    select array_agg(distinct e.engagement_id) into matches from public.crawl_run_evidence e
    join public.crawl_sources s on s.id = e.source_id and s.withdrawn_at is null
    where e.source_id <> for_source and e.shared_ref = source_shared_ref and e.venue_id = at_venue
      and e.show_id = for_show and e.superseded_at is null and e.withdrawn_at is null;
    if cardinality(matches) = 1 then engagement := matches[1]; end if;
  end if;
  engagement := coalesce(engagement, legacy_id, gen_random_uuid());

  -- Partials have separate fact keys and never replace a supported day.
  -- One field on a newer page can replace its old assertion. Different
  -- fields on the same page can still disagree.
  for claim in select value from jsonb_array_elements(claims) loop
    fact_kind := claim->>'kind';
    if fact_kind = 'unknown' then fact_kind := coalesce(claim->>'intended_kind', 'unknown'); end if;
    if fact_kind is null or fact_kind not in ('start','preview','opening','closing','booking_until','end',
      'performance','exception','cancelled','reopened','unknown') then continue; end if;
    day := null;
    if claim->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(claim->>'date', 'date') then
      day := (claim->>'date')::date;
    end if;
    fact_precision := case when day is not null then 'day'
      when claim->>'precision' in ('month','year') then claim->>'precision' else 'unknown' end;
    if fact_kind in ('performance','exception') and day is null then continue; end if;
    field := left(coalesce(claim#>>'{evidence,field}', fact_kind), 200);
    raw_text := left(coalesce(claim#>>'{evidence,text}', claim->>'date'), 400);
    key := (case when fact_kind in ('cancelled','reopened') then 'status' else fact_kind end)
      || ':' || field || ':' || fact_precision
      || case when fact_kind in ('performance','exception') then ':' || day::text else '' end;
    hash := encode(extensions.digest(jsonb_build_array(fact_kind, day, raw_text)::text, 'sha256'), 'hex');

    if exists (
      select 1 from public.crawl_run_evidence e where e.source_id = for_source and e.source_event_key = event_key
        and e.segment_key = for_segment and e.venue_id = at_venue and e.fact_key = key and e.last_seen_at > fetched_at
    ) then continue; end if;

    update public.crawl_run_evidence e set superseded_at = fetched_at
    where e.source_id = for_source and e.source_event_key = event_key and e.segment_key = for_segment
      and e.venue_id = at_venue and e.fact_key = key and e.value_hash <> hash and e.last_seen_at < fetched_at
      and e.superseded_at is null;
    insert into public.crawl_run_evidence (
      source_id, source_event_key, segment_key, engagement_id, shared_ref, venue_id, show_id, legacy_run_id,
      raw_title, fact_key, kind, precision, on_date, evidence_text, evidence_field, source_url, parser_version,
      extraction_method, match_status, page_checked, observed_at, last_seen_at, extraction_id, value_hash
    ) values (
      for_source, event_key, for_segment, engagement, left(source_shared_ref, 200), at_venue, for_show, legacy_id,
      left(btrim(title), 300), key, fact_kind, fact_precision, day, raw_text, field, fetched_url, version,
      method, case when for_show is not null then 'show_resolved' else 'venue_only' end, true,
      fetched_at, fetched_at, for_extraction, hash
    ) on conflict (source_id, source_event_key, segment_key, fact_key, value_hash) do update set
      show_id = coalesce(excluded.show_id, crawl_run_evidence.show_id),
      match_status = case when excluded.show_id is not null then 'show_resolved' else crawl_run_evidence.match_status end,
      last_seen_at = greatest(excluded.last_seen_at, crawl_run_evidence.last_seen_at),
      parser_version = excluded.parser_version, extraction_id = excluded.extraction_id, source_url = excluded.source_url,
      superseded_at = null
    where excluded.last_seen_at >= crawl_run_evidence.last_seen_at;
    recorded_fact := true;
  end loop;
  return case when recorded_fact then engagement end;
end;
$$;

create function public.publish_crawl_run_evidence(for_source text, batch_size integer default 25)
returns jsonb language plpgsql set search_path = '' as $$
declare
  source uuid;
  item record;
  observed jsonb;
  segment jsonb;
  segments jsonb;
  segment_venue uuid;
  mapped_show uuid;
  recorded uuid;
  processed integer := 0;
  published integer := 0;
  recorded_segments integer;
  deferred integer := 0;
  awaiting_venue boolean;
  failed integer := 0;
begin
  if not pg_try_advisory_xact_lock(419, 424) then return jsonb_build_object('busy', true); end if;
  select id into source from public.crawl_sources
  where source_key = for_source and publication_enabled and withdrawn_at is null for share;
  if not found then return jsonb_build_object('inactive', true); end if;

  for item in
    select e.id, e.extracted_at, e.observations, e.parser_version, e.content_hash,
      t.id as task_id, t.canonical_url, t.stage, g.is_current
    from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    where t.source_id = source and q.processed_at is null and q.identity_processed_at is not null
      and q.run_available_at <= now()
    order by q.queued_at, e.id
    limit least(100, greatest(0, coalesce(batch_size, 25))) for update of q skip locked
  loop
    begin
      awaiting_venue := false;
      recorded_segments := 0;
      perform 1 from public.crawl_tasks t where t.id = item.task_id
        and t.parser_version = item.parser_version and t.content_hash = item.content_hash for share;
      if item.is_current and item.stage = 'event' and found then
        for observed in select value from jsonb_array_elements(item.observations) loop
          if observed->>'observation_kind' is distinct from 'event' or observed->>'event_kind' is distinct from 'show'
            or observed->>'external_key' is null then continue; end if;
          select m.show_id into mapped_show from public.crawl_source_entities m
          where m.source_id = source and m.entity_kind = 'event' and m.external_key = observed->>'external_key'
            and m.resolution_status <> 'excluded';
          if not found then continue; end if;
          segments := case when jsonb_typeof(observed->'segments') = 'array' then observed->'segments'
            else jsonb_build_array(jsonb_build_object('segment_key', 'default', 'venue', observed->'venue', 'dates', observed->'dates')) end;
          for segment in select value from jsonb_array_elements(segments) loop
            select case when m.resolution_status = 'linked' then m.venue_id end into segment_venue
            from public.crawl_source_entities m
            where m.source_id = source and m.entity_kind = 'venue'
              and m.external_key = segment#>>'{venue,external_key}';
            if not found and nullif(segment#>>'{venue,external_key}', '') is not null then
              awaiting_venue := true;
            end if;
            if segment_venue is null then continue; end if;

            recorded := public.record_crawl_run_segment(
              source, observed->>'external_key', coalesce(segment->>'segment_key','default') || ':' || segment_venue::text,
              coalesce(segment->>'shared_engagement_ref', observed->>'shared_engagement_ref'),
              segment_venue, mapped_show, observed->>'raw_title', segment->'dates',
              item.canonical_url, item.extracted_at, item.parser_version, 'deterministic', item.id
            );
            if recorded is not null then recorded_segments := recorded_segments + 1; end if;
          end loop;
        end loop;
      end if;
      if awaiting_venue then
        update public.crawl_publication_queue set run_available_at = now() + interval '5 minutes',
          last_error = 'awaiting_segment_venue' where extraction_id = item.id;
        deferred := deferred + 1;
      else
        update public.crawl_publication_queue set processed_at = now(), last_error = null where extraction_id = item.id;
        processed := processed + 1;
      end if;
      published := published + recorded_segments;
    exception when others then
      update public.crawl_publication_queue set run_available_at = now() + interval '5 minutes',
        last_error = 'run_transaction:' || sqlstate where extraction_id = item.id;
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('processed', processed, 'observed_segments', published, 'deferred', deferred, 'failed', failed);
end;
$$;

-- Keep distinct meanings all the way to the consumer query. The view is
-- private and merges only compatible engagement IDs, never title/date alone.
create view public.catalogue_effective_runs with (security_invoker = true) as
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
), bounded as (
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

revoke all on public.catalogue_effective_runs from public, anon, authenticated;
grant select on public.catalogue_effective_runs to service_role;

create function public.set_crawl_source_withdrawal(for_source text, withdrawn boolean)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.crawl_sources set withdrawn_at = case when withdrawn then coalesce(withdrawn_at, now()) else null end
  where source_key = for_source;
  return found;
end;
$$;

-- Preserve the legacy signature and selected findings. A failure or a newly
-- unbounded reading does not remove the last explicit legacy end date.
create function public.eligible_legacy_crawl_findings(for_run uuid, manual boolean)
returns setof public.crawl_findings language sql stable set search_path = '' as $$
  select distinct on (f.venue_id, public.normalise_show_title(f.raw_title), f.start_date) f.*
  from public.crawl_findings f left join public.crawl_rules r on r.id = f.rule_id
  where f.run_id = for_run and f.page_checked and f.kind = 'show' and f.start_date is not null and f.venue_id is not null
    and f.review is distinct from 'wrong'
    and (f.method = 'structured' or (f.method = 'rules' and r.status = 'active') or (manual and f.method = 'model' and f.review = 'right'))
  order by f.venue_id, public.normalise_show_title(f.raw_title), f.start_date, f.confidence desc, f.created_at desc;
$$;

create function public.publish_legacy_crawl_findings(for_run uuid, manual boolean)
returns integer language plpgsql set search_path = '' as $$
declare
  changed integer;
  official uuid;
  finding record;
  facts jsonb;
begin
  insert into public.runs(venue_id,title,show_id,start_date,end_date,source,source_url,confidence,last_seen_at)
  select f.venue_id, f.raw_title,
    (select s.id from public.similar_shows(f.raw_title) s where s.same limit 1),
    f.start_date, f.end_date, f.method, f.source_url, f.confidence, now()
  from public.eligible_legacy_crawl_findings(for_run, manual) f
  on conflict(venue_id,title_key,start_date) do update set
    show_id = coalesce(excluded.show_id, runs.show_id), end_date = coalesce(excluded.end_date, runs.end_date),
    source = excluded.source, source_url = excluded.source_url, confidence = excluded.confidence,
    last_seen_at = excluded.last_seen_at;
  get diagnostics changed = row_count;

  -- The existing writer keeps working without the staged source. Once
  -- enabled, checked official observations also enter the evidence layer.
  select id into official from public.crawl_sources where source_key = 'official'
    and publication_enabled and withdrawn_at is null for share;
  if official is not null then
    for finding in
      select f.*, r.id as published_run_id,
        case when s.verified and public.normalise_search_text(s.title) = public.normalise_search_text(f.raw_title)
          and not exists (select 1 from public.shows other where other.id <> s.id
            and public.normalise_search_text(other.title) = public.normalise_search_text(f.raw_title))
          then s.id end as exact_show_id
      from public.eligible_legacy_crawl_findings(for_run, manual) f
      join public.runs r on r.venue_id = f.venue_id and r.title_key = public.normalise_show_title(f.raw_title)
        and r.start_date = f.start_date
      left join public.shows s on s.id = r.show_id
    loop
      facts := jsonb_build_array(jsonb_build_object('kind','start','date',finding.start_date,
        'evidence',jsonb_build_object('field','official.start_date','text',finding.date_text)));
      if finding.end_date is not null then
        facts := facts || jsonb_build_array(jsonb_build_object(
          'kind',case when finding.date_text ~* '\m(closing|final performance)\M' then 'closing' else 'end' end,
          'date',finding.end_date,'evidence',jsonb_build_object('field','official.end_date','text',finding.date_text)));
      end if;
      perform public.record_crawl_run_segment(official, finding.published_run_id::text, 'legacy', null,
        finding.venue_id, finding.exact_show_id, finding.raw_title, facts,
        coalesce(finding.fetched_url, finding.source_url), finding.created_at,
        coalesce(finding.rule_id::text, 'legacy'), finding.method, null, finding.published_run_id);
    end loop;
  end if;
  return changed;
end;
$$;

create or replace function public.publish_crawl_findings(for_run uuid, manual boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' and session_user <> 'postgres' and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if current_setting('role') in ('anon','authenticated') and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return public.publish_legacy_crawl_findings(for_run, manual);
end;
$$;

create function public.admin_diary_crawl_evidence_score(venue_ids uuid[])
returns table(venue_id uuid, venue_name text, entry_id uuid, title text, on_date date, outcome text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select e.venue_id, v.name, e.id, s.title, e.date,
    case when score.exact then 'exact'
      when score.conflicting then 'conflicting'
      when score.partial then 'partial'
      when score.known or finding.known then 'wrong_dates'
      else 'missing' end
  from public.entries e join public.venues v on v.id = e.venue_id join public.shows s on s.id = e.show_id
  cross join lateral (
    select
      bool_or(not r.cancelled and not r.conflicting and e.date <> all(r.exception_dates)
        and (e.date = r.start_date or e.date = any(r.performance_dates)
          or (r.support_end_date is not null and e.date between r.start_date and r.support_end_date))) as exact,
      bool_or(r.conflicting) as conflicting,
      bool_or(not r.cancelled and not r.conflicting and r.support_end_date is null
        and cardinality(r.performance_dates) = 0 and e.date > r.start_date) as partial,
      count(*) > 0 as known
    from public.catalogue_effective_runs r where r.venue_id = e.venue_id
      and (r.show_id = e.show_id or (r.show_id is null and
        public.normalise_search_text(r.title) = public.normalise_search_text(s.title)))
  ) score
  cross join lateral (
    select exists(select 1 from public.crawl_findings f where f.venue_id = e.venue_id and f.page_checked
      and public.normalise_search_text(f.raw_title) = public.normalise_search_text(s.title)) as known
  ) finding
  where e.user_id = auth.uid() and e.status = 'logged' and e.venue_id = any(venue_ids)
  order by v.name, e.date, s.title;
end;
$$;

-- Backwards-compatible outcome labels for the existing admin client.
create or replace function public.admin_diary_crawl_score(venue_ids uuid[])
returns table(venue_id uuid, venue_name text, entry_id uuid, title text, on_date date, outcome text)
language sql security definer set search_path = '' as $$
  select s.venue_id, s.venue_name, s.entry_id, s.title, s.on_date,
    case s.outcome when 'exact' then 'matching_dates' when 'missing' then 'missed' else 'wrong_dates' end
  from public.admin_diary_crawl_evidence_score(venue_ids) s;
$$;

revoke all on function public.record_crawl_run_segment(uuid,text,text,text,uuid,uuid,text,jsonb,text,timestamptz,text,text,uuid,uuid),
  public.publish_crawl_run_evidence(text,integer), public.set_crawl_source_withdrawal(text,boolean),
  public.eligible_legacy_crawl_findings(uuid,boolean), public.publish_legacy_crawl_findings(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.record_crawl_run_segment(uuid,text,text,text,uuid,uuid,text,jsonb,text,timestamptz,text,text,uuid,uuid),
  public.publish_crawl_run_evidence(text,integer), public.set_crawl_source_withdrawal(text,boolean),
  public.eligible_legacy_crawl_findings(uuid,boolean), public.publish_legacy_crawl_findings(uuid,boolean)
  to service_role;
revoke all on function public.admin_diary_crawl_evidence_score(uuid[]) from public, anon;
grant execute on function public.admin_diary_crawl_evidence_score(uuid[]) to authenticated;


-- Partial-date precision changes the London parser checkpoint format.
update public.crawl_sources set adapter_version = 'london-theatre-v2'
where source_key = 'london_theatre';
