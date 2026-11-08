begin;
select no_plan();
-- #450: stored, reversible model suggestions type held new shows; deterministic rules always win.

create function pg_temp.stage(kind text, path text, observation jsonb)
returns uuid language plpgsql as $$
declare
  generation uuid;
  task uuid;
  token uuid := gen_random_uuid();
begin
  generation := public.start_crawl_generation('london_theatre', 'suggest-test', 'directory',
    'https://www.londontheatre.co.uk/venues');
  task := public.enqueue_crawl_task(generation, kind, 'https://www.londontheatre.co.uk/' || path);
  update public.crawl_tasks set status = 'leased', lease_owner = 'fixture',
    lease_token = token, lease_expires_at = now() + interval '5 minutes' where id = task;
  perform public.acknowledge_crawl_task(task, token, '1', repeat(md5(observation::text), 2), '[]',
    jsonb_build_array(observation));
  return task;
end;
$$;

create function pg_temp.event(external text, title text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'event', 'external_key', external, 'raw_title', title,
    'event_kind', 'unknown', 'venue', jsonb_build_object('external_key', 'hall'),
    'date_status', 'supported',
    'dates', '[{"kind":"start","date":"2019-03-01"},{"kind":"end","date":"2019-06-30"}]'::jsonb) || extra;
$$;

create function pg_temp.mapping(key text)
returns public.crawl_source_entities language sql as $$
  select m.* from public.crawl_source_entities m join public.crawl_sources s on s.id = m.source_id
  where s.source_key = 'london_theatre' and m.entity_kind = 'event' and m.external_key = key;
$$;

create function pg_temp.answer(title_key text, verdict text, kind text, confidence numeric,
  provenance text default 'ai:claude-haiku-5-5')
returns jsonb language sql as $$
  select jsonb_build_object('title_key', title_key, 'venue_id', 'a4500000-0000-0000-0000-000000000001',
    'title', title_key, 'venue_name', 'Suggest Hall', 'first_date', '2019-03-01', 'last_date', '2019-06-30',
    'verdict', verdict, 'suggested_type', kind, 'confidence', confidence, 'provenance', provenance,
    'prompt_version', 1, 'usage', '{"input_tokens":600,"output_tokens":30}'::jsonb);
$$;

create function pg_temp.publish() returns void language plpgsql as $$
begin
  for i in 1..5 loop perform public.publish_crawl_identities('london_theatre', 100); end loop;
end;
$$;

insert into auth.users (id, email) values ('d4500000-0000-0000-0000-000000000001', 'suggest450@example.com');
insert into public.venues (id, name, city, country, osm_id, lat, lng, catalogue_postcode, catalogue_granularity)
values ('a4500000-0000-0000-0000-000000000001', 'Suggest Hall', 'London', 'GB', 'node/450', 51.80, -0.80, 'N4 5AA', 'venue');

set local role service_role;
update public.crawl_sources set collection_enabled = true, publication_enabled = true where source_key = 'london_theatre';
select pg_temp.stage('venue', 'venues/hall', jsonb_build_object('observation_kind', 'venue', 'external_key', 'hall',
  'name', 'Suggest Hall', 'city', 'London', 'country', 'GB', 'postcode', 'N4 5AA'));
select pg_temp.stage('event', 'show/1', pg_temp.event('1', 'Marmoset Overture'));
select pg_temp.stage('event', 'show/2', pg_temp.event('2', 'Lantern Of Pikes'));
select pg_temp.stage('event', 'show/3', pg_temp.event('3', 'Velvet Abacus'));
select pg_temp.stage('event', 'show/4', pg_temp.event('4', 'Juniper Contraption'));
select pg_temp.stage('event', 'show/5', pg_temp.event('5', 'Halcyon Tumblers'));
select pg_temp.stage('event', 'show/6', pg_temp.event('6', 'Copper Sonnet Ballet'));
select pg_temp.stage('event', 'show/7', pg_temp.event('7', 'Gossamer Parade'));
select pg_temp.stage('event', 'show/8', pg_temp.event('8', 'Gossamer Parade', '{"external_key":"8"}'));
select pg_temp.publish();

select is((pg_temp.mapping('1')).resolution_reason, 'unknown_show_type', 'a new untyped title starts held');

-- What the worker may send: only title, venue name and dates.
select is((select jsonb_agg(jsonb_object_keys) from (select distinct jsonb_object_keys(r)
    from jsonb_array_elements(public.crawl_show_types_to_suggest('london_theatre', 'ai:claude-haiku-5-5', 1, false, 50)) r
    order by 1) k),
  '["first_date", "last_date", "title", "title_key", "venue_id", "venue_name"]'::jsonb,
  'the worker input carries only the title, venue and run dates');
select is((select r from jsonb_array_elements(public.crawl_show_types_to_suggest('london_theatre', 'ai:claude-haiku-5-5', 1, false, 50)) r
    where r->>'title_key' = 'marmoset overture'),
  jsonb_build_object('title', 'Marmoset Overture', 'title_key', 'marmoset overture',
    'venue_id', 'a4500000-0000-0000-0000-000000000001', 'venue_name', 'Suggest Hall',
    'first_date', '2019-03-01', 'last_date', '2019-06-30'),
  'one row per held title at a venue, with the run dates');
select is(jsonb_array_length(public.crawl_show_types_to_suggest('london_theatre', 'ai:claude-haiku-5-5', 1, false, 50)), 6, 'two events of one title at one venue are asked about once');

-- Answers.
select isnt(public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('marmoset overture', 'type', 'musical', 0.92)), null,
  'a confident answer is stored');
select is(public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('marmoset overture', 'type', 'play', 0.99)), null,
  'a second answer for the same provenance and prompt version is ignored');
select public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('lantern of pikes', 'type', 'play', 0.79));
select public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('velvet abacus', 'unsure', null, 0.30));
select public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('juniper contraption', 'type', 'other', 0.90));
select public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('copper sonnet ballet', 'type', 'play', 0.95));
select public.record_crawl_show_type_suggestion('london_theatre', pg_temp.answer('gossamer parade', 'type', 'comedy', 0.85));
select ok((select identity_processed_at is null from public.crawl_publication_queue
  where extraction_id = (pg_temp.mapping('1')).last_extraction_id), 'storing an answer re-queues identity for its held events');
select throws_ok($$select public.record_crawl_show_type_suggestion('london_theatre',
  pg_temp.answer('halcyon tumblers', 'type', null, 0.9))$$, '23514', null, 'a type verdict needs a type');
select throws_ok($$select public.record_crawl_show_type_suggestion('london_theatre',
  pg_temp.answer('halcyon tumblers', 'type', 'play', 1.5))$$, '23514', null, 'confidence stays within 0 to 1');
select throws_ok($$select public.record_crawl_show_type_suggestion('london_theatre',
  pg_temp.answer('halcyon tumblers', 'type', 'circus', 0.9))$$, '22P02', null, 'a type outside show_type is refused');
select pg_temp.publish();

select ok((select type = 'musical' and not verified from public.shows where id = (pg_temp.mapping('1')).show_id),
  'a confident suggestion publishes the new show with that type');
select ok((select c.type_suggestion_id is not null and c.review_method = 'crawler' from public.show_candidates c
  where c.id = (pg_temp.mapping('1')).candidate_id), 'the candidate records which suggestion typed it');
select is((pg_temp.mapping('2')).resolution_reason, 'unknown_show_type', 'confidence below 0.80 keeps the hold');
select is((pg_temp.mapping('3')).resolution_reason, 'unknown_show_type', 'unsure keeps the hold');
select is((pg_temp.mapping('5')).resolution_reason, 'unknown_show_type', 'no answer keeps the hold');
select is((select type::text from public.shows where id = (pg_temp.mapping('4')).show_id), 'other',
  'a confident other publishes as Other');
select is((select type::text from public.shows where id = (pg_temp.mapping('6')).show_id), 'dance',
  'a deterministic title cue beats the suggestion');
select ok((pg_temp.mapping('7')).show_id is not null and (pg_temp.mapping('7')).show_id = (pg_temp.mapping('8')).show_id,
  'both events of one title share the one suggested show');
select throws_ok($$select public.approve_show_candidate((select id from public.show_candidates
  where source = 'crawler' and status = 'pending' and title = 'Velvet Abacus'), true)$$,
  '22023', 'Crawler candidate lacks supported type', 'the two-argument approval still refuses an untyped Other');

-- Web-search pass: only titles whose latest answer is unsure or below the threshold.
select is((select jsonb_agg(r->>'title_key' order by r->>'title_key')
    from jsonb_array_elements(public.crawl_show_types_to_suggest('london_theatre', 'ai:claude-haiku-5-5+web_search', 1, true, 50)) r),
  '["lantern of pikes", "velvet abacus"]'::jsonb, 'the web-search pass covers only unconfident answers');
select public.record_crawl_show_type_suggestion('london_theatre',
  pg_temp.answer('velvet abacus', 'type', 'opera', 0.88, 'ai:claude-haiku-5-5+web_search'));
select pg_temp.publish();
select is((select type::text from public.shows where id = (pg_temp.mapping('3')).show_id), 'opera',
  'a later confident web-search answer publishes');

-- Revert.
reset role;
insert into public.entries (user_id, show_id, venue_id, date, status)
values ('d4500000-0000-0000-0000-000000000001', (pg_temp.mapping('7')).show_id,
  'a4500000-0000-0000-0000-000000000001', '2019-04-01', 'logged');
set local role service_role;
select is(public.crawl_revert_show_type_suggestions('ai:claude-haiku-5-5')->>'reverted', '6',
  'revert withdraws every answer of that provenance');
select is((pg_temp.mapping('1')).resolution_reason, 'unknown_show_type', 'an unused suggested show goes back to held');
select ok((select status = 'pending' and type = 'other' and type_suggestion_id is null from public.show_candidates
  where id = (pg_temp.mapping('1')).candidate_id), 'its candidate is pending again');
select is((select count(*) from public.shows where title = 'Marmoset Overture'), 0::bigint, 'the unused show is removed');
select ok((select type = 'comedy' from public.shows where id = (pg_temp.mapping('7')).show_id),
  'a show a diary entry uses is left unchanged');
select is((pg_temp.mapping('3')).resolution_status, 'linked', 'answers of another provenance are kept');
select pg_temp.publish();
select is((pg_temp.mapping('1')).resolution_reason, 'unknown_show_type', 'a reverted suggestion no longer applies');

-- Privacy: only the worker writes; signed-in people cannot read.
reset role;
set local role authenticated;
select is((select count(*) from public.crawl_show_type_suggestions), 0::bigint, 'a non-admin reads no suggestions');
select throws_ok($$insert into public.crawl_show_type_suggestions (source_key, title_key, venue_id, title, venue_name,
  verdict, confidence, provenance, prompt_version) values ('london_theatre', 'x', 'a4500000-0000-0000-0000-000000000001',
  'x', 'x', 'unsure', 0.1, 'ai:x', 1)$$, '42501', null, 'signed-in people cannot write suggestions');
select throws_ok($$select public.record_crawl_show_type_suggestion('london_theatre', '{}'::jsonb)$$, '42501', null,
  'signed-in people cannot call the worker RPC');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.crawl_show_type_suggestions$$, '42501', null, 'anon cannot read suggestions');

select * from finish();
rollback;
