-- Publish crawl results from inside the database every minute (#538, epic #536).
-- 1. Deferred items go to the back of the queue (ordering change only in the two publishers,
--    copied whole from 20261107180040_crawl_catalogue_identities.sql and
--    20261107225200_reconcile_run_evidence.sql).
-- 2. crawl_publication_ticks: one row per tick that did something or failed, kept 3 days.
-- 3. run_crawl_publication(): up to 3 passes over publication-enabled sources, stops after 20 s.
-- 4. pg_cron job catalogue-publication every minute.
-- 5. admin_crawl_overview gains `publication` (copied whole from 20261111160000_crawl_admin_overview.sql).
-- Stop the job with: select cron.unschedule('catalogue-publication');

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
    select e.id, e.observations, e.parser_version, e.content_hash, t.id as task_id, t.stage, g.is_current
    from public.crawl_publication_queue q
    join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    where t.source_id = source and q.identity_processed_at is null and q.identity_available_at <= now()
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
        update public.crawl_publication_queue set identity_processed_at = now(), identity_error = null
        where extraction_id = item.id;
        processed := processed + 1;
      else
        update public.crawl_publication_queue set identity_available_at = now() + interval '5 minutes',
          identity_error = 'awaiting_venue_detail' where extraction_id = item.id;
        deferred := deferred + 1;
      end if;
    exception when others then
      update public.crawl_publication_queue set identity_available_at = now() + interval '5 minutes',
        identity_error = 'identity_transaction:' || sqlstate where extraction_id = item.id;
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
    select e.id, e.extracted_at, e.observations, e.parser_version, e.content_hash,
      t.id as task_id, t.canonical_url, t.stage, g.is_current
    from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    where t.source_id = source and q.processed_at is null and q.identity_processed_at is not null
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

create table public.crawl_publication_ticks (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  per_source jsonb not null
);
create index crawl_publication_ticks_finished on public.crawl_publication_ticks (finished_at desc);
alter table public.crawl_publication_ticks enable row level security;
revoke all on public.crawl_publication_ticks from public, anon, authenticated;
grant select on public.crawl_publication_ticks to authenticated;
create policy "Admins read crawl publication ticks"
  on public.crawl_publication_ticks for select
  to authenticated
  using (public.is_admin());

create function public.run_crawl_publication()
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

select cron.schedule('catalogue-publication', '* * * * *', 'select public.run_crawl_publication()');

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
          where t.source_id = s.id and q.identity_processed_at is null),
        'attention', coalesce((
          select jsonb_agg(q.a order by q.a->>'stage', q.a->>'status') from (
            select jsonb_build_object('stage', t.stage, 'status', t.status, 'n', count(*),
              'reason', (array_agg(t.last_error order by t.last_attempt_at desc nulls last) filter (where t.last_error is not null))[1]) as a
            from public.crawl_tasks t
            join public.crawl_generations g on g.id = t.generation_id and g.is_current
            where t.source_id = s.id and t.status in ('failed', 'blocked', 'retry_wait')
            group by t.stage, t.status) q), '[]'::jsonb)))
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
