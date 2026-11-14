-- Read a pasted show page first, on the next crawl run (#564, epic #562).
-- 1. The 'Pasted links' source (web_links): Crawling on because an admin pasted the page; Publication off until the owner
--    turns it on. Its hosts are added as links are pasted, so sync_crawl_source keeps the stored hosts when the adapter
--    states none (hosts null). Copied whole from 20261113222739_crawl_source_registry.sql.
-- 2. claim_due_crawl_task puts priority-3 pages first even before their first read (copied whole from
--    20261107233921_incremental_crawl_scheduling.sql, one expression changed).
-- 3. queue_pasted_show_page / finish_crawl_link_request / crawl_link_requests_to_process: the crawler's side of a request.

create or replace function public.sync_crawl_source(key text, name text, source_kind text, hosts text[],
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
    allowed_hosts = case when hosts is null then public.crawl_sources.allowed_hosts else excluded.allowed_hosts end, min_interval_ms = excluded.min_interval_ms,
    authority = excluded.authority, adapter_version = excluded.adapter_version;
end;
$$;

insert into public.crawl_sources (source_key, display_name, kind, allowed_hosts, min_interval_ms, authority, adapter_version, collection_enabled, publication_enabled)
values ('web_links', 'Pasted links', 'aggregate', '{}', 5000, 1, 'web-links-v1', true, false)
on conflict (source_key) do nothing;

create or replace function public.claim_due_crawl_task(for_source text, for_stage text, for_scope text, worker text, expected_parser text)
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
    -- A page an admin pasted (priority 3) goes first, even before its first read.
    cross join lateral (select case when t.priority >= 3 then 3 when t.last_success_at is null then 2 else t.priority end as class) priority
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

create function public.crawl_link_requests_to_process(batch_size integer default 10) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'url', r.url, 'host', r.host) order by r.created_at), '[]'::jsonb)
  from (select * from public.crawl_link_requests where status = 'new' and not (result ? 'checked')
    order by created_at limit least(greatest(batch_size, 0), 50)) r;
$$;

-- Queues the pasted page as one event task, ahead of everything else, in the source's own 'pasted' generation.
create function public.queue_pasted_show_page(request uuid, for_source text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  req public.crawl_link_requests%rowtype;
  generation uuid;
  task uuid;
begin
  select * into req from public.crawl_link_requests where id = request for update;
  if not found then raise exception 'Unknown link request' using errcode = '22023'; end if;
  if for_source = 'web_links' then
    update public.crawl_sources set allowed_hosts = array(select distinct h from unnest(allowed_hosts || array[req.host,
      case when req.host like 'www.%' then substr(req.host, 5) else 'www.' || req.host end]) h order by h)
    where source_key = 'web_links';
  end if;
  select g.id into generation from public.crawl_generations g join public.crawl_sources s on s.id = g.source_id
  where s.source_key = for_source and g.scope_key = 'pasted' and g.is_current;
  if generation is null then
    generation := public.start_crawl_generation(for_source, 'pasted', 'event', req.url);
  else
    perform public.enqueue_crawl_task(generation, 'event', req.url);
  end if;
  select t.id into task from public.crawl_tasks t
  where t.generation_id = generation and t.stage = 'event' and t.canonical_url = req.url;
  update public.crawl_tasks set priority = 3, available_at = now(),
    refresh_at = case when status = 'succeeded' then now() else refresh_at end where id = task;
  update public.crawl_link_requests set status = 'done', kind = 'show_page', note = null,
    result = jsonb_build_object('source', for_source, 'task', task), updated_at = now() where id = request;
  return task;
end;
$$;

create function public.finish_crawl_link_request(request uuid, new_status text, new_kind text, new_note text, new_result jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  update public.crawl_link_requests set status = new_status, kind = new_kind, note = left(new_note, 300),
    result = coalesce(new_result, '{}'::jsonb), updated_at = now() where id = request;
$$;

revoke all on function public.crawl_link_requests_to_process(integer), public.queue_pasted_show_page(uuid, text),
  public.finish_crawl_link_request(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.crawl_link_requests_to_process(integer), public.queue_pasted_show_page(uuid, text),
  public.finish_crawl_link_request(uuid, text, text, text, jsonb) to service_role;
