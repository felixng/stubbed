begin;
select no_plan();

create function pg_temp.seed(stage text, url text, refresh boolean default false) returns uuid
language sql as $$
  select public.start_crawl_generation('london_theatre', 'london', stage, url, refresh => refresh);
$$;
create function pg_temp.claim(task uuid) returns uuid
language sql as $$
  update public.crawl_tasks set status = 'leased', lease_owner = 'fixture',
    lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes',
    attempts = attempts + 1
  where id = task returning lease_token;
$$;
create function pg_temp.ack(task uuid, token uuid, links jsonb, observations jsonb default '[]')
returns boolean language sql as $$
  select public.acknowledge_crawl_task(task, token, '1', repeat('a', 64), links, observations);
$$;

select ok(
  (select bool_and(not collection_enabled and not publication_enabled)
   from public.crawl_sources where source_key in ('london_theatre', 'playbill')),
  'new source switches start off'
);
select ok((select collection_enabled from public.crawl_sources where source_key = 'official'),
  'legacy official collection is preserved');
select throws_ok(
  $$select pg_temp.seed('directory','https://www.londontheatre.co.uk/theatres?page=1')$$,
  '22023', 'Unknown or disabled crawl source', 'cannot seed disabled collection'
);
select ok(not has_table_privilege('anon', 'public.crawl_extractions', 'select'), 'anonymous has no access');
select ok(not has_function_privilege('authenticated', 'public.acknowledge_crawl_task(uuid,uuid,text,text,jsonb,jsonb)', 'execute'),
  'authenticated cannot acknowledge');
select ok(not has_function_privilege('anon', 'public.enqueue_crawl_task(uuid,text,text)', 'execute'),
  'anonymous cannot enqueue');

insert into auth.users (id, email) values ('d4200000-0000-0000-0000-000000000001', 'frontier@example.com');
insert into public.crawl_sites (id, whats_on_url, archive_status)
values ('d4200000-0000-0000-0000-000000000002', 'https://old.test/current', 'in_progress');
insert into public.crawl_pages (site_id, url, type, next_url)
values ('d4200000-0000-0000-0000-000000000002', 'https://old.test/archive', 'archive', 'https://old.test/archive?page=2');
insert into public.crawl_runs (id) values ('d4200000-0000-0000-0000-000000000003');
insert into public.venues (id, name) values ('d4200000-0000-0000-0000-000000000004', 'Frontier Theatre');
insert into public.shows (id, title, type) values ('d4200000-0000-0000-0000-000000000005', 'Frontier Show', 'play');
insert into public.entries (user_id, show_id, venue_id, date, status)
values ('d4200000-0000-0000-0000-000000000001', 'd4200000-0000-0000-0000-000000000005',
        'd4200000-0000-0000-0000-000000000004', '2026-02-01', 'logged');

set local role service_role;
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select pg_temp.seed('directory', 'https://www.londontheatre.co.uk/theatres?page=1') as scan_id \gset
select id as parent from public.crawl_tasks where generation_id = :'scan_id' \gset
select pg_temp.claim(:'parent') as token \gset
select is(pg_temp.seed('directory', 'https://www.londontheatre.co.uk/theatres?page=1'), :'scan_id'::uuid,
  'ordinary resume keeps the generation');

-- A statement failure after writing the first child rolls back the entire
-- acknowledgement. No state from that partial execution is visible.
select throws_ok(
  format('select pg_temp.ack(%L, %L, %L)', :'parent', :'token',
    '[{"stage":"directory","url":"https://www.londontheatre.co.uk/theatres?page=2"},
      {"stage":"venue","url":"https://www.londontheatre.co.uk.evil.test/venue"}]'),
  '22023', 'Disabled crawl scope or URL outside its allowlist', 'off-host child aborts acknowledgement'
);
select is((select count(*) from public.crawl_tasks where generation_id = :'scan_id'), 1::bigint,
  'a partial acknowledgement leaves no child task');
select is((select status from public.crawl_tasks where id = :'parent'), 'leased',
  'a partial acknowledgement leaves the lease');

savepoint interrupted;
select pg_temp.ack(:'parent', :'token',
  '[{"stage":"directory","url":"https://www.londontheatre.co.uk/theatres?page=2"}]');
rollback to interrupted;
select is((select count(*) from public.crawl_tasks where generation_id = :'scan_id'), 1::bigint,
  'interruption before commit rolls back all work');

select ok(pg_temp.ack(:'parent', :'token',
  '[{"stage":"directory","url":"https://www.londontheatre.co.uk/theatres?page=2"},
    {"stage":"venue","url":"https://www.londontheatre.co.uk/venue/a"},
    {"stage":"venue","url":"https://www.londontheatre.co.uk/venue/a"},
    {"stage":"venue","url":"https://www.londontheatre.co.uk/venue/b"}]'), 'acknowledgement succeeds');
select ok(not pg_temp.ack(:'parent', :'token', '[]'), 'replay after commit is a no-op');
select is((select count(*) from public.crawl_task_edges where parent_id = :'parent'), 3::bigint,
  'children and links are deduplicated and survive replay');
select is((select enumeration_status from public.crawl_generations where id = :'scan_id'), 'enumerating',
  'the first page does not complete enumeration');

select id as venue_a from public.crawl_tasks where canonical_url like '%/venue/a' \gset
select id as venue_b from public.crawl_tasks where canonical_url like '%/venue/b' \gset
select pg_temp.claim(:'venue_a') as venue_a_token, pg_temp.claim(:'venue_b') as venue_b_token \gset
select ok(pg_temp.ack(:'venue_a', :'venue_a_token',
  '[{"stage":"event","url":"https://www.londontheatre.co.uk/show/a"}]'), 'process venue while discovery runs');
select ok(pg_temp.ack(:'venue_b', :'venue_b_token',
  '[{"stage":"event","url":"https://www.londontheatre.co.uk/show/a"}]'), 'second venue may refer to the event');
select id as event_task from public.crawl_tasks where stage = 'event' \gset
select is((select count(*) from public.crawl_task_edges where child_id = :'event_task'), 2::bigint,
  'both references point to one event task');
select pg_temp.claim(:'event_task') as event_token \gset
select ok(pg_temp.ack(:'event_task', :'event_token', '[]', '[{"title":"Frontier Show"}]'),
  'event observations persist');
select ok(not pg_temp.ack(:'event_task', :'event_token', '[]', '[{"title":"Unexpected Replay"}]'),
  'replay does not change observations');
select is((select count(*) from public.crawl_publication_queue), 1::bigint,
  'exactly one publication record survives replay with publication still off');

select id as page_two from public.crawl_tasks where canonical_url like '%page=2' \gset
select pg_temp.claim(:'page_two') as page_two_token \gset
select ok(pg_temp.ack(:'page_two', :'page_two_token', '[]'), 'last directory page completes');
select ok((select enumeration_status = 'enumerated' and completed_at is not null
           from public.crawl_generations where id = :'scan_id'), 'reachable directory scope is enumerated');

insert into public.crawl_source_entities (source_id, entity_kind, external_key)
select id, 'event', 'source-show-a' from public.crawl_sources where source_key = 'london_theatre';
select pg_temp.seed('directory', 'https://www.londontheatre.co.uk/theatres?page=1', true) as fresh \gset
select isnt(:'fresh'::uuid, :'scan_id'::uuid, 'refresh opens a distinct generation');
select ok(not (select is_current from public.crawl_generations where id = :'scan_id'), 'old generation retained');
select isnt(public.enqueue_crawl_task(:'fresh', 'event', 'https://www.londontheatre.co.uk/show/a'), :'event_task'::uuid,
  'same event URL can be fetched in a fresh generation');
select is((select count(*) from public.crawl_source_entities where external_key = 'source-show-a'), 1::bigint,
  'refresh preserves source identities');

update public.crawl_sources set paused_reason = 'fixture pause' where source_key = 'london_theatre';
select throws_ok(
  format('select public.enqueue_crawl_task(%L, %L, %L)', :'fresh', 'event', 'https://www.londontheatre.co.uk/show/b'),
  '22023', 'Disabled crawl scope or URL outside its allowlist', 'paused source cannot enqueue'
);

reset role;
select is((select archive_status from public.crawl_sites where id = 'd4200000-0000-0000-0000-000000000002'),
  'in_progress', 'old site archive status survives');
select is((select next_url from public.crawl_pages where site_id = 'd4200000-0000-0000-0000-000000000002'),
  'https://old.test/archive?page=2', 'old archive checkpoint survives');
select is((select status from public.crawl_runs where id = 'd4200000-0000-0000-0000-000000000003'),
  'queued', 'legacy execution survives');
select is((select status::text from public.entries where user_id = 'd4200000-0000-0000-0000-000000000001'),
  'logged', 'diary entry survives');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4200000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"role":"admin"}}';
select is((select count(*) from public.crawl_tasks), 0::bigint, 'client-set role metadata cannot read tasks');
select is((select count(*) from public.crawl_extractions), 0::bigint, 'client-set role metadata cannot read observations');
set local request.jwt.claims = '{"sub":"d4200000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select ok((select count(*) from public.crawl_tasks) > 0, 'admin can read tasks');
select throws_ok($$update public.crawl_sources set publication_enabled = true$$,
  '42501', null, 'admin cannot mutate sources directly');

reset role;
select * from finish();
rollback;
