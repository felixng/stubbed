-- Area labels, and official sites in the summary (#546, epic #536, step C5).
-- An area is one generation. For an official site it is the site's host (without a leading www.); for the other
-- sources it stays null and the admin falls back to the area names it knows. crawl_source_summary now includes the
-- official source so the hub can show its pages line like the other sources (it was left out while official sites had
-- no page-queue tasks). Both functions are copied whole from 20261113120000_crawl_source_summary.sql.
create or replace function public.crawl_source_progress(
  for_source text default null, for_generation uuid default null,
  for_stage text default 'venue', for_status text default null,
  page_size integer default 25, page_offset integer default 0,
  for_all_areas boolean default false
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
    select id, scope_key, enumeration_status, started_at, completed_at, is_current,
      (select regexp_replace(substring(cs.whats_on_url from '^https?://([^/]+)'), '^www\.', '') from public.crawl_sites cs where cs.id = cg.site_id) as label
    from public.crawl_generations cg where source_id = source.id
    order by started_at desc, id desc limit 40
  ) g;

  with recursive tasks as materialized (
    select t.*, case when t.status = 'leased' and t.lease_expires_at <= now() then 'pending' else t.status end as visible_status
    from public.crawl_tasks t
    where t.generation_id = scan.id
      or (for_all_areas and t.generation_id in (
        select g.id from public.crawl_generations g where g.source_id = source.id and g.is_current))
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
      t.consecutive_failures, t.refresh_at, t.generation_id
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

create or replace function public.crawl_source_summary(for_source text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return coalesce((
    with cur as (
      select t.source_id, t.generation_id, t.stage,
        case when t.status = 'leased' and t.lease_expires_at <= now() then 'pending' else t.status end as st,
        t.available_at, t.last_success_at
      from public.crawl_tasks t
      join public.crawl_generations g on g.id = t.generation_id and g.is_current
    ), counted as (
      select source_id, generation_id, stage,
        count(*) as known,
        count(*) filter (where st = 'succeeded') as read,
        count(*) filter (where st in ('pending', 'leased', 'retry_wait')) as waiting,
        count(*) filter (where st in ('pending', 'retry_wait') and available_at <= now()) as due,
        count(*) filter (where st in ('failed', 'blocked')) as stuck,
        count(*) filter (where st = 'retry_wait') as retrying,
        count(*) filter (where last_success_at > now() - interval '3 hours') as read_3h,
        max(last_success_at) as last_read_at
      from cur group by source_id, generation_id, stage
    )
    select jsonb_object_agg(s.source_key, jsonb_build_object(
      'collection_enabled', s.collection_enabled, 'publication_enabled', s.publication_enabled,
      'operator_paused_at', s.operator_paused_at, 'paused_reason', s.paused_reason, 'withdrawn_at', s.withdrawn_at,
      'totals', (select jsonb_build_object('known', coalesce(sum(known), 0), 'read', coalesce(sum(read), 0), 'waiting', coalesce(sum(waiting), 0),
          'due', coalesce(sum(due), 0), 'stuck', coalesce(sum(stuck), 0), 'retrying', coalesce(sum(retrying), 0),
          'read_3h', coalesce(sum(read_3h), 0), 'last_read_at', max(last_read_at))
        from counted c where c.source_id = s.id),
      'stages', coalesce((select jsonb_object_agg(x.stage, x.counts) from (
          select c.stage, jsonb_build_object('known', sum(known), 'read', sum(read), 'waiting', sum(waiting), 'stuck', sum(stuck), 'retrying', sum(retrying)) as counts
          from counted c where c.source_id = s.id group by c.stage) x), '{}'::jsonb),
      'areas', coalesce((select jsonb_agg(a order by (a->>'known')::int desc, a->>'scope_key') from (
          select jsonb_build_object('id', g.id, 'scope_key', g.scope_key, 'started_at', g.started_at,
            'enumeration_status', g.enumeration_status,
            'label', (select regexp_replace(substring(cs.whats_on_url from '^https?://([^/]+)'), '^www\.', '') from public.crawl_sites cs where cs.id = g.site_id),
            'known', coalesce(sum(c.known), 0), 'read', coalesce(sum(c.read), 0), 'waiting', coalesce(sum(c.waiting), 0),
            'due', coalesce(sum(c.due), 0), 'stuck', coalesce(sum(c.stuck), 0), 'read_3h', coalesce(sum(c.read_3h), 0),
            'last_read_at', max(c.last_read_at),
            'stages', coalesce(jsonb_object_agg(c.stage, jsonb_build_object('known', c.known, 'read', c.read)) filter (where c.stage is not null), '{}'::jsonb)) as a
          from public.crawl_generations g left join counted c on c.generation_id = g.id
          where g.source_id = s.id and g.is_current
          group by g.id, g.scope_key, g.started_at, g.enumeration_status, g.site_id) areas), '[]'::jsonb)))
    from public.crawl_sources s
    where for_source is null or s.source_key = for_source
  ), '{}'::jsonb);
end;
$$;
