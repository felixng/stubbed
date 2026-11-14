-- Publish official-site findings from the publication queue (#543, epic #536, step C2).
-- 1. crawl_runs.pipeline may be 'frontier' (one `done` run per UTC day holds the frontier's findings).
-- 2. The aggregate publishers never touch the official source (copied whole from
--    20261113221542_crawl_publication_parking.sql, with `and kind <> 'official'` in the source lookup).
-- 3. publish_official_findings turns official_finding observations back into crawl_findings rows and calls the
--    existing publish_legacy_crawl_findings, so every publication rule, review screen and the diary score stay as they are.
-- 4. run_crawl_publication also calls it (copied whole from 20261113215008_crawl_publication_in_database.sql).

alter table public.crawl_runs drop constraint crawl_runs_pipeline_check;
alter table public.crawl_runs add constraint crawl_runs_pipeline_check check (pipeline in ('legacy', 'discover', 'frontier'));

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
  where source_key = for_source and publication_enabled and kind <> 'official' for share;
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
  where source_key = for_source and publication_enabled and withdrawn_at is null and kind <> 'official' for share;
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

create function public.publish_official_findings(batch_size integer default 25)
returns jsonb language plpgsql set search_path = '' as $$
declare
  item record;
  run uuid;
  made integer;
  total integer := 0;
  processed integer := 0;
  skipped integer := 0;
  failed integer := 0;
begin
  if not pg_try_advisory_xact_lock(419, 430) then return jsonb_build_object('busy', true); end if;

  for item in
    select e.id, e.observations, e.parser_version, e.content_hash, t.id as task_id,
      t.parser_version as task_parser, t.content_hash as task_hash, g.is_current
    from public.crawl_publication_queue q
    join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    join public.crawl_sources s on s.id = t.source_id and s.source_key = 'official'
    where q.processed_at is null and q.parked_at is null and q.run_available_at <= now()
    order by q.run_available_at, q.queued_at, e.id
    limit least(100, greatest(0, coalesce(batch_size, 25))) for update of q skip locked
  loop
    begin
      -- Not the task's current extraction, or not the current generation: nothing to publish.
      if not item.is_current or item.parser_version is distinct from item.task_parser
         or item.content_hash is distinct from item.task_hash then
        update public.crawl_publication_queue set identity_processed_at = coalesce(identity_processed_at, now()),
          processed_at = now(), last_error = null, identity_error = null where extraction_id = item.id;
        skipped := skipped + 1;
        continue;
      end if;

      select r.id into run from public.crawl_runs r
      where r.pipeline = 'frontier' and r.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      order by r.created_at limit 1;
      if run is null then
        insert into public.crawl_runs (pipeline, kind, method, status, venue_ids, budget_usd, started_at, finished_at)
        values ('frontier', 'whats_on', 'rules', 'done', '{}', 0, now(), now()) returning id into run;
      end if;

      with obs as (
        select distinct on (o.venue_id, o.raw_title, o.start_date, o.end_date, o.fetched_url) o.*
        from jsonb_to_recordset(item.observations) as o(observation_kind text, venue_id uuid, source_url text, raw_title text,
          stage_text text, start_date date, end_date date, date_text text, kind text, method text, confidence numeric,
          evidence text, page_checked boolean, rule_id uuid, fetched_url text)
        where o.observation_kind = 'official_finding' and o.method in ('structured', 'rules')
        order by o.venue_id, o.raw_title, o.start_date, o.end_date, o.fetched_url
      ), added as (
        insert into public.crawl_findings (run_id, venue_id, source_url, raw_title, stage_text, start_date, end_date, date_text,
          kind, method, confidence, evidence, page_checked, rule_id, fetched_url)
        select run, o.venue_id, o.source_url, o.raw_title, o.stage_text, o.start_date, o.end_date, o.date_text,
          o.kind, o.method, o.confidence, o.evidence, coalesce(o.page_checked, false),
          case when exists (select 1 from public.crawl_rules cr where cr.id = o.rule_id) then o.rule_id end, o.fetched_url
        from obs o
        where not exists (select 1 from public.crawl_findings f where f.run_id = run
          and f.venue_id is not distinct from o.venue_id and f.raw_title = o.raw_title
          and f.start_date is not distinct from o.start_date and f.end_date is not distinct from o.end_date
          and f.fetched_url is not distinct from o.fetched_url)
        returning venue_id
      )
      select count(*) into made from added;

      update public.crawl_runs r set venue_ids = array(
        select distinct v from unnest(r.venue_ids || array(select distinct f.venue_id from public.crawl_findings f
          where f.run_id = run and f.venue_id is not null)) v)
      where r.id = run;

      perform public.publish_legacy_crawl_findings(run, false);
      perform public.queue_crawl_titles(run, true);

      update public.crawl_publication_queue set identity_processed_at = coalesce(identity_processed_at, now()),
        processed_at = now(), last_error = null, run_attempts = 0 where extraction_id = item.id;
      processed := processed + 1;
      total := total + made;
    exception when others then
      update public.crawl_publication_queue set run_attempts = run_attempts + 1,
        run_available_at = now() + least(interval '60 minutes', interval '5 minutes' * power(2, run_attempts)),
        last_error = 'official_transaction:' || sqlstate,
        parked_at = case when run_attempts + 1 >= 10 then now() else parked_at end,
        parked_reason = case when run_attempts + 1 >= 10 then 'official_transaction:' || sqlstate else parked_reason end
      where extraction_id = item.id;
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('processed', processed, 'skipped', skipped, 'findings', total, 'failed', failed);
end;
$$;
revoke all on function public.publish_official_findings(integer) from public, anon, authenticated;
grant execute on function public.publish_official_findings(integer) to service_role;

create or replace function public.run_crawl_publication()
returns void language plpgsql set search_path = '' as $$
declare
  started timestamptz := clock_timestamp();
  stats jsonb := '{}'::jsonb;
  src record;
  ident jsonb;
  runs jsonb;
  cur jsonb;
  pass integer;
  moved integer;
  got integer;
  active boolean := false;
  bridged jsonb;
begin
  for pass in 1..3 loop
    moved := 0;
    for src in
      select source_key from public.crawl_sources
      where publication_enabled and withdrawn_at is null order by source_key
    loop
      exit when clock_timestamp() - started > interval '20 seconds';
      begin
        ident := public.publish_crawl_identities(src.source_key, 100);
        runs := public.publish_crawl_run_evidence(src.source_key, 100);
        cur := coalesce(stats->src.source_key, '{}'::jsonb);
        got := coalesce((ident->>'processed')::integer, 0) + coalesce((runs->>'processed')::integer, 0);
        moved := moved + got;
        stats := jsonb_set(stats, array[src.source_key], cur || jsonb_build_object(
          'processed', coalesce((cur->>'processed')::integer, 0) + got,
          'deferred', coalesce((cur->>'deferred')::integer, 0)
            + coalesce((ident->>'deferred')::integer, 0) + coalesce((runs->>'deferred')::integer, 0),
          'failed', coalesce((cur->>'failed')::integer, 0)
            + coalesce((ident->>'failed')::integer, 0) + coalesce((runs->>'failed')::integer, 0),
          'observed_segments', coalesce((cur->>'observed_segments')::integer, 0)
            + coalesce((runs->>'observed_segments')::integer, 0)), true);
      exception when others then
        stats := jsonb_set(stats, array[src.source_key],
          coalesce(stats->src.source_key, '{}'::jsonb) || jsonb_build_object('error', sqlstate), true);
      end;
    end loop;
    -- Official-site findings are published from the same queue, by the bridge into crawl_findings (#543).
    if clock_timestamp() - started <= interval '20 seconds' then
      begin
        bridged := public.publish_official_findings(100);
        moved := moved + coalesce((bridged->>'processed')::integer, 0);
        cur := coalesce(stats->'official', '{}'::jsonb);
        stats := jsonb_set(stats, array['official'], cur || jsonb_build_object(
          'processed', coalesce((cur->>'processed')::integer, 0) + coalesce((bridged->>'processed')::integer, 0),
          'skipped', coalesce((cur->>'skipped')::integer, 0) + coalesce((bridged->>'skipped')::integer, 0),
          'findings', coalesce((cur->>'findings')::integer, 0) + coalesce((bridged->>'findings')::integer, 0),
          'failed', coalesce((cur->>'failed')::integer, 0) + coalesce((bridged->>'failed')::integer, 0)), true);
      exception when others then
        stats := jsonb_set(stats, array['official'],
          coalesce(stats->'official', '{}'::jsonb) || jsonb_build_object('error', sqlstate), true);
      end;
    end if;
    exit when moved = 0 or clock_timestamp() - started > interval '20 seconds';
  end loop;

  select coalesce(bool_or(
      coalesce((v->>'processed')::integer, 0) > 0 or coalesce((v->>'deferred')::integer, 0) > 0
      or coalesce((v->>'failed')::integer, 0) > 0 or v ? 'error'), false)
    into active from jsonb_each(stats) e(k, v);
  if active then
    insert into public.crawl_publication_ticks (started_at, finished_at, per_source)
    values (started, clock_timestamp(), stats);
  end if;
  delete from public.crawl_publication_ticks where finished_at < now() - interval '3 days';
end;
$$;
revoke all on function public.run_crawl_publication() from public, anon, authenticated, service_role;
