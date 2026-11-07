alter table public.crawl_generations add column paused_reason text;
alter table public.crawl_tasks
  add column etag text,
  add column last_modified text,
  add column consecutive_failures integer not null default 0 check (consecutive_failures >= 0);

-- Shared by disposable jobs. A host lease fences each outbound request,
-- including robots and redirects. Task leases fence database writes.
create table public.crawl_hosts (
  host text primary key,
  available_at timestamptz not null default now(),
  last_started_at timestamptz not null default now(),
  request_token uuid,
  request_expires_at timestamptz,
  requests bigint not null default 0,
  check ((request_token is null) = (request_expires_at is null))
);
alter table public.crawl_hosts enable row level security;
revoke all on public.crawl_hosts from public, anon, authenticated;
grant select, insert, update, delete on public.crawl_hosts to service_role;
grant select on public.crawl_hosts to authenticated;
create policy "Admins read crawl hosts" on public.crawl_hosts for select
  to authenticated using ((select public.is_admin()));

create function public.claim_crawl_task(for_source text, for_stage text, for_scope text, worker text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  source uuid;
  claimed public.crawl_tasks%rowtype;
begin
  select id into source from public.crawl_sources
  where source_key = for_source and collection_enabled and paused_reason is null for share;
  if not found then return null; end if;

  with candidate as (
    select t.id
    from public.crawl_tasks t
    join public.crawl_generations g on g.id = t.generation_id
    left join public.crawl_hosts h on h.host = substring(t.canonical_url from '^https?://([^/]+)/')
    where t.source_id = source and g.is_current and g.paused_reason is null
      and (for_scope is null or g.scope_key = for_scope)
      and (for_stage = 'all' or t.stage = for_stage)
      and (h.available_at is null or h.available_at <= clock_timestamp())
      and (
        (t.status in ('pending', 'retry_wait') and t.available_at <= clock_timestamp())
        or (t.status = 'leased' and t.lease_expires_at <= clock_timestamp())
      )
    order by t.priority desc, t.available_at, t.id
    limit 1 for update of t skip locked
  )
  update public.crawl_tasks t set status = 'leased', attempts = t.attempts + 1,
    lease_owner = worker, lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '5 minutes'
  from candidate c where t.id = c.id returning t.* into claimed;

  if not found then return null; end if;
  return to_jsonb(claimed) || jsonb_build_object('has_extraction', exists (
    select 1 from public.crawl_extractions e where e.task_id = claimed.id
      and e.parser_version = claimed.parser_version and e.content_hash = claimed.content_hash
  ));
end;
$$;

create function public.renew_crawl_task(for_task uuid, for_token uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.crawl_tasks t set lease_expires_at = clock_timestamp() + interval '5 minutes'
  from public.crawl_sources s, public.crawl_generations g
  where t.id = for_task and t.lease_token = for_token and t.lease_expires_at > clock_timestamp()
    and s.id = t.source_id and s.collection_enabled and s.paused_reason is null
    and g.id = t.generation_id and g.is_current and g.paused_reason is null;
  return found;
end;
$$;

create function public.finish_crawl_fetch(
  for_task uuid, for_token uuid, parsed_version text, parsed_hash text,
  child_tasks jsonb, parsed_observations jsonb, response_etag text, response_last_modified text,
  unchanged boolean default false
)
returns boolean language plpgsql set search_path = '' as $$
declare
  source uuid;
  scope uuid;
  task public.crawl_tasks%rowtype;
  saved_observations jsonb;
begin
  select t.source_id, t.generation_id into source, scope from public.crawl_tasks t where t.id = for_task;
  perform 1 from public.crawl_sources where id = source and collection_enabled and paused_reason is null for share;
  if not found then return false; end if;
  perform 1 from public.crawl_generations where id = scope and is_current and paused_reason is null for update;
  if not found then return false; end if;
  select * into task from public.crawl_tasks where id = for_task and lease_token = for_token for update;
  if not found or task.lease_expires_at <= clock_timestamp() then return false; end if;

  if unchanged then
    select observations into saved_observations from public.crawl_extractions
    where task_id = for_task and parser_version = parsed_version and content_hash = task.content_hash;
    if not found or task.parser_version is distinct from parsed_version then
      raise exception '304 without a checkpoint for this parser' using errcode = '22023';
    end if;
    parsed_hash := task.content_hash;
    parsed_observations := saved_observations;
    child_tasks := '[]'::jsonb;
  end if;

  if not public.acknowledge_crawl_task(for_task, for_token, parsed_version, parsed_hash, child_tasks, parsed_observations)
  then return false; end if;
  update public.crawl_tasks set
    etag = case when unchanged then coalesce(response_etag, etag) else response_etag end,
    last_modified = case when unchanged then coalesce(response_last_modified, last_modified) else response_last_modified end,
    consecutive_failures = 0
  where id = for_task;
  return true;
end;
$$;

create function public.finish_crawl_attempt(
  for_task uuid, for_token uuid, outcome text, next_at timestamptz, reason text, count_failure boolean
)
returns boolean language plpgsql set search_path = '' as $$
declare
  source public.crawl_sources%rowtype;
  scope uuid;
  task public.crawl_tasks%rowtype;
begin
  if outcome not in ('pending', 'retry_wait', 'failed', 'blocked') then
    raise exception 'Invalid crawl outcome' using errcode = '22023';
  end if;
  select s.* into source from public.crawl_sources s join public.crawl_tasks t on t.source_id = s.id
  where t.id = for_task and s.collection_enabled and s.paused_reason is null for update of s;
  if not found then return false; end if;
  select g.id into scope from public.crawl_generations g join public.crawl_tasks t on t.generation_id = g.id
  where t.id = for_task and g.is_current and g.paused_reason is null for update of g;
  if not found then return false; end if;
  select * into task from public.crawl_tasks where id = for_task and lease_token = for_token for update;
  if not found or task.lease_expires_at <= clock_timestamp() then return false; end if;

  update public.crawl_tasks set status = outcome, available_at = coalesce(next_at, clock_timestamp()),
    last_error = case when outcome = 'pending' and reason is null then last_error else left(reason, 500) end,
    consecutive_failures = consecutive_failures + count_failure::integer,
    lease_owner = null, lease_token = null, lease_expires_at = null
  where id = for_task;
  if outcome = 'blocked' then
    if source.source_key = 'official' then
      update public.crawl_generations set paused_reason = left(reason, 500) where id = scope;
    else
      update public.crawl_sources set paused_reason = left(reason, 500) where id = source.id;
    end if;
  end if;
  return true;
end;
$$;

create function public.reparse_crawl_scope(for_source text, for_scope text)
returns integer language plpgsql set search_path = '' as $$
declare
  source uuid;
  queued integer;
begin
  select id into source from public.crawl_sources
  where source_key = for_source and collection_enabled and paused_reason is null for update;
  if not found then return 0; end if;

  update public.crawl_generations set enumeration_status = 'enumerating', completed_at = null
  where source_id = source and is_current and paused_reason is null and enumeration_status = 'enumerated'
    and (for_scope is null or scope_key = for_scope);
  update public.crawl_tasks t set status = 'pending', available_at = clock_timestamp(),
    etag = null, last_modified = null, consecutive_failures = 0,
    lease_owner = null, lease_token = null, lease_expires_at = null
  from public.crawl_generations g
  where g.id = t.generation_id and g.is_current and g.paused_reason is null and t.source_id = source
    and (for_scope is null or g.scope_key = for_scope);
  get diagnostics queued = row_count;
  return queued;
end;
$$;

create function public.reserve_crawl_request(for_task uuid, for_token uuid, target_host text, min_gap_ms integer)
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
  return jsonb_build_object('token', token);
end;
$$;

create function public.release_crawl_request(target_host text, for_token uuid, cooldown_until timestamptz)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.crawl_hosts set request_token = null, request_expires_at = null,
    available_at = greatest(available_at, cooldown_until)
  where host = target_host and request_token = for_token;
  return found;
end;
$$;

revoke all on function public.claim_crawl_task(text, text, text, text),
  public.renew_crawl_task(uuid, uuid),
  public.finish_crawl_fetch(uuid, uuid, text, text, jsonb, jsonb, text, text, boolean),
  public.finish_crawl_attempt(uuid, uuid, text, timestamptz, text, boolean),
  public.reparse_crawl_scope(text, text),
  public.reserve_crawl_request(uuid, uuid, text, integer),
  public.release_crawl_request(text, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.claim_crawl_task(text, text, text, text),
  public.renew_crawl_task(uuid, uuid),
  public.finish_crawl_fetch(uuid, uuid, text, text, jsonb, jsonb, text, text, boolean),
  public.finish_crawl_attempt(uuid, uuid, text, timestamptz, text, boolean),
  public.reparse_crawl_scope(text, text),
  public.reserve_crawl_request(uuid, uuid, text, integer),
  public.release_crawl_request(text, uuid, timestamptz)
to service_role;
