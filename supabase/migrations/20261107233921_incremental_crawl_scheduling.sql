alter table public.crawl_sources add column claim_sequence bigint not null default 0;
alter table public.crawl_tasks add column refresh_at timestamptz;
create index crawl_source_entities_url on public.crawl_source_entities(source_id, (evidence->>'source_url'))
  where venue_id is not null;
create index crawl_tasks_refresh_due on public.crawl_tasks(source_id, stage, refresh_at)
  where status = 'succeeded';

create function public.crawl_refresh_policy(task_stage text, observations jsonb, today date)
returns table (priority integer, delay interval)
language sql immutable set search_path = '' as $$
  with observations as (
    select value from jsonb_array_elements(case when jsonb_typeof($2) = 'array' then $2 else '[]'::jsonb end)
  ), date_arrays as (
    select value->'dates' as dates from observations
    union all
    select segment->'dates' from observations
    cross join lateral jsonb_array_elements(case when jsonb_typeof(value->'segments') = 'array'
      then value->'segments' else '[]'::jsonb end) segment
  ), engagements as (
    select min(day) filter (where kind in ('start','preview','opening','performance')) as first_day,
      max(day) filter (where kind = 'closing') as close_day,
      max(day) filter (where kind in ('closing','booking_until','end','performance')) as last_supported_day
    from date_arrays
    cross join lateral (
      select fact->>'kind' as kind,
        case when fact->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and pg_input_is_valid(fact->>'date','date') then (fact->>'date')::date end as day
      from jsonb_array_elements(case when jsonb_typeof(dates) = 'array' then dates else '[]'::jsonb end) fact
    ) days
    where day is not null
    group by dates
  ), event_policy as (
    select max(case
      when close_day < today - interval '24 months' then 0
      when close_day < today then 1
      when first_day between today and today + 30
        or (first_day < today and last_supported_day >= today) then 3
      when first_day < today - interval '24 months' then 0
      when first_day < today then 1
      else 2 end) as priority,
    min(case
      when close_day < today then interval '180 days'
      when first_day between today and today + 30
        or (first_day < today and last_supported_day >= today) then interval '1 day'
      when first_day > today + 30 or first_day is null then interval '7 days'
      else interval '30 days' end) as delay
    from engagements
  ), live_venue as (
    select exists(
      select 1 from observations
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(value->'listings') = 'array'
        then value->'listings' else '[]'::jsonb end) listing
      where listing ~* '(current|upcoming|future)'
    ) as active
  )
  select case when task_stage = 'event' then coalesce(priority, 2) else 2 end,
    case
      when task_stage = 'directory' then interval '30 days'
      when task_stage = 'venue' then case when active then interval '1 day' else interval '7 days' end
      else coalesce(delay, interval '7 days')
    end
  from event_policy cross join live_venue;
$$;

create function public.schedule_successful_crawl_task()
returns trigger language plpgsql set search_path = '' as $$
declare
  observation jsonb;
  policy record;
begin
  if new.status <> 'succeeded' or new.last_success_at is null then return new; end if;
  select e.observations into observation from public.crawl_extractions e
  where e.task_id = new.id and e.parser_version = new.parser_version and e.content_hash = new.content_hash;
  select * into policy from public.crawl_refresh_policy(new.stage, observation, new.last_success_at::date);
  new.priority := policy.priority;
  new.refresh_at := new.last_success_at + policy.delay;
  return new;
end;
$$;

create trigger crawl_task_refresh_after_success
before update of status on public.crawl_tasks
for each row execute function public.schedule_successful_crawl_task();

create function public.claim_due_crawl_task(for_source text, for_stage text, for_scope text, worker text, expected_parser text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  selected_source_id uuid;
  reserve_oldest boolean;
  claimed public.crawl_tasks%rowtype;
begin
  select id, (claim_sequence + 1) % 5 = 0 into selected_source_id, reserve_oldest
  from public.crawl_sources
  where source_key = for_source and collection_enabled and paused_reason is null and operator_paused_at is null for update;
  if not found then return null; end if;

  with candidate as (
    select t.id
    from public.crawl_tasks t
    join public.crawl_generations g on g.id = t.generation_id
    left join public.crawl_hosts h on h.host = substring(t.canonical_url from '^https?://([^/]+)/')
    cross join lateral (select case when t.last_success_at is null then 2 else t.priority end as class) priority
    left join lateral (
      select count(e.id) as logged, bool_or(v.circuit in ('west_end','broadway')) as circuit
      from public.crawl_source_entities m join public.venues v on v.id = m.venue_id
      left join public.entries e on e.venue_id = v.id and e.status = 'logged'
      where m.source_id = selected_source_id and m.venue_id is not null
        and (m.evidence->>'source_url' = t.canonical_url or m.evidence->>'source_url' = (
          select e.observations #>> '{0,venue,source_url}' from public.crawl_extractions e
          where e.task_id = t.id and e.parser_version = t.parser_version and e.content_hash = t.content_hash
        ))
    ) demand on true
    where t.source_id = selected_source_id and g.is_current and g.paused_reason is null
      and (for_scope is null or g.scope_key = for_scope)
      and (for_stage = 'all' or t.stage = for_stage)
      -- Let the request gate wait out an ordinary pacing gap. Long
      -- cooldowns stay in the queue without consuming a page attempt.
      and (h.available_at is null or h.available_at <= clock_timestamp() + interval '20 seconds')
      and (
        (t.status in ('pending', 'retry_wait') and t.available_at <= clock_timestamp())
        or (t.status = 'leased' and t.lease_expires_at <= clock_timestamp())
        or (t.status = 'succeeded' and expected_parser is not null and
          ((t.parser_version is distinct from expected_parser)
            or coalesce(t.refresh_at, t.last_success_at + interval '30 days') <= clock_timestamp()))
      )
    order by
      case when reserve_oldest and priority.class < 3 then 0 else 1 end,
      case when reserve_oldest and priority.class < 3 then t.discovered_at end,
      least(3, priority.class + greatest(0, extract(day from now() - coalesce(t.last_success_at, t.discovered_at))::integer / 30)) desc,
      demand.logged desc, demand.circuit desc nulls last, t.available_at, t.id
    limit 1 for update of t skip locked
  )
  update public.crawl_tasks t set status = 'leased', attempts = t.attempts + 1,
    last_attempt_at = clock_timestamp(), lease_owner = worker, lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '5 minutes'
  from candidate c where t.id = c.id returning t.* into claimed;

  if not found then return null; end if;
  update public.crawl_sources set claim_sequence = claim_sequence + 1 where id = selected_source_id;
  return to_jsonb(claimed) || jsonb_build_object('has_extraction', exists (
    select 1 from public.crawl_extractions e where e.task_id = claimed.id
      and e.parser_version = claimed.parser_version and e.content_hash = claimed.content_hash
  ));
end;
$$;

-- A new pagination edge reopens enumeration in the current generation.
create function public.reopen_crawl_enumeration()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage = 'directory' then
    update public.crawl_generations set enumeration_status = 'enumerating', completed_at = null
    where id = new.generation_id and enumeration_status = 'enumerated';
  end if;
  return new;
end;
$$;

create trigger crawl_reopen_enumeration after insert on public.crawl_tasks
for each row execute function public.reopen_crawl_enumeration();

create or replace function public.claim_crawl_task(for_source text, for_stage text, for_scope text, worker text)
returns jsonb language sql set search_path = '' as $$
  select public.claim_due_crawl_task(for_source, for_stage, for_scope, worker, null);
$$;

revoke all on function public.claim_due_crawl_task(text,text,text,text,text), public.reopen_crawl_enumeration()
  from public, anon, authenticated;
grant execute on function public.claim_due_crawl_task(text,text,text,text,text), public.reopen_crawl_enumeration()
  to service_role;

create table public.crawl_ai_reservations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.crawl_runs(id) on delete cascade,
  site_key text not null,
  reserved_usd numeric not null check (reserved_usd > 0),
  actual_usd numeric check (actual_usd >= 0),
  created_at timestamptz not null default now()
);
create index crawl_ai_reservations_run_site on public.crawl_ai_reservations(run_id, site_key);

create table public.crawl_repair_cycles (
  site_id uuid not null references public.crawl_sites(id) on delete cascade,
  content_version text not null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  last_attempt_at timestamptz not null default now(),
  primary key (site_id, content_version)
);

alter table public.crawl_ai_reservations enable row level security;
alter table public.crawl_repair_cycles enable row level security;
revoke all on public.crawl_ai_reservations, public.crawl_repair_cycles from public, anon, authenticated;
grant select, insert, update on public.crawl_ai_reservations, public.crawl_repair_cycles to service_role;

create function public.reserve_crawl_ai_spend(for_run uuid, site text, amount numeric, site_limit numeric)
returns uuid language plpgsql set search_path = '' as $$
declare
  cap numeric;
  spent numeric;
  site_spent numeric;
  reservation uuid;
begin
  if amount is null or amount <= 0 or amount > 1 or site is null or site_limit is null then return null; end if;
  select least(budget_usd, 1) into cap from public.crawl_runs where id = for_run and status = 'running' for update;
  if not found then return null; end if;
  select coalesce(sum(coalesce(actual_usd,reserved_usd)),0),
    coalesce(sum(coalesce(actual_usd,reserved_usd)) filter (where site_key = left(site,500)),0)
  into spent, site_spent from public.crawl_ai_reservations where run_id = for_run;
  if spent + amount > cap or site_spent + amount > least(site_limit, 0.20) then return null; end if;
  insert into public.crawl_ai_reservations (run_id,site_key,reserved_usd)
  values (for_run,left(site,500),amount) returning id into reservation;
  return reservation;
end;
$$;

create function public.settle_crawl_ai_spend(reservation uuid, actual numeric)
returns void language sql set search_path = '' as $$
  update public.crawl_ai_reservations set actual_usd = actual
  where id = reservation and actual_usd is null;
$$;

create function public.reserve_crawl_repair(site uuid, version text)
returns integer language plpgsql set search_path = '' as $$
declare attempt integer;
begin
  insert into public.crawl_repair_cycles(site_id,content_version,attempts)
  values (site,version,1)
  on conflict(site_id,content_version) do update set
    attempts = public.crawl_repair_cycles.attempts + 1, last_attempt_at = now()
  where public.crawl_repair_cycles.attempts < 3
  returning attempts into attempt;
  return coalesce(attempt, 0);
end;
$$;

revoke all on function public.crawl_refresh_policy(text,jsonb,date), public.schedule_successful_crawl_task(),
  public.reserve_crawl_ai_spend(uuid,text,numeric,numeric), public.settle_crawl_ai_spend(uuid,numeric),
  public.reserve_crawl_repair(uuid,text) from public, anon, authenticated;
grant execute on function public.crawl_refresh_policy(text,jsonb,date), public.schedule_successful_crawl_task(),
  public.reserve_crawl_ai_spend(uuid,text,numeric,numeric), public.settle_crawl_ai_spend(uuid,numeric),
  public.reserve_crawl_repair(uuid,text) to service_role;

create function public.allocate_crawl_host(target_host text, gap interval)
returns jsonb language plpgsql set search_path = '' as $$
declare
  slot public.crawl_hosts%rowtype;
  token uuid;
  eligible_at timestamptz;
  current_time_at_call timestamptz;
begin
  if not pg_try_advisory_xact_lock(419, 421) then return jsonb_build_object('busy', true); end if;
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
  return jsonb_build_object('token', token);
end;
$$;

create or replace function public.reserve_crawl_request(for_task uuid, for_token uuid, target_host text, min_gap_ms integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
  gap interval;
  allocation jsonb;
begin
  select greatest(s.min_interval_ms, min_gap_ms) * interval '1 ms' into gap
  from public.crawl_tasks t join public.crawl_sources s on s.id = t.source_id
  join public.crawl_generations g on g.id = t.generation_id
  where t.id = for_task and t.lease_token = for_token and t.lease_expires_at > clock_timestamp()
    and g.is_current and g.paused_reason is null and s.collection_enabled and s.paused_reason is null
    and (target_host = any(s.allowed_hosts)
      or (s.source_key = 'official' and target_host = substring(t.canonical_url from '^https?://([^/]+)/')))
  for share of s, g, t;
  if not found then return jsonb_build_object('stale', true); end if;

  allocation := public.allocate_crawl_host(target_host, gap);
  if allocation ? 'token' then
    update public.crawl_tasks set http_requests = http_requests + 1 where id = for_task;
  end if;
  return allocation;
end;
$$;

create function public.reserve_official_crawl_request(for_run uuid, target_host text, min_gap_ms integer)
returns jsonb language plpgsql set search_path = '' as $$
declare gap interval;
begin
  select greatest(s.min_interval_ms, min_gap_ms) * interval '1 ms' into gap
  from public.crawl_sources s
  join public.crawl_runs r on r.id = for_run and r.status = 'running'
  where s.source_key = 'official' and s.collection_enabled and s.paused_reason is null and s.operator_paused_at is null
    and target_host ~ '^[a-z0-9.-]{1,253}$'
  for share of s, r;
  if not found then return jsonb_build_object('stale', true); end if;
  return public.allocate_crawl_host(target_host, gap);
end;
$$;

revoke all on function public.allocate_crawl_host(text,interval),
  public.reserve_official_crawl_request(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.allocate_crawl_host(text,interval),
  public.reserve_official_crawl_request(uuid,text,integer) to service_role;
