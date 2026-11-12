-- What runs when (#505, epic #419). Additive and read-only in effect: one new table the worker writes,
-- one admin-only read RPC, and two more fields on the pages list. No change to crawl behaviour,
-- flags or catalogue data.
--
-- 1. crawl_worker_runs: one row per crawl worker execution (schedule, by hand, Start a crawl).
-- 2. admin_crawl_schedule: recent runs, what is running now, the last 24 hours (for the daily caps)
--    and a due-now forecast per source (new, retry, re-read).
-- 3. crawl_source_progress rows also carry consecutive_failures and refresh_at, so each page can
--    say who acts next (automatic retry, gave up, or re-read on a date).

create table public.crawl_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null check (trigger in ('schedule', 'manual', 'admin_start')),
  github_run_id text,
  log_url text,
  source_filter text,
  stage_filter text,
  scope_filter text,
  limits jsonb not null default '{}'::jsonb,
  per_source jsonb not null default '{}'::jsonb,
  stop_reason text check (stop_reason in ('page_allowance', 'time_limit', 'daily_spend_cap', 'nothing_due', 'failed', 'cancelled')),
  model_spend_usd numeric not null default 0 check (model_spend_usd >= 0)
);
create index crawl_worker_runs_started on public.crawl_worker_runs (started_at desc);
create index crawl_worker_runs_trigger on public.crawl_worker_runs (trigger, started_at desc);

alter table public.crawl_worker_runs enable row level security;
revoke all on public.crawl_worker_runs from public, anon, authenticated;
grant select on public.crawl_worker_runs to authenticated;
-- Only the worker's database role writes; it connects directly and is not subject to row security.
create policy "Admins read crawl worker runs"
  on public.crawl_worker_runs for select
  to authenticated
  using (public.is_admin());

create or replace function public.crawl_source_progress(
  for_source text default null, for_generation uuid default null,
  for_stage text default 'venue', for_status text default null,
  page_size integer default 25, page_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  source public.crawl_sources%rowtype;
  scan public.crawl_generations%rowtype;
  source_list jsonb;
  scans jsonb;
  snapshot jsonb;
  size integer := least(greatest(coalesce(page_size,25), 1), 100);
  skip integer := greatest(coalesce(page_offset,0), 0);
begin
  if not public.is_admin() and current_setting('role') <> 'service_role'
    and not (session_user = 'postgres' and current_setting('role') not in ('anon','authenticated')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_key', s.source_key, 'collection_enabled', s.collection_enabled,
    'publication_enabled', s.publication_enabled, 'operator_paused_at', s.operator_paused_at,
    'paused_reason', s.paused_reason, 'withdrawn_at', s.withdrawn_at, 'adapter_version', s.adapter_version
  ) order by s.source_key), '[]') into source_list from public.crawl_sources s;
  select * into source from public.crawl_sources s where s.source_key = coalesce(for_source, 'london_theatre');
  if not found then return jsonb_build_object('sources', source_list); end if;

  select * into scan from public.crawl_generations g
  where g.source_id = source.id and (g.id = for_generation or (for_generation is null and g.is_current))
  order by g.started_at desc, g.id desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.started_at desc, g.id desc), '[]')
  into scans from (
    select id, scope_key, enumeration_status, started_at, completed_at, is_current
    from public.crawl_generations where source_id = source.id
    order by started_at desc, id desc limit 40
  ) g;

  with recursive tasks as materialized (
    select t.*, case when t.status = 'leased' and t.lease_expires_at <= now() then 'pending' else t.status end as visible_status
    from public.crawl_tasks t where t.generation_id = scan.id
  ), reachable(root_id, task_id, stage, visible_status) as (
    select id, id, stage, visible_status from tasks where stage = 'venue'
    union
    select parent.root_id, child.id, child.stage, child.visible_status
    from reachable parent join public.crawl_task_edges e on e.parent_id = parent.task_id
    join tasks child on child.id = e.child_id
    where parent.stage = 'venue' and child.stage in ('venue','event')
  ), enriched as (
    select root_id, bool_and(visible_status = 'succeeded') as complete
    from reachable group by root_id
  ), stage_counts as (
    select stage.name, jsonb_build_object(
      'discovered', count(t.id), 'processed', count(t.id) filter (where t.last_success_at is not null),
      'pending', count(t.id) filter (where t.visible_status = 'pending'),
      'leased', count(t.id) filter (where t.visible_status = 'leased'),
      'succeeded', count(t.id) filter (where t.visible_status = 'succeeded'),
      'retry_wait', count(t.id) filter (where t.visible_status = 'retry_wait'),
      'blocked', count(t.id) filter (where t.visible_status = 'blocked'),
      'failed', count(t.id) filter (where t.visible_status = 'failed')
    ) as counts
    from (values ('directory'), ('venue'), ('event')) stage(name)
    left join tasks t on t.stage = stage.name group by stage.name
  ), filtered as materialized (
    select t.id, t.stage, t.canonical_url, t.visible_status as status, t.attempts, t.http_requests,
      t.last_success_at, t.last_error, t.available_at, t.parser_version, en.complete as enriched,
      t.consecutive_failures, t.refresh_at
    from tasks t left join enriched en on en.root_id = t.id
    where (for_stage is null or t.stage = for_stage)
      and (for_status is null or t.visible_status = for_status
        or (for_status = 'done' and t.visible_status = 'succeeded')
        or (for_status = 'todo' and t.visible_status in ('pending', 'leased'))
        or (for_status = 'retrying' and t.visible_status = 'retry_wait')
        or (for_status = 'stuck' and t.visible_status in ('blocked', 'failed')))
  ), paged as (
    select * from filtered order by canonical_url, id limit size offset skip
  ), observed_keys as (
    select distinct case when o->>'observation_kind' in ('venue','venue_link') then 'venue' else 'event' end as kind,
      o->>'external_key' as external
    from tasks t join public.crawl_extractions x on x.task_id = t.id
      and x.parser_version = t.parser_version and x.content_hash = t.content_hash
    cross join lateral jsonb_array_elements(x.observations) o
    where o->>'observation_kind' in ('venue','venue_link','event','event_link')
  ), identities as (
    select k.kind, m.venue_id, m.show_id, v.source as venue_origin, c.review_method, c.status as candidate_status
    from observed_keys k left join public.crawl_source_entities m
      on m.source_id = source.id and m.entity_kind = k.kind and m.external_key = k.external
    left join public.venues v on v.id = m.venue_id
    left join public.show_candidates c on c.id = m.candidate_id
  ), classified_shows as (
    select show_id, coalesce(bool_or(review_method = 'crawler' and candidate_status = 'added'), false) as crawler_created
    from identities where kind = 'event' and show_id is not null group by show_id
  ), observed_engagements as (
    select distinct e.engagement_id from observed_keys k
    join public.crawl_run_evidence e on e.source_id = source.id and e.source_event_key = k.external
      and e.superseded_at is null and e.withdrawn_at is null
    where k.kind = 'event' and source.withdrawn_at is null
  )
  select jsonb_build_object(
    'sources', source_list, 'source_key', source.source_key, 'scans', scans,
    'scan', case when scan.id is not null then to_jsonb(scan) end,
    'stages', (select jsonb_object_agg(name, counts) from stage_counts),
    'enriched_venue_pages', (select count(*) from enriched where complete),
    'filtered_total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(p) order by p.canonical_url, p.id), '[]') from paged p),
    'last_activity_at', (select max(greatest(discovered_at, last_attempt_at, last_success_at)) from tasks),
    'attempts', (select coalesce(sum(attempts), 0) from tasks),
    'http_requests', (select coalesce(sum(http_requests), 0) from tasks),
    'model_calls', case when source.source_key <> 'official' then 0 end,
    'model_spend_usd', case when source.source_key = 'official'
      then (select coalesce(sum(cost_usd), 0) from public.crawl_runs) else 0 end,
    'identities', (select jsonb_build_object(
      'matched_venues', count(distinct venue_id) filter (where kind = 'venue' and venue_origin <> 'crawler'),
      'crawler_venues', count(distinct venue_id) filter (where kind = 'venue' and venue_origin = 'crawler'),
      'unresolved_venues', count(*) filter (where kind = 'venue' and venue_id is null),
      'matched_shows', (select count(*) from classified_shows where not crawler_created),
      'crawler_shows', (select count(*) from classified_shows where crawler_created),
      'unresolved_events', count(*) filter (where kind = 'event' and show_id is null)
    ) from identities),
    'evidence', (select jsonb_build_object('published_runs', count(r.id),
      'conflicting_runs', count(r.id) filter (where r.conflicting),
      'stale_runs', count(r.id) filter (where r.autofill_reason = 'stale'),
      'unsupported_closing', count(r.id) filter (where r.confirmed_end_date is null and not r.conflicting))
      from observed_engagements e join public.catalogue_effective_runs r on r.id = e.engagement_id)
  ) into snapshot;
  return snapshot;
end;
$$;

create function public.admin_crawl_schedule(
  page_size integer default 25, page_offset integer default 0, for_trigger text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  size integer := least(greatest(coalesce(page_size, 25), 1), 100);
  skip integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'server_time', now(),
    -- A run still open after 35 minutes was interrupted (the job is killed after 30).
    'running', (select to_jsonb(r) from (
      select id, started_at, trigger, log_url, source_filter from public.crawl_worker_runs
      where finished_at is null and started_at > now() - interval '35 minutes'
      order by started_at desc limit 1) r),
    'last_run', (select to_jsonb(r) from (
      select id, started_at, finished_at, trigger, log_url, per_source, stop_reason, model_spend_usd, limits
      from public.crawl_worker_runs where finished_at is not null or started_at <= now() - interval '35 minutes'
      order by started_at desc limit 1) r),
    'limits', (select limits from public.crawl_worker_runs order by started_at desc limit 1),
    'total', (select count(*) from public.crawl_worker_runs where for_trigger is null or trigger = for_trigger),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc) from (
      select id, started_at, finished_at, trigger, github_run_id, log_url, source_filter, stage_filter, scope_filter,
        per_source, stop_reason, model_spend_usd, limits,
        (finished_at is null and started_at <= now() - interval '35 minutes') as interrupted
      from public.crawl_worker_runs
      where for_trigger is null or trigger = for_trigger
      order by started_at desc limit size offset skip) r), '[]'::jsonb),
    -- The last 24 hours, for the daily page and model caps and when a capped source resumes.
    'window', coalesce((select jsonb_agg(jsonb_build_object('started_at', r.started_at, 'per_source', r.per_source,
        'model_spend_usd', r.model_spend_usd) order by r.started_at)
      from public.crawl_worker_runs r where r.started_at > now() - interval '24 hours'), '[]'::jsonb),
    -- Pages due right now, as claim_due_crawl_task would see them, split by why they are due.
    'forecast', coalesce((
      select jsonb_object_agg(f.source_key, jsonb_build_object(
        'claimable', f.claimable, 'new', f.new_pages, 'retry', f.retry_pages, 'reread', f.reread_pages))
      from (
        select s.source_key,
          (s.collection_enabled and s.paused_reason is null and s.operator_paused_at is null) as claimable,
          count(t.id) filter (where t.due and t.last_success_at is null and t.consecutive_failures = 0 and t.status <> 'retry_wait') as new_pages,
          count(t.id) filter (where t.due and t.last_success_at is null and (t.status = 'retry_wait' or t.consecutive_failures > 0)) as retry_pages,
          count(t.id) filter (where t.due and t.last_success_at is not null) as reread_pages
        from public.crawl_sources s
        left join lateral (
          select x.id, x.last_success_at, x.consecutive_failures, x.status,
            ((x.status in ('pending', 'retry_wait') and x.available_at <= now())
              or (x.status = 'leased' and x.lease_expires_at <= now())
              or (x.status = 'succeeded' and (x.parser_version is distinct from s.adapter_version
                or coalesce(x.refresh_at, x.last_success_at + interval '30 days') <= now()))) as due
          from public.crawl_tasks x
          join public.crawl_generations g on g.id = x.generation_id and g.is_current and g.paused_reason is null
          where x.source_id = s.id
        ) t on true
        where s.source_key <> 'official'
        group by s.id, s.source_key, s.collection_enabled, s.paused_reason, s.operator_paused_at
      ) f), '{}'::jsonb));
end;
$$;
revoke all on function public.admin_crawl_schedule(integer, integer, text) from public, anon;
grant execute on function public.admin_crawl_schedule(integer, integer, text) to authenticated;
