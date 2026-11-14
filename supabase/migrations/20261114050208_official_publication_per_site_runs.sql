-- Keep official publication fast (#546 follow-up, epic #536). publish_legacy_crawl_findings republishes every eligible
-- finding of a run and matches each title against the show catalogue, so one frontier run per UTC day grew until the
-- whole tick hit the statement timeout (and the aggregate sources' publishing failed with it). Now: one frontier run per
-- site per UTC day (a few dozen findings each), and a tick stops starting official items after 15 seconds.
-- Copied whole from 20261114002025_official_findings_publication.sql.
create or replace function public.publish_official_findings(batch_size integer default 25)
returns jsonb language plpgsql set search_path = '' as $$
declare
  item record;
  run uuid;
  made integer;
  total integer := 0;
  processed integer := 0;
  skipped integer := 0;
  failed integer := 0;
  started timestamptz := clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(419, 430) then return jsonb_build_object('busy', true); end if;

  for item in
    select e.id, e.observations, e.parser_version, e.content_hash, g.site_id, t.id as task_id,
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
    -- Publishing a run's findings runs show matching for each one, so keep a tick short: the rest wait for the next minute.
    exit when clock_timestamp() - started > interval '15 seconds';
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
        and r.summary->>'site' is not distinct from item.site_id::text
      order by r.created_at limit 1;
      if run is null then
        insert into public.crawl_runs (pipeline, kind, method, status, venue_ids, budget_usd, started_at, finished_at, summary)
        values ('frontier', 'whats_on', 'rules', 'done', '{}', 0, now(), now(), jsonb_build_object('site', item.site_id)) returning id into run;
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
