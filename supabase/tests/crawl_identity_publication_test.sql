begin;
select no_plan();

create function pg_temp.stage(kind text, path text, observation jsonb)
returns uuid language plpgsql as $$
declare
  generation uuid;
  task uuid;
  token uuid := gen_random_uuid();
begin
  generation := public.start_crawl_generation('london_theatre', 'identity-test', 'directory',
    'https://www.londontheatre.co.uk/venues');
  task := public.enqueue_crawl_task(generation, kind, 'https://www.londontheatre.co.uk/' || path);
  update public.crawl_tasks set status = 'leased', lease_owner = 'fixture',
    lease_token = token, lease_expires_at = now() + interval '5 minutes' where id = task;
  perform public.acknowledge_crawl_task(task, token, '1', repeat(md5(observation::text), 2), '[]',
    jsonb_build_array(observation));
  return task;
end;
$$;

create function pg_temp.venue(external text, label text, postcode text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'venue', 'external_key', external, 'name', label,
    'city', 'London', 'country', 'GB', 'postcode', postcode) || extra;
$$;

create function pg_temp.event(external text, title text, kind text, extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('observation_kind', 'event', 'external_key', external, 'raw_title', title,
    'event_kind', 'show', 'show_type', kind, 'venue', jsonb_build_object('external_key', 'royal'),
    'date_status', 'supported', 'dates', '[{"kind":"start","date":"2026-11-12"}]'::jsonb) || extra;
$$;

create function pg_temp.mapping(kind text, key text)
returns public.crawl_source_entities language sql as $$
  select m.* from public.crawl_source_entities m join public.crawl_sources s on s.id = m.source_id
  where s.source_key = 'london_theatre' and m.entity_kind = kind and m.external_key = key;
$$;

insert into auth.users (id, email) values ('d4230000-0000-0000-0000-000000000001', 'identity@example.com');
insert into public.venues (id, name, city, country, catalogue_postcode, catalogue_auditorium, catalogue_granularity, wikidata_id, lat, lng) values
  ('a4230000-0000-0000-0000-000000000001', 'Royal Theatre', 'London', 'United Kingdom', 'WC2R 0NS', null, 'venue', null, null, null),
  ('a4230000-0000-0000-0000-000000000002', 'Royal Theatre', 'London', 'GB', 'SW1A 1AA', null, 'venue', null, null, null),
  ('a4230000-0000-0000-0000-000000000003', 'Festival House', 'London', 'GB', 'SW1A 2AA', 'Main Hall', 'auditorium', 'Q4231', 51.5, -0.12),
  ('a4230000-0000-0000-0000-000000000004', 'Festival House', 'London', 'GB', 'SW1A 2AA', 'Studio', 'auditorium', null, 51.5, -0.12);

insert into public.shows (id, title, type, first_performed) values
  ('b4230000-0000-0000-0000-000000000001', 'Echo Chamber', 'play', 2002),
  ('b4230000-0000-0000-0000-000000000002', 'Working Title', 'play', 1990),
  ('b4230000-0000-0000-0000-000000000003', 'Working Title', 'play', 2020),
  ('b4230000-0000-0000-0000-000000000004', 'A Different Work', 'play', 1980);
insert into public.entries (user_id, show_id, venue_id, date, status)
values ('d4230000-0000-0000-0000-000000000001','b4230000-0000-0000-0000-000000000001',
        'a4230000-0000-0000-0000-000000000001','2026-11-01','logged');

select ok(not has_function_privilege('authenticated', 'public.publish_crawl_identities(text,integer)', 'execute'),
  'publication RPC is private');
select ok(not has_function_privilege('authenticated', 'public.approve_show_candidate(uuid,boolean)', 'execute'),
  'system approval is private');

set local role service_role;
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select pg_temp.stage('venue','venues/royal',pg_temp.venue('royal','Royal Theatre','WC2R 0NS'));
select pg_temp.stage('venue','venues/royal-unknown',pg_temp.venue('royal-unknown','Royal Theatre',null));
select pg_temp.stage('venue','venues/festival-building',pg_temp.venue('festival-building','Festival House','SW1A 2AA',
  '{"wikidata_id":"Q4231","id_granularity":"building","granularity":"building","lat":51.5,"lng":-0.12}'));
select pg_temp.stage('venue','venues/festival-studio',pg_temp.venue('festival-studio','Festival House','SW1A 2AA',
  '{"wikidata_id":"Q4231","id_granularity":"building","auditorium":"Studio","lat":51.5,"lng":-0.12}'));
select pg_temp.stage('venue','venues/new',pg_temp.venue('new','Saffron Playhouse','N7 0AB','{"street":"32 Saffron Road"}'));
select pg_temp.stage('event','show/1-echo',pg_temp.event('1','Echo Chamber','play','{"first_performed":2002}'));
select pg_temp.stage('event','show/2-working-title',pg_temp.event('2','Working Title','play'));
select pg_temp.stage('event','show/3-unknown',pg_temp.event('3','Unknown Stage Piece',null));
select pg_temp.stage('event','show/4-musical',pg_temp.event('4','The Violet Codex: The Musical','musical'));
select pg_temp.stage('event','show/5-work-conflict',pg_temp.event('5','A Different Work','play','{"first_performed":2023}'));
select pg_temp.stage('event','show/6-workshop',pg_temp.event('6','Workshop','play','{"event_kind":"workshop"}'));
select pg_temp.stage('event','show/7-invalid-date',pg_temp.event('7','Riverside Navigation','play',
  '{"dates":[{"kind":"start","date":"2026-02-31"}]}'));
select is(public.publish_crawl_identities('london_theatre'), '{"inactive":true}'::jsonb,
  'publication flag is independent from collection');
select is((select count(*) from public.crawl_source_entities), 0::bigint, 'disabled queue creates no mappings');
update public.crawl_sources set publication_enabled = true, collection_enabled = false where source_key = 'london_theatre';
select is(public.publish_crawl_identities('playbill'), '{"inactive":true}'::jsonb, 'one source does not activate another');

savepoint before_publish;
select public.publish_crawl_identities('london_theatre');
rollback to before_publish;
select is((select count(*) from public.crawl_source_entities), 0::bigint, 'rollback loses no queue work and leaves no partial writes');
select is(public.publish_crawl_identities('london_theatre'), '{"processed":12,"deferred":0,"failed":0}'::jsonb,
  'source publication runs with collection disabled');
select is(public.publish_crawl_identities('london_theatre'), '{"processed":0,"deferred":0,"failed":0}'::jsonb,
  'replay does not publish twice');

select is((pg_temp.mapping('venue','royal')).venue_id, 'a4230000-0000-0000-0000-000000000001'::uuid,
  'postcode corroborates exactly one of two same-city theatres');
select is((pg_temp.mapping('venue','royal-unknown')).resolution_status, 'ambiguous', 'same name alone stays staged');
select is((pg_temp.mapping('venue','festival-building')).venue_id, null::uuid,
  'building id does not collapse same-coordinate auditoria');
select is((pg_temp.mapping('venue','festival-studio')).venue_id, 'a4230000-0000-0000-0000-000000000004'::uuid,
  'explicit studio never binds to main hall through the building id');
select ok((select source = 'crawler' and not verified and lat is null and lng is null
  from public.venues where id = (pg_temp.mapping('venue','new')).venue_id),
  'explicit address can create an unverified coordinate-free venue');

select is((pg_temp.mapping('event','1')).show_id, 'b4230000-0000-0000-0000-000000000001'::uuid,
  'known type and unique exact show can bind');
select is((pg_temp.mapping('event','2')).resolution_reason, 'multiple_exact_shows', 'duplicate exact shows remain ambiguous');
select ok((select type = 'other' and not verified from public.shows where id = (pg_temp.mapping('event','3')).show_id),
  'unknown type with a resolved venue and supported date publishes as an unverified other show');
select ok((select title = 'The Violet Codex: The Musical' and not verified
  from public.shows where id = (pg_temp.mapping('event','4')).show_id),
  'system approval preserves a distinguishing suffix and is unverified');
select is((select review_method from public.show_candidates where id = (pg_temp.mapping('event','4')).candidate_id),
  'crawler', 'approval records system provenance');
select is((pg_temp.mapping('event','5')).resolution_reason, 'conflicting_exact_show', 'work year conflict prevents title-only bind');
select is((pg_temp.mapping('event','6')).resolution_status, 'excluded', 'workshop is excluded');
select is((pg_temp.mapping('event','7')).resolution_reason, 'missing_supported_date', 'invalid date cannot publish a show');

update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select pg_temp.stage('venue','venues/renamed',pg_temp.venue('royal','Royal Theatre Renamed','SW1A 1AA'));
select pg_temp.stage('event','show/1-corrected',pg_temp.event('1','Echo Chamber Imported','play'));
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4230000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select lives_ok($$select public.admin_update_show('b4230000-0000-0000-0000-000000000001','Echo Chamber Corrected','play')$$,
  'existing admin can correct title');
reset role;
set local role service_role;
update public.shows set title = 'Wikidata Replacement' where id = 'b4230000-0000-0000-0000-000000000001';
select is(public.publish_crawl_identities('london_theatre')->>'failed', '0', 'changed evidence processes');
select is((select title from public.shows where id = (pg_temp.mapping('event','1')).show_id),
  'Echo Chamber Corrected', 'both imports preserve the admin-corrected title');
select is((select name from public.venues where id = (pg_temp.mapping('venue','royal')).venue_id),
  'Royal Theatre', 'established mapping survives a source rename without changing the canonical venue');
reset role;
select is((select show_id from public.entries where user_id = 'd4230000-0000-0000-0000-000000000001'),
  'b4230000-0000-0000-0000-000000000001'::uuid, 'existing diary ID survives');

select * from finish();
rollback;
