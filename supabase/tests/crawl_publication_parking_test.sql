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

create function pg_temp.event(external text, title text, venue text default 'royal')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'event', 'external_key', external, 'raw_title', title,
    'event_kind', 'show', 'show_type', 'play', 'venue', jsonb_build_object('external_key', venue),
    'date_status', 'supported', 'dates', '[{"kind":"start","date":"2026-11-12"}]'::jsonb);
$$;


create function pg_temp.q(col text, path text) returns text language plpgsql as $f$
declare out text;
begin
  execute format('select q.%I::text from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id where t.canonical_url like %L', col, '%' || path) into out;
  return out;
end;
$f$;

insert into auth.users (id, email) values
  ('d5390000-0000-0000-0000-000000000001', 'park-member@example.com'),
  ('d5390000-0000-0000-0000-000000000002', 'park-admin@example.com');

update public.crawl_sources set collection_enabled = true, publication_enabled = true where source_key = 'london_theatre';
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'venue', 'venues/royal', jsonb_build_object('observation_kind', 'venue',
  'external_key', 'royal', 'name', 'Royal Theatre', 'city', 'London', 'country', 'GB', 'postcode', 'WC2R 0NS'));
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'event', 'show/late-old', pg_temp.event('1', 'Late Old Show', 'ghost'));
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'event', 'show/late-new', pg_temp.event('2', 'Late New Show', 'ghost'));
select public.publish_crawl_identities('london_theatre', 100);

-- Waiting for a venue is not a failure, and does not count as an attempt.
select is(pg_temp.q('identity_error', 'show/late-new'), 'awaiting_venue_detail', 'an unknown venue defers the item');
select is(pg_temp.q('identity_attempts', 'show/late-new'), '0', 'a deferral is not an attempt');
update public.crawl_publication_queue q set queued_at = now() - interval '15 days', identity_available_at = now()
from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id
where q.extraction_id = e.id and t.canonical_url like '%show/late-old';
update public.crawl_publication_queue q set queued_at = now() - interval '1 day', identity_available_at = now()
from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id
where q.extraction_id = e.id and t.canonical_url like '%show/late-new';
select public.publish_crawl_identities('london_theatre', 100);
select is(pg_temp.q('parked_reason', 'show/late-old'), 'venue_never_resolved', 'a 15-day-old deferral is parked');
select ok(pg_temp.q('parked_at', 'show/late-new') is null, 'a 1-day-old deferral is not parked');

-- A failure backs off 5, 10, 20, 40, 60 minutes and parks on the tenth.
select pg_temp.stage('london_theatre', 'www.londontheatre.co.uk', 'event', 'show/fails', pg_temp.event('3', 'Always Fails'));
create or replace function public.crawl_match_show(for_source uuid, source_key text, observed jsonb, extraction uuid)
returns boolean language plpgsql set search_path = '' as $f$ begin raise exception 'forced failure'; end; $f$;
select is(public.publish_crawl_identities('london_theatre', 100)->>'failed', '1', 'a forced failure is counted');
select is(pg_temp.q('identity_attempts', 'show/fails'), '1', 'the first failure is one attempt');
select ok((select q.identity_available_at between now() + interval '4 minutes 50 seconds' and now() + interval '5 minutes 10 seconds'
  from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  join public.crawl_tasks t on t.id = e.task_id where t.canonical_url like '%show/fails'), 'the first wait is 5 minutes');
update public.crawl_publication_queue set identity_available_at = now() where identity_attempts = 1;
select public.publish_crawl_identities('london_theatre', 100);
select ok((select q.identity_available_at between now() + interval '9 minutes 50 seconds' and now() + interval '10 minutes 10 seconds'
  from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  join public.crawl_tasks t on t.id = e.task_id where t.canonical_url like '%show/fails'), 'the second wait is 10 minutes');
do $d$ begin
  for i in 3..9 loop
    update public.crawl_publication_queue set identity_available_at = now() where identity_attempts = i - 1 and parked_at is null;
    perform public.publish_crawl_identities('london_theatre', 100);
  end loop;
end $d$;
select is(pg_temp.q('identity_attempts', 'show/fails'), '9', 'nine failures so far');
select ok(pg_temp.q('parked_at', 'show/fails') is null, 'not parked after nine failures');
select ok((select q.identity_available_at between now() + interval '59 minutes' and now() + interval '61 minutes'
  from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
  join public.crawl_tasks t on t.id = e.task_id where t.canonical_url like '%show/fails'), 'the wait stops growing at 60 minutes');
update public.crawl_publication_queue set identity_available_at = now() where identity_attempts = 9;
select public.publish_crawl_identities('london_theatre', 100);
select is(pg_temp.q('identity_attempts', 'show/fails'), '10', 'ten failures');
select is(pg_temp.q('parked_reason', 'show/fails'), 'identity_transaction:P0001', 'the tenth failure parks with the error text');
update public.crawl_publication_queue set identity_available_at = now();
select public.publish_crawl_identities('london_theatre', 100);
select is(pg_temp.q('identity_attempts', 'show/fails'), '10', 'a parked row is skipped');

-- Parked rows leave the waiting counts and show as one attention entry per source.
select set_config('request.jwt.claims', '{"sub":"d5390000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select is((select (a->>'count')::int from jsonb_array_elements(public.admin_crawl_overview()#>'{sources,london_theatre,attention}') a
  where a->>'kind' = 'publication_parked'), 2, 'the overview counts the two parked rows in one entry');
select is((public.admin_crawl_overview()#>>'{sources,london_theatre,unchecked_pages}')::int, 1, 'parked rows are not counted as waiting');
select throws_ok($$select public.admin_retry_crawl_publication('nowhere')$$, '22023', null, 'an unknown source is refused');
reset role;
select set_config('request.jwt.claims', '{"sub":"d5390000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.admin_retry_crawl_publication('london_theatre')$$, '42501', null, 'a non-admin cannot retry');
reset role;

select set_config('request.jwt.claims', '{"sub":"d5390000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select is(public.admin_retry_crawl_publication('london_theatre'), 2, 'retry returns the number un-parked');
reset role;
select is((select count(*) from public.crawl_publication_queue where parked_at is not null), 0::bigint, 'nothing is parked after a retry');
select is(pg_temp.q('identity_attempts', 'show/fails'), '0', 'a retry resets the attempts');
select is((select affected from public.crawl_admin_actions where operation = 'retry_publication'), 2, 'the retry is logged as an admin action');

select * from finish();
rollback;
