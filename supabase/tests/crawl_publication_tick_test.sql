begin;
select no_plan();

create function pg_temp.stage(src text, host text, kind text, path text, observation jsonb)
returns uuid language plpgsql as $$
declare
  generation uuid;
  task uuid;
  token uuid := gen_random_uuid();
begin
  generation := public.start_crawl_generation(src, 'tick-test-' || path, 'directory', 'https://' || host || '/venues');
  task := public.enqueue_crawl_task(generation, kind, 'https://' || host || '/' || path);
  update public.crawl_tasks set status = 'leased', lease_owner = 'fixture',
    lease_token = token, lease_expires_at = now() + interval '5 minutes' where id = task;
  perform public.acknowledge_crawl_task(task, token, '1', repeat(md5(observation::text), 2), '[]',
    jsonb_build_array(observation));
  return task;
end;
$$;

create function pg_temp.event(external text, title text)
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'event', 'external_key', external, 'raw_title', title,
    'event_kind', 'show', 'show_type', 'play', 'venue', jsonb_build_object('external_key', 'royal'),
    'date_status', 'supported', 'dates', '[{"kind":"start","date":"2026-11-12"}]'::jsonb);
$$;

insert into auth.users (id, email) values
  ('d5380000-0000-0000-0000-000000000001', 'tick-member@example.com'),
  ('d5380000-0000-0000-0000-000000000002', 'tick-admin@example.com');

select is((select schedule from cron.job where jobname = 'catalogue-publication'), '* * * * *', 'the publication job runs every minute');
select is((select command from cron.job where jobname = 'catalogue-publication'), 'select public.run_crawl_publication()',
  'the job calls the tick function');
select ok(not has_function_privilege('authenticated', 'public.run_crawl_publication()', 'execute'), 'members cannot run a tick');
select ok(not has_function_privilege('anon', 'public.run_crawl_publication()', 'execute'), 'anonymous callers cannot run a tick');
select ok(not has_function_privilege('service_role', 'public.run_crawl_publication()', 'execute'), 'service role cannot run a tick');

-- Nothing queued and nothing enabled: no tick row.
select public.run_crawl_publication();
select is((select count(*) from public.crawl_publication_ticks), 0::bigint, 'a tick with nothing to do writes no row');

update public.crawl_sources set collection_enabled = true where source_key in ('london_theatre', 'playbill');
set local role service_role;
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'venue', 'venues/royal', jsonb_build_object('observation_kind', 'venue',
  'external_key', 'royal', 'name', 'Royal Theatre', 'city', 'London', 'country', 'GB', 'postcode', 'WC2R 0NS'));
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'event', 'show/1-a', pg_temp.event('1', 'Tick Show One'));
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'event', 'show/2-b', pg_temp.event('2', 'Tick Show Two'));
select pg_temp.stage('playbill', 'www.playbill.com', 'event', 'show/3-c', pg_temp.event('3', 'Tick Show Three'));
reset role;

update public.crawl_sources set publication_enabled = true where source_key = 'london_theatre';
select public.publish_crawl_identities('london_theatre', 1);

-- Ordering: an item deferred earlier (older, but available later) goes after a newer item that was never deferred.
update public.crawl_publication_queue q set queued_at = now() - interval '3 hours', identity_available_at = now() - interval '1 hour'
from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id
where q.extraction_id = e.id and t.canonical_url like '%show/1-a';
update public.crawl_publication_queue q set queued_at = now() - interval '2 hours', identity_available_at = now() - interval '2 hours'
from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id
where q.extraction_id = e.id and t.canonical_url like '%show/2-b';
select is(public.publish_crawl_identities('london_theatre', 1)->>'processed', '1', 'one item is taken');
select ok((select q.identity_processed_at is not null from public.crawl_publication_queue q
  join public.crawl_extractions e on e.id = q.extraction_id join public.crawl_tasks t on t.id = e.task_id
  where t.canonical_url like '%show/2-b'), 'the never-deferred newer item goes first');
select ok((select q.identity_processed_at is null from public.crawl_publication_queue q
  join public.crawl_extractions e on e.id = q.extraction_id join public.crawl_tasks t on t.id = e.task_id
  where t.canonical_url like '%show/1-a'), 'the deferred older item waits behind it');

-- A tick publishes the enabled source, leaves the disabled one alone, and writes one row.
select public.run_crawl_publication();
select is((select count(*) from public.crawl_publication_ticks), 1::bigint, 'a working tick writes one row');
select ok((select (per_source->'london_theatre'->>'processed')::int >= 1 and not per_source ? 'playbill'
  from public.crawl_publication_ticks), 'the tick records the enabled source only');
select ok((select q.identity_processed_at is null from public.crawl_publication_queue q
  join public.crawl_extractions e on e.id = q.extraction_id join public.crawl_tasks t on t.id = e.task_id
  where t.canonical_url like '%show/3-c'), 'the disabled source is untouched');
select ok((select count(*) = 0 from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  join public.crawl_tasks t on t.id = e.task_id where t.canonical_url like '%londontheatre%' and q.identity_processed_at is null),
  'every item of the enabled source was published');

-- A second tick with nothing left writes nothing more.
select public.run_crawl_publication();
select is((select count(*) from public.crawl_publication_ticks), 1::bigint, 'an idle tick writes no row');

-- Old rows are tidied.
insert into public.crawl_publication_ticks (started_at, finished_at, per_source)
values (now() - interval '4 days', now() - interval '4 days', '{}');
select public.run_crawl_publication();
select is((select count(*) from public.crawl_publication_ticks where finished_at < now() - interval '3 days'), 0::bigint, 'ticks older than 3 days are deleted');

-- Only admins read ticks, and the overview reports when each source last published.
select set_config('request.jwt.claims', '{"sub":"d5380000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.crawl_publication_ticks), 0::bigint, 'a non-admin reads no ticks');
reset role;
select set_config('request.jwt.claims', '{"sub":"d5380000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select is((select count(*) from public.crawl_publication_ticks), 1::bigint, 'an admin reads ticks');
select ok(public.admin_crawl_overview()#>>'{publication,london_theatre,last_published_at}' is not null, 'the overview shows when the source last published');
select ok(public.admin_crawl_overview()#>>'{publication,playbill,last_published_at}' is null, 'a source that never published shows null');
reset role;

select * from finish();
rollback;
