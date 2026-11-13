-- Back off, then park, publication items that keep failing (#539, epic #536).
-- Failing items wait 5, 10, 20, 40, then 60 minutes and are parked on the 10th failure in a row.
-- An item still waiting for a venue 14 days after it was queued is parked as venue_never_resolved.
-- Parked items are skipped until an admin asks (admin_retry_crawl_publication). The publishers and
-- admin_crawl_overview are copied whole from 20261113215008_crawl_publication_in_database.sql.

alter table public.crawl_publication_queue
  add column identity_attempts integer not null default 0,
  add column run_attempts integer not null default 0,
  add column parked_at timestamptz,
  add column parked_reason text;

create or replace function public.publish_crawl_identities(for_source text, batch_size integer default 25)
returns jsonb language plpgsql set search_path = '' as $$
declare
  source uuid;
  item record;
  observed jsonb;
  complete boolean;
  processed integer := 0;
  deferred integer := 0;
  failed integer := 0;
begin
  -- Serialise automatic identity matching across sources. Other workers can
  -- continue fetching, and a process failure releases the transaction lock.
  if not pg_try_advisory_xact_lock(419, 423) then return jsonb_build_object('busy', true); end if;
  select id into source from public.crawl_sources
  where source_key = for_source and publication_enabled for share;
  if not found then return jsonb_build_object('inactive', true); end if;

  for item in
    select e.id, e.observations, e.parser_version, e.content_hash, q.queued_at, t.id as task_id, t.stage, g.is_current
    from public.crawl_publication_queue q
    join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    where t.source_id = source and q.identity_processed_at is null and q.parked_at is null
      and q.identity_available_at <= now()
    order by case t.stage when 'venue' then 0 when 'event' then 1 else 2 end, q.identity_available_at, q.queued_at, e.id
    limit least(100, greatest(0, coalesce(batch_size, 25))) for update of q skip locked
  loop
    begin
      complete := true;
      perform 1 from public.crawl_tasks t where t.id = item.task_id
        and t.parser_version = item.parser_version and t.content_hash = item.content_hash for share;
      if item.is_current and found then
        for observed in select value from jsonb_array_elements(item.observations) loop
          if item.stage = 'venue' and observed->>'observation_kind' = 'venue' then
            perform public.crawl_match_venue(source, observed, item.id);
          elsif item.stage = 'event' and observed->>'observation_kind' = 'event' then
            if not public.crawl_match_show(source, for_source, observed, item.id) then complete := false; end if;
          end if;
        end loop;
      end if;
      if complete then
        update public.crawl_publication_queue set identity_processed_at = now(), identity_error = null,
          identity_attempts = 0
        where extraction_id = item.id;
        processed := processed + 1;
      else
        -- Waiting for a venue is not a failure, but it cannot last for ever.
        update public.crawl_publication_queue set identity_available_at = now() + interval '5 minutes',
          identity_error = 'awaiting_venue_detail',
          parked_at = case when item.queued_at < now() - interval '14 days' then now() end,
          parked_reason = case when item.queued_at < now() - interval '14 days' then 'venue_never_resolved' end
        where extraction_id = item.id;
        deferred := deferred + 1;
      end if;
    exception when others then
      -- Wait 5, 10, 20, 40, then 60 minutes; park on the tenth failure in a row.
      update public.crawl_publication_queue set identity_attempts = identity_attempts + 1,
        identity_available_at = now() + least(interval '60 minutes', interval '5 minutes' * power(2, identity_attempts)),
        identity_error = 'identity_transaction:' || sqlstate,
        parked_at = case when identity_attempts + 1 >= 10 then now() else parked_at end,
        parked_reason = case when identity_attempts + 1 >= 10 then 'identity_transaction:' || sqlstate else parked_reason end
      where extraction_id = item.id;
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('processed', processed, 'deferred', deferred, 'failed', failed);
end;
$$;

create or replace function public.publish_crawl_run_evidence(for_source text, batch_size integer default 25)
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
    select e.id, e.extracted_at, e.observations, e.parser_version, e.content_hash, q.queued_at,
      t.id as task_id, t.canonical_url, t.stage, g.is_current
    from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    where t.source_id = source and q.processed_at is null and q.identity_processed_at is not null
      and q.parked_at is null
      and q.run_available_at <= now()
    order by q.run_available_at, q.queued_at, e.id
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
          last_error = 'awaiting_segment_venue',
          parked_at = case when item.queued_at < now() - interval '14 days' then now() end,
          parked_reason = case when item.queued_at < now() - interval '14 days' then 'venue_never_resolved' end
        where extraction_id = item.id;
        deferred := deferred + 1;
      else
        update public.crawl_publication_queue set processed_at = now(), last_error = null, run_attempts = 0
        where extraction_id = item.id;
        processed := processed + 1;
      end if;
      published := published + recorded_segments;
    exception when others then
      update public.crawl_publication_queue set run_attempts = run_attempts + 1,
        run_available_at = now() + least(interval '60 minutes', interval '5 minutes' * power(2, run_attempts)),
        last_error = 'run_transaction:' || sqlstate,
        parked_at = case when run_attempts + 1 >= 10 then now() else parked_at end,
        parked_reason = case when run_attempts + 1 >= 10 then 'run_transaction:' || sqlstate else parked_reason end
      where extraction_id = item.id;
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('processed', processed, 'observed_segments', published, 'deferred', deferred, 'failed', failed);
end;
$$;

create function public.admin_retry_crawl_publication(for_source text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  source uuid;
  changed integer;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into source from public.crawl_sources where source_key = for_source;
  if source is null then raise exception 'Unknown crawl source' using errcode = '22023'; end if;
  update public.crawl_publication_queue q set parked_at = null, parked_reason = null,
    identity_attempts = 0, run_attempts = 0, identity_available_at = now(), run_available_at = now()
  from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id
  where q.extraction_id = e.id and t.source_id = source and q.parked_at is not null;
  get diagnostics changed = row_count;
  insert into public.crawl_admin_actions (actor_id, source_id, operation, affected)
  values (auth.uid(), source, 'retry_publication', changed);
  return changed;
end;
$$;
revoke all on function public.admin_retry_crawl_publication(text) from public, anon;
grant execute on function public.admin_retry_crawl_publication(text) to authenticated;

create or replace function public.admin_crawl_overview(for_source text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  latest_run uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into latest_run from public.crawl_runs order by created_at desc limit 1;
  return jsonb_build_object(
    'run_dates', (select jsonb_build_object('total', count(*), 'from_sources', count(*) filter (where not legacy))
      from public.catalogue_effective_runs),
    'sources', coalesce((
      select jsonb_object_agg(s.source_key, jsonb_build_object(
        'next_refresh_at', (
          select min(t.refresh_at) from public.crawl_tasks t
          join public.crawl_generations g on g.id = t.generation_id and g.is_current
          where t.source_id = s.id and t.stage = 'directory' and t.refresh_at is not null),
        'unchecked_pages', (
          select count(*) from public.crawl_publication_queue q
          join public.crawl_extractions e on e.id = q.extraction_id
          join public.crawl_tasks t on t.id = e.task_id
          where t.source_id = s.id and q.identity_processed_at is null and q.parked_at is null),
        'attention', coalesce((
          select jsonb_agg(q.a order by q.a->>'stage', q.a->>'status') from (
            select jsonb_build_object('stage', t.stage, 'status', t.status, 'n', count(*),
              'reason', (array_agg(t.last_error order by t.last_attempt_at desc nulls last) filter (where t.last_error is not null))[1]) as a
            from public.crawl_tasks t
            join public.crawl_generations g on g.id = t.generation_id and g.is_current
            where t.source_id = s.id and t.status in ('failed', 'blocked', 'retry_wait')
            group by t.stage, t.status) q), '[]'::jsonb)
          || coalesce((
            select jsonb_build_array(jsonb_build_object('kind', 'publication_parked', 'source_key', s.source_key,
              'count', p.n, 'reason', p.reason))
            from (
              select count(*) as n, mode() within group (order by q.parked_reason) as reason
              from public.crawl_publication_queue q
              join public.crawl_extractions e on e.id = q.extraction_id
              join public.crawl_tasks t on t.id = e.task_id
              where t.source_id = s.id and q.parked_at is not null) p
            where p.n > 0), '[]'::jsonb)))
      from public.crawl_sources s where for_source is null or s.source_key = for_source), '{}'::jsonb),
    'publication', coalesce((
      select jsonb_object_agg(s.source_key, jsonb_build_object('last_published_at', (
        select max(k.finished_at) from public.crawl_publication_ticks k
        where coalesce((k.per_source->s.source_key->>'processed')::integer, 0) > 0)))
      from public.crawl_sources s where for_source is null or s.source_key = for_source), '{}'::jsonb),
    'official', jsonb_build_object(
      'sites', (select count(*) from public.crawl_sites),
      'sites_needing_attention', (select count(*) from public.crawl_sites where status = 'needs_attention'),
      'last_run_at', (select created_at from public.crawl_runs where id = latest_run),
      'last_run_status', (select status from public.crawl_runs where id = latest_run),
      'findings_to_review', (select count(*) from public.crawl_findings f
        where f.run_id = latest_run and f.review is null and f.kind = 'show')),
    'recent_actions', coalesce((
      select jsonb_agg(jsonb_build_object('at', a.created_at, 'source', s.source_key, 'operation', a.operation,
        'affected', a.affected, 'who', coalesce(p.display_name, p.handle, 'Unknown')) order by a.created_at desc)
      from (
        select x.* from public.crawl_admin_actions x
        join public.crawl_sources sx on sx.id = x.source_id
        where for_source is null or sx.source_key = for_source
        order by x.created_at desc limit 10
      ) a
      join public.crawl_sources s on s.id = a.source_id
      left join public.profiles p on p.id = a.actor_id), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_crawl_overview(text) from public, anon;
grant execute on function public.admin_crawl_overview(text) to authenticated;
