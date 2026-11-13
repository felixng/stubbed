begin;
select no_plan();
-- #444: London identity rules (geocoded venue matching and unknown-type show handling).

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

create function pg_temp.mapping(entity text, ref text)
returns public.crawl_source_entities language sql as $$
  select m.* from public.crawl_source_entities m join public.crawl_sources s on s.id = m.source_id
  where s.source_key = 'london_theatre' and m.entity_kind = entity and m.external_key = ref;
$$;


insert into auth.users (id, email) values ('d4440000-0000-0000-0000-000000000001', 'london444@example.com');
insert into public.venues (id, name, city, country, osm_id, lat, lng, catalogue_postcode, catalogue_granularity) values
  ('a4440000-0000-0000-0000-000000000001', 'Postcode Hall', 'London', 'GB', 'node/1', 51.60, -0.30, 'E1 1AA', 'venue'),
  ('a4440000-0000-0000-0000-000000000002', 'Lat Playhouse', 'London', 'GB', 'node/2', 51.5100, -0.1300, null, null),
  ('a4440000-0000-0000-0000-000000000003', 'Far Playhouse', 'London', 'GB', 'node/3', 51.5100, -0.2000, null, null),
  ('a4440000-0000-0000-0000-000000000004', 'Twin Stage', 'London', 'GB', 'node/4', 51.5300, -0.1000, null, null),
  ('a4440000-0000-0000-0000-000000000005', 'Twin Stage', 'London', 'GB', 'node/5', 51.5301, -0.1001, null, null),
  ('a4440000-0000-0000-0000-000000000006', 'Osm Barn', 'London', 'GB', 'way/66', 51.40, -0.40, null, null),
  ('a4440000-0000-0000-0000-000000000007', 'Name Only Rooms', 'London', 'GB', 'node/7', 51.45, -0.45, null, null),
  ('a4440000-0000-0000-0000-000000000008', 'Spoof Theatre', 'London', 'GB', 'node/8', 51.5000, -0.5000, null, null),
  ('a4440000-0000-0000-0000-000000000009', 'Corroborated Hall', 'London', 'GB', 'node/9', 51.70, -0.70, 'N1 1AA', 'venue');
insert into public.shows (id, title, type) values
  ('b4440000-0000-0000-0000-000000000001', 'Known Elsewhere', 'musical'),
  ('b4440000-0000-0000-0000-000000000002', 'Twin Title', 'play'),
  ('b4440000-0000-0000-0000-000000000003', 'Twin Title', 'musical'),
  ('b4440000-0000-0000-0000-000000000004', 'Uncorroborated Title', 'dance');
insert into public.runs (venue_id, title, show_id, start_date, source, source_url, confidence)
values ('a4440000-0000-0000-0000-000000000009', 'Known Elsewhere', 'b4440000-0000-0000-0000-000000000001',
  '2026-10-01', 'test', 'https://example.test/run', 0.9);
insert into public.entries (user_id, show_id, venue_id, date, status)
values ('d4440000-0000-0000-0000-000000000001', 'b4440000-0000-0000-0000-000000000001',
  'a4440000-0000-0000-0000-000000000002', '2026-09-01', 'logged');

set local role service_role;
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select pg_temp.stage('venue','venues/postcode',pg_temp.venue('postcode','Postcode Hall','E1 1AA','{"street":"1 High Street"}'));
select pg_temp.stage('venue','venues/geo',pg_temp.venue('geo','Lat Playhouse','WC2H 0AA',
  '{"lat":51.5110,"lng":-0.1300,"geocode":{"provider":"geocoded:postcodes.io","query":"WC2H 0AA","precision":"postcode_centroid"}}'));
select pg_temp.stage('venue','venues/geo-far',pg_temp.venue('geo-far','Far Playhouse','WC2H 0AB',
  '{"lat":51.5130,"lng":-0.2000,"geocode":{"provider":"geocoded:postcodes.io","query":"WC2H 0AB","precision":"postcode_centroid"}}'));
select pg_temp.stage('venue','venues/ungeo-150m',pg_temp.venue('ungeo-150m','Lat Playhouse','WC2H 0AC','{"lat":51.5113,"lng":-0.1300}'));
select pg_temp.stage('venue','venues/spoof',pg_temp.venue('spoof','Spoof Theatre','SW1A 1AA',
  '{"lat":51.5020,"lng":-0.5000,"geocode":{"provider":"geocoded:made-up","query":"x"}}'));
select pg_temp.stage('venue','venues/name-only',pg_temp.venue('name-only','Name Only Rooms','W1A 1AA'));
select pg_temp.stage('venue','venues/twin',pg_temp.venue('twin','Twin Stage','N1 9AA',
  '{"lat":51.5300,"lng":-0.1000,"geocode":{"provider":"geocoded:nominatim","query":"x"}}'));
select pg_temp.stage('venue','venues/osm',pg_temp.venue('osm','Osm Barn','TW1 1AA','{"osm_id":"way/66"}'));
select pg_temp.stage('venue','venues/multi',pg_temp.venue('multi','Lat Playhouse','WC2H 0AA',
  '{"lat":51.5110,"lng":-0.1300,"resolution_reason":"multiple_auditoria","geocode":{"provider":"geocoded:postcodes.io","query":"WC2H 0AA"}}'));
select pg_temp.stage('venue','venues/new-geo',pg_temp.venue('new-geo','Brand New Stage','E8 1AA',
  '{"street":"9 Dalston Lane","lat":51.5450,"lng":-0.0750,"geocode":{"provider":"geocoded:postcodes.io","query":"E8 1AA"}}'));
select pg_temp.stage('venue','venues/corroborated',pg_temp.venue('royal','Corroborated Hall','N1 1AA'));

select pg_temp.stage('event','show/10-twin',pg_temp.event('10','Twin Title',null,'{"event_kind":"unknown"}'));
select pg_temp.stage('event','show/11-corroborated',pg_temp.event('11','Known Elsewhere',null,'{"event_kind":"unknown"}'));
select pg_temp.stage('event','show/12-uncorroborated',pg_temp.event('12','Uncorroborated Title',null,'{"event_kind":"unknown"}'));
select pg_temp.stage('event','show/13-fresh',pg_temp.event('13','A Wholly New Evening',null,'{"event_kind":"unknown"}'));
select pg_temp.stage('event','show/14-class',pg_temp.event('14','Acting Class',null,'{"event_kind":"class"}'));
select pg_temp.stage('event','show/15-workshop',pg_temp.event('15','Devising Workshop',null,'{"event_kind":"workshop"}'));
select pg_temp.stage('event','show/16-tour',pg_temp.event('16','Backstage Tour',null,'{"event_kind":"building_tour"}'));
select pg_temp.stage('event','show/17-concert',pg_temp.event('17','Winter Concert',null,'{"event_kind":"concert"}'));
select pg_temp.stage('event','show/18-nodate',pg_temp.event('18','No Date Piece',null,'{"event_kind":"unknown","date_status":"missing"}'));
-- 20261108200100: cleaned titles, first-category types, title cues, concerts, held unknown types.
select pg_temp.stage('event','show/19-company',pg_temp.event('19','Zebra Quartet Fantasia - Royal Ballet and Opera',null,
  '{"evidence":{"categories":[{"text":"Opera, West End"}]}}'));
select pg_temp.stage('event','show/20-first-cat',pg_temp.event('20','Quokka Mia!',null,
  '{"evidence":{"categories":[{"text":"Musicals, Romance, Comedy, West End"}]}}'));
select pg_temp.stage('event','show/21-venue-suffix',pg_temp.event('21','Quillfeather Confessions (Garrick Theatre)',null,'{"event_kind":"unknown"}'));
select pg_temp.stage('event','show/22-promo',pg_temp.event('22','Spring Ticket Event - Tap Wombats',null,'{"event_kind":"unknown"}'));
select pg_temp.stage('event','show/23-under-typed',pg_temp.event('23','Candle Recital Nights',null,
  '{"event_kind":"concert","evidence":{"categories":[{"text":"Concerts, Classical"}]}}'));
insert into public.shows (id, title, type) values ('b4440000-0000-0000-0000-000000000023', 'Candle Recital Nights', 'other');
update public.crawl_sources set publication_enabled = true where source_key = 'london_theatre';
select is(public.publish_crawl_identities('london_theatre')->>'failed', '0', 'publication processes');
select public.publish_crawl_identities('london_theatre');

select is((pg_temp.mapping('venue','postcode')).venue_id, 'a4440000-0000-0000-0000-000000000001'::uuid, 'postcode match links');
select is((pg_temp.mapping('venue','geo')).venue_id, 'a4440000-0000-0000-0000-000000000002'::uuid, 'geocode ~111 m away links');
select is((pg_temp.mapping('venue','geo-far')).resolution_status, 'ambiguous', 'geocode ~330 m away stays held');
select is((pg_temp.mapping('venue','ungeo-150m')).resolution_status, 'ambiguous', 'a point without geocode provenance keeps the 100 m rule');
select is((pg_temp.mapping('venue','spoof')).resolution_status, 'ambiguous', 'an unknown geocode provider does not widen the radius');
select is((pg_temp.mapping('venue','name-only')).resolution_reason, 'ambiguous_or_uncorroborated_venue', 'name alone stays held (geocoder failed)');
select is((pg_temp.mapping('venue','twin')).resolution_status, 'ambiguous', 'two same-name venues both within range stay held');
select is((pg_temp.mapping('venue','osm')).venue_id, 'a4440000-0000-0000-0000-000000000006'::uuid, 'exact osm_id links');
select is((pg_temp.mapping('venue','multi')).resolution_reason, 'multiple_auditoria_or_building', 'multi-auditorium venue stays held');
select ok((select lat = 51.5450 and lng = -0.0750 and source = 'crawler' and not verified from public.venues
  where id = (pg_temp.mapping('venue','new-geo')).venue_id), 'a new venue keeps the geocoded point for later corroboration');
select is((pg_temp.mapping('venue','new-geo')).evidence#>>'{geocode,provider}',
  'geocoded:postcodes.io', 'geocode provenance is kept in the evidence');
select is((select count(*) from public.venues where name = 'Lat Playhouse'), 1::bigint, 'no duplicate venue created by the held cases');

select is((pg_temp.mapping('event','10')).resolution_reason, 'multiple_exact_shows', 'duplicate titles with unknown type stay held');
select is((pg_temp.mapping('event','11')).show_id, 'b4440000-0000-0000-0000-000000000001'::uuid, 'unknown type links on one corroborated exact title');
select is((select type::text from public.shows where id = 'b4440000-0000-0000-0000-000000000001'), 'musical', 'existing show type is not overwritten');
select is((pg_temp.mapping('event','12')).resolution_reason, 'uncorroborated_exact_show', 'an exact title with no venue or run evidence stays held');
select is((select type::text from public.shows where id = 'b4440000-0000-0000-0000-000000000004'), 'dance', 'held case leaves the existing type');
select is((pg_temp.mapping('event','13')).resolution_reason, 'unknown_show_type', 'a new unknown-type title is held, not published');
select is((pg_temp.mapping('event','13')).show_id, null, 'no show is created for a held unknown type');
select ok((select status = 'pending' and type = 'other' from public.show_candidates where id = (pg_temp.mapping('event','13')).candidate_id),
  'the held title waits as a pending candidate');
select is((pg_temp.mapping('event','14')).resolution_status, 'excluded', 'class stays excluded');
select is((pg_temp.mapping('event','15')).resolution_status, 'excluded', 'workshop stays excluded');
select is((pg_temp.mapping('event','16')).resolution_status, 'excluded', 'tour stays excluded');
select is((select type::text from public.shows where id = (pg_temp.mapping('event','17')).show_id), 'concert',
  'a concert publishes as a concert show');
select is((pg_temp.mapping('event','18')).resolution_reason, 'missing_supported_date', 'unknown type still needs a supported date');

select ok((select title = 'Zebra Quartet Fantasia' and type = 'opera' from public.shows where id = (pg_temp.mapping('event','19')).show_id),
  'company suffix is stripped and the opera category types it');
select ok((select 'Zebra Quartet Fantasia - Royal Ballet and Opera' = any(aliases) from public.show_candidates
  where id = (pg_temp.mapping('event','19')).candidate_id), 'the raw source title is kept as a candidate alias');
select is((select type::text from public.shows where id = (pg_temp.mapping('event','20')).show_id), 'musical',
  'the first category naming a type wins over a later Comedy');
select ok((select title = 'Quillfeather Confessions' and status = 'pending' from public.show_candidates
  where id = (pg_temp.mapping('event','21')).candidate_id), 'a trailing (venue) is stripped; unknown type stays held');
select ok((select title = 'Tap Wombats' and type = 'dance' from public.shows where id = (pg_temp.mapping('event','22')).show_id),
  'a ticket-event prefix is stripped and a title cue types it');
select is((pg_temp.mapping('event','23')).show_id, 'b4440000-0000-0000-0000-000000000023'::uuid,
  'a typed event links to an existing Other show of the same title');
select is((select type::text from public.shows where id = 'b4440000-0000-0000-0000-000000000023'), 'other',
  'linking does not retype the existing show');

select is(public.crawl_clean_title('london_theatre', 'Il trovatore - English National Opera'), 'Il trovatore', 'ENO suffix stripped');
select is(public.crawl_clean_title('london_theatre', 'Samantha Barks: The Cathedral Tour - London'), 'Samantha Barks: The Cathedral Tour', 'trailing - London stripped');
select is(public.crawl_clean_title('london_theatre', 'Tina - The Tina Turner Musical'), 'Tina - The Tina Turner Musical', 'a real subtitle is kept');
select is(public.crawl_clean_title('playbill', 'Hamlet (Garrick Theatre)'), 'Hamlet (Garrick Theatre)', 'cleaning is London-only');
select is(public.crawl_event_show_type('london_theatre', '{"raw_title":"Love Songs by Candlelight"}')::text, 'concert', 'candlelight is a concert');
select is(public.crawl_event_show_type('london_theatre', '{"raw_title":"Mandy Patinkin - Live in Concert"}')::text, 'concert', 'in concert is a concert');
select is(public.crawl_event_show_type('london_theatre', '{"raw_title":"Il trovatore - English National Opera"}')::text, 'opera', 'ENO cue is opera');
select is(public.crawl_event_show_type('london_theatre', '{"raw_title":"Paddington The Musical"}')::text, 'musical', 'The Musical cue');
select is(public.crawl_event_show_type('london_theatre', '{"raw_title":"La Fille mal gardée - Royal Ballet and Opera"}'), null,
  'the Royal Ballet and Opera suffix alone does not decide opera or dance');
select is(public.crawl_event_show_type('london_theatre', '{"raw_title":"Brokeback Mountain"}'), null, 'no cue stays unknown');

select is(public.put_crawl_geocode('postcodes.io', 'AB1 2CD', 51.0, -1.0), true, 'geocode cache stores a hit');
select is((select lat from public.get_crawl_geocode('postcodes.io', 'AB1 2CD')), 51.0::double precision, 'geocode cache reads it back');
select public.put_crawl_geocode('nominatim', 'nowhere', null, null);
select is((select found from public.get_crawl_geocode('nominatim', 'nowhere')), false, 'a definitive miss is cached');
select is(public.backfill_crawler_venue_geo((pg_temp.mapping('venue','new-geo')).venue_id, 1, 1), false, 'backfill never moves an existing point');
reset role;
select is((select venue_id from public.entries where user_id = 'd4440000-0000-0000-0000-000000000001'),
  'a4440000-0000-0000-0000-000000000002'::uuid, 'existing diary venue ids are preserved');
select ok(not has_function_privilege('authenticated', 'public.put_crawl_geocode(text,text,double precision,double precision)', 'execute'),
  'geocode cache writes are private');

select * from finish();
rollback;
