alter table public.crawl_sources add column operator_paused_at timestamptz;
alter table public.crawl_tasks
  add column http_requests bigint not null default 0,
  add column last_attempt_at timestamptz;

create table public.crawl_admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  source_id uuid not null references public.crawl_sources (id),
  generation_id uuid references public.crawl_generations (id),
  task_id uuid references public.crawl_tasks (id),
  operation text not null,
  affected integer not null,
  created_at timestamptz not null default now()
);
create index crawl_admin_actions_actor on public.crawl_admin_actions(actor_id);
create index crawl_admin_actions_source on public.crawl_admin_actions(source_id, created_at desc);
create index crawl_admin_actions_generation on public.crawl_admin_actions(generation_id) where generation_id is not null;
create index crawl_admin_actions_task on public.crawl_admin_actions(task_id) where task_id is not null;
alter table public.crawl_admin_actions enable row level security;
revoke all on public.crawl_admin_actions from public, anon, authenticated;
grant select on public.crawl_admin_actions to authenticated;
grant select, insert on public.crawl_admin_actions to service_role;
create policy "Admins read crawl actions" on public.crawl_admin_actions for select
  to authenticated using ((select public.is_admin()));

create or replace function public.claim_crawl_task(for_source text, for_stage text, for_scope text, worker text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  source uuid;
  claimed public.crawl_tasks%rowtype;
begin
  select id into source from public.crawl_sources
  where source_key = for_source and collection_enabled and paused_reason is null and operator_paused_at is null for share;
  if not found then return null; end if;

  with candidate as (
    select t.id
    from public.crawl_tasks t
    join public.crawl_generations g on g.id = t.generation_id
    left join public.crawl_hosts h on h.host = substring(t.canonical_url from '^https?://([^/]+)/')
    where t.source_id = source and g.is_current and g.paused_reason is null
      and (for_scope is null or g.scope_key = for_scope)
      and (for_stage = 'all' or t.stage = for_stage)
      -- Let the request gate wait out an ordinary pacing gap. Long
      -- cooldowns stay in the queue without consuming a page attempt.
      and (h.available_at is null or h.available_at <= clock_timestamp() + interval '20 seconds')
      and (
        (t.status in ('pending', 'retry_wait') and t.available_at <= clock_timestamp())
        or (t.status = 'leased' and t.lease_expires_at <= clock_timestamp())
      )
    order by t.priority desc, t.available_at, t.id
    limit 1 for update of t skip locked
  )
  update public.crawl_tasks t set status = 'leased', attempts = t.attempts + 1,
    last_attempt_at = clock_timestamp(), lease_owner = worker, lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '5 minutes'
  from candidate c where t.id = c.id returning t.* into claimed;

  if not found then return null; end if;
  return to_jsonb(claimed) || jsonb_build_object('has_extraction', exists (
    select 1 from public.crawl_extractions e where e.task_id = claimed.id
      and e.parser_version = claimed.parser_version and e.content_hash = claimed.content_hash
  ));
end;
$$;

create or replace function public.reserve_crawl_request(for_task uuid, for_token uuid, target_host text, min_gap_ms integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
  slot public.crawl_hosts%rowtype;
  token uuid;
  gap interval;
  eligible_at timestamptz;
  current_time_at_call timestamptz := clock_timestamp();
begin
  -- Serialise the short allocation only, never the HTTP request.
  if not pg_try_advisory_xact_lock(419, 421) then return jsonb_build_object('busy', true); end if;

  select greatest(s.min_interval_ms, min_gap_ms) * interval '1 ms' into gap
  from public.crawl_tasks t join public.crawl_sources s on s.id = t.source_id
  join public.crawl_generations g on g.id = t.generation_id
  where t.id = for_task and t.lease_token = for_token and t.lease_expires_at > clock_timestamp()
    and g.is_current and g.paused_reason is null and s.collection_enabled and s.paused_reason is null
    and (target_host = any(s.allowed_hosts)
      or (s.source_key = 'official' and target_host = substring(t.canonical_url from '^https?://([^/]+)/')))
  for share of s, g, t;
  if not found then return jsonb_build_object('stale', true); end if;

  current_time_at_call := clock_timestamp();
  select * into slot from public.crawl_hosts where host = target_host for update;
  if slot.request_expires_at > current_time_at_call then return jsonb_build_object('busy', true); end if;
  eligible_at := greatest(slot.available_at, slot.last_started_at + gap);
  if eligible_at > current_time_at_call then return jsonb_build_object('retry_at', eligible_at); end if;
  if (select count(*) from public.crawl_hosts where request_expires_at > current_time_at_call) >= 4 then
    return jsonb_build_object('busy', true);
  end if;
  token := gen_random_uuid();
  insert into public.crawl_hosts (host, available_at, last_started_at, request_token, request_expires_at, requests)
  values (target_host, current_time_at_call + gap, current_time_at_call,
    token, current_time_at_call + interval '45 seconds', 1)
  on conflict (host) do update set available_at = excluded.available_at, last_started_at = excluded.last_started_at,
    request_token = excluded.request_token, request_expires_at = excluded.request_expires_at,
    requests = public.crawl_hosts.requests + 1;
  update public.crawl_tasks set http_requests = http_requests + 1 where id = for_task;
  return jsonb_build_object('token', token);
end;
$$;

-- All consumers use this paginated, snapshot-consistent read contract.
create function public.crawl_source_progress(
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
      t.last_success_at, t.last_error, t.available_at, t.parser_version, en.complete as enriched
    from tasks t left join enriched en on en.root_id = t.id
    where (for_stage is null or t.stage = for_stage)
      and (for_status is null or t.visible_status = for_status)
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

create function public.admin_crawl_source_action(
  for_source text, operation text, for_generation uuid default null, for_task uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  source public.crawl_sources%rowtype;
  scan public.crawl_generations%rowtype;
  seed public.crawl_tasks%rowtype;
  target_scan uuid;
  changed integer := 0;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into source from public.crawl_sources where source_key = for_source for update;
  if not found then raise exception 'Unknown source' using errcode = '22023'; end if;

  if operation in ('pause','resume') then
    update public.crawl_sources set operator_paused_at =
      case when operation = 'pause' then coalesce(operator_paused_at, now()) end
    where id = source.id;
    changed := 1;
  else
    select * into scan from public.crawl_generations
    where id = for_generation and source_id = source.id and is_current for update;
    if not found then raise exception 'Select a current scan' using errcode = '22023'; end if;
    target_scan := scan.id;
    if for_task is not null and not exists (
      select 1 from public.crawl_tasks where id = for_task and generation_id = scan.id
    ) then raise exception 'Task does not belong to this scan' using errcode = '22023'; end if;

    if operation in ('retry_failed','retry_blocked','reparse') then
      update public.crawl_tasks t set status = 'pending', available_at = now(), consecutive_failures = 0,
        lease_owner = null, lease_token = null, lease_expires_at = null,
        etag = case when operation = 'reparse' then null else t.etag end,
        last_modified = case when operation = 'reparse' then null else t.last_modified end
      where t.generation_id = scan.id and (for_task is null or t.id = for_task)
        and ((operation = 'retry_failed' and t.status in ('failed','retry_wait'))
          or (operation = 'retry_blocked' and t.status = 'blocked')
          or (operation = 'reparse' and t.status <> 'blocked'));
      get diagnostics changed = row_count;
      if operation = 'retry_blocked' and changed > 0 then
        update public.crawl_sources set paused_reason = null where id = source.id;
        update public.crawl_generations set paused_reason = null where id = scan.id;
      end if;
      if operation = 'reparse' and exists (
        select 1 from public.crawl_tasks where generation_id = scan.id and stage = 'directory' and status = 'pending'
      ) then
        update public.crawl_generations set enumeration_status = 'enumerating', completed_at = null
        where id = scan.id and enumeration_status = 'enumerated';
      end if;
    elsif operation = 'rediscover' then
      if not source.collection_enabled or source.operator_paused_at is not null then
        raise exception 'Resume an enabled source before rediscovery' using errcode = '22023';
      end if;
      select * into seed from public.crawl_tasks where generation_id = scan.id
      order by discovered_at, case stage when 'directory' then 0 when 'venue' then 1 else 2 end, id limit 1;
      if not found then raise exception 'This scan has no seed' using errcode = '22023'; end if;
      target_scan := public.start_crawl_generation(source.source_key, scan.scope_key, seed.stage, seed.canonical_url, scan.site_id, true);
      changed := 1;
    else
      raise exception 'Unknown crawl action' using errcode = '22023';
    end if;
  end if;

  insert into public.crawl_admin_actions(actor_id, source_id, generation_id, task_id, operation, affected)
  values (auth.uid(), source.id, target_scan, for_task, operation, changed);
  return changed;
end;
$$;

revoke all on function public.crawl_source_progress(text,uuid,text,text,integer,integer),
  public.admin_crawl_source_action(text,text,uuid,uuid) from public, anon;
grant execute on function public.crawl_source_progress(text,uuid,text,text,integer,integer) to authenticated, service_role;
grant execute on function public.admin_crawl_source_action(text,text,uuid,uuid) to authenticated;
