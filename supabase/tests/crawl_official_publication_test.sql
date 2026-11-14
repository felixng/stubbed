begin;
select no_plan();

insert into public.venues (id, name, city) values ('a5430000-0000-0000-0000-000000000001', 'Bridge Theatre', 'London');
insert into public.crawl_sites (id, whats_on_url) values ('b5430000-0000-0000-0000-000000000001', 'https://bridge-site.test/whats-on/');
update public.crawl_sources set collection_enabled = true, paused_reason = null where source_key = 'official';

create function pg_temp.obs(title text, start_date text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'official_finding', 'page_type', 'whats_on',
    'venue_id', 'a5430000-0000-0000-0000-000000000001', 'source_url', 'https://bridge-site.test/whats-on/',
    'raw_title', title, 'start_date', start_date, 'end_date', null, 'date_text', start_date, 'kind', 'show',
    'method', 'structured', 'confidence', 0.9, 'evidence', title, 'page_checked', start_date is not null,
    'rule_id', null, 'fetched_url', 'https://bridge-site.test/whats-on/') || extra;
$$;

-- Acknowledges a new extraction of the one task and returns its id.
create function pg_temp.extract(hash text, observations jsonb) returns uuid language plpgsql as $$
declare
  task uuid;
  token uuid := gen_random_uuid();
begin
  select id into task from public.crawl_tasks where canonical_url = 'https://bridge-site.test/whats-on/';
  if task is null then
    task := public.enqueue_crawl_task(public.start_crawl_generation('official', 'b5430000-0000-0000-0000-000000000001', 'venue',
      'https://bridge-site.test/whats-on/', 'b5430000-0000-0000-0000-000000000001'),
      'venue', 'https://bridge-site.test/whats-on/');
  end if;
  update public.crawl_tasks set status = 'leased', lease_owner = 'fixture', lease_token = token,
    lease_expires_at = now() + interval '5 minutes' where id = task;
  perform public.acknowledge_crawl_task(task, token, 'official-v2', repeat(hash, 64), '[]', observations);
  return (select id from public.crawl_extractions where task_id = task order by extracted_at desc, id desc limit 1);
end;
$$;

select ok(not has_function_privilege('authenticated', 'public.publish_official_findings(integer)', 'execute'), 'members cannot publish official findings');

set local role service_role;
select pg_temp.extract('a', jsonb_build_array(pg_temp.obs('Bridge Play', '2026-12-01'), pg_temp.obs('Undated Play', null)));
select is(public.publish_official_findings(25), '{"processed":1,"skipped":0,"findings":2,"failed":0}'::jsonb, 'the first call publishes the item');
reset role;
select is((select count(*) from public.crawl_runs where pipeline = 'frontier' and status = 'done' and created_at::date = current_date), 1::bigint, 'one frontier run for today');
select is((select count(*) from public.crawl_findings f join public.crawl_runs r on r.id = f.run_id where r.pipeline = 'frontier'), 2::bigint, 'it holds two findings');
select is((select count(*) from public.runs where venue_id = 'a5430000-0000-0000-0000-000000000001'), 1::bigint, 'one run for the dated title');
select ok((select bool_and(processed_at is not null and identity_processed_at is not null) from public.crawl_publication_queue), 'the queue row is marked');

set local role service_role;
select is((public.publish_official_findings(25))->>'processed', '0', 'a second call does nothing');
reset role;
select is((select count(*) from public.crawl_findings), 2::bigint, 'no new findings');

-- A newer extraction with the same dated show and a new one.
set local role service_role;
select pg_temp.extract('b', jsonb_build_array(pg_temp.obs('Bridge Play', '2026-12-01'), pg_temp.obs('Second Play', '2027-01-10')));
select is((public.publish_official_findings(25))->>'findings', '1', 'only the new finding is added');
reset role;
select is((select count(*) from public.crawl_findings f join public.crawl_runs r on r.id = f.run_id where r.pipeline = 'frontier'), 3::bigint, 'the run holds three findings');
select is((select count(*) from public.crawl_runs where pipeline = 'frontier'), 1::bigint, 'still one run for the day');
select is((select count(*) from public.runs where venue_id = 'a5430000-0000-0000-0000-000000000001'), 2::bigint, 'runs holds two rows');

-- An extraction that is no longer the task's current one is skipped.
set local role service_role;
select pg_temp.extract('c', jsonb_build_array(pg_temp.obs('Stale Play', '2027-02-01')));
select pg_temp.extract('d', jsonb_build_array(pg_temp.obs('Fresh Play', '2027-03-01')));
select is(public.publish_official_findings(25), '{"processed":1,"skipped":1,"findings":1,"failed":0}'::jsonb, 'the stale extraction is skipped');
reset role;
select is((select count(*) from public.crawl_findings where raw_title = 'Stale Play'), 0::bigint, 'nothing from the stale extraction');

-- The aggregate publishers never touch the official source, even with its switch on.
update public.crawl_sources set publication_enabled = true where source_key = 'official';
set local role service_role;
select is(public.publish_crawl_identities('official'), '{"inactive":true}'::jsonb, 'identities ignore the official source');
select is(public.publish_crawl_run_evidence('official'), '{"inactive":true}'::jsonb, 'run evidence ignores the official source');
select pg_temp.extract('e', jsonb_build_array(pg_temp.obs('Evidence Play', '2027-04-01')));
select public.publish_official_findings(25);
reset role;
select ok((select count(*) from public.crawl_run_evidence e join public.crawl_sources s on s.id = e.source_id
  where s.source_key = 'official' and e.raw_title = 'Evidence Play') > 0, 'with the switch on the dated finding also enters the evidence layer');

-- The tick publishes an official item and reports it.
select pg_temp.extract('f', jsonb_build_array(pg_temp.obs('Tick Play', '2027-05-01')));
select public.run_crawl_publication();
select is((select (per_source->'official'->>'processed')::int from public.crawl_publication_ticks order by id desc limit 1), 1, 'the tick reports the official item');
select ok((select processed_at is not null from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  where e.content_hash = repeat('f', 64)), 'and marks it processed');

-- A forced failure is counted, recorded and backed off.
select pg_temp.extract('9', jsonb_build_array(pg_temp.obs('Broken Play', '2027-06-01', '{"venue_id": "not-a-uuid"}')));
set local role service_role;
select is(public.publish_official_findings(25)->>'failed', '1', 'a bad observation is counted as failed');
reset role;
select is((select last_error from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  where e.content_hash = repeat('9', 64)), 'official_transaction:22P02', 'the error text is recorded');
select is((select run_attempts from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  where e.content_hash = repeat('9', 64)), 1, 'the attempt is counted');

select * from finish();
rollback;
