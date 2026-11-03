-- Theatres from OpenStreetMap (#290): the new venue columns and load_osm_venues.
begin;
select no_plan();

select has_type('public', 'venue_circuit', 'the circuit enum exists');
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e
     join pg_type t on t.oid = e.enumtypid where t.typname = 'venue_circuit'),
  array['west_end', 'off_west_end', 'pub', 'broadway', 'off_broadway', 'regional_uk', 'regional_us'],
  'the circuits are the seven the issue names');
select has_column('public', 'venues', 'circuit', 'venues.circuit');
select has_column('public', 'venues', 'website', 'venues.website');
select has_column('public', 'venues', 'wikidata_id', 'venues.wikidata_id');
select has_column('public', 'venues', 'source', 'venues.source');

select throws_ok(
  $$insert into public.venues (name, wikidata_id) values ('Bad Id Theatre', 'X12')$$,
  '23514', null, 'a malformed wikidata_id is rejected');
select throws_ok(
  $$insert into public.venues (name, source) values ('Bad Source Theatre', 'scraped')$$,
  '23514', null, 'an unknown source is rejected');
select throws_ok(
  $$insert into public.venues (name, website) values ('Long Site Theatre', 'https://x.test/' || repeat('a', 500))$$,
  '23514', null, 'a website over 500 characters is rejected');

insert into public.venues (name, wikidata_id) values ('Holder Theatre', 'Q9000002');
select throws_ok(
  $$insert into public.venues (name, wikidata_id) values ('Second Holder Theatre', 'Q9000002')$$,
  '23505', null, 'wikidata_id is unique');
select is((select source from public.venues where name = 'Holder Theatre'), 'user', 'source defaults to user');

select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'venues_lat_lng_idx'),
  'the lat/lng index exists');

-- Users can't write the catalogue columns.
select ok(not has_column_privilege('authenticated', 'public.venues', 'circuit', 'insert'), 'authenticated cannot insert circuit');
select ok(not has_column_privilege('authenticated', 'public.venues', 'circuit', 'update'), 'authenticated cannot update circuit');
select ok(not has_column_privilege('authenticated', 'public.venues', 'website', 'insert'), 'authenticated cannot insert website');
select ok(not has_column_privilege('authenticated', 'public.venues', 'website', 'update'), 'authenticated cannot update website');
select ok(not has_column_privilege('authenticated', 'public.venues', 'wikidata_id', 'insert'), 'authenticated cannot insert wikidata_id');
select ok(not has_column_privilege('authenticated', 'public.venues', 'wikidata_id', 'update'), 'authenticated cannot update wikidata_id');
select ok(not has_column_privilege('authenticated', 'public.venues', 'source', 'insert'), 'authenticated cannot insert source');
select ok(not has_column_privilege('authenticated', 'public.venues', 'source', 'update'), 'authenticated cannot update source');

select ok(not has_function_privilege('authenticated', 'public.load_osm_venues(jsonb)', 'execute'), 'authenticated cannot run the import');
select ok(not has_function_privilege('anon', 'public.load_osm_venues(jsonb)', 'execute'), 'anon cannot run the import');
select ok(has_function_privilege('service_role', 'public.load_osm_venues(jsonb)', 'execute'), 'service_role can');

-- Existing venues the import meets.
insert into public.venues (name, city, country, lat, lng) values
  ('Quindle Playhouse', 'London', 'GB', 51.6000, -0.2000),   -- 50 m from its OSM twin
  ('Flimble Theatre',   'London', 'GB', 51.7000, -0.3000);   -- 500 m from its OSM twin
insert into public.venues (name, city, country, lat, lng, osm_id) values
  ('Gronk Theatre', null, 'GB', 51.8000, -0.4000, 'way/9000290004');

select * from public.load_osm_venues($json$[
  {"osm_id": "way/9000290001", "name": "Zorblatt Hall Theatre", "city": "London", "country": "GB",
   "lat": 51.5, "lng": -0.1, "wikidata_id": "Q9000001", "website": "https://zorblatt.example", "circuit": "west_end"},
  {"osm_id": "way/9000290002", "name": "Quindle Playhouse", "city": "London", "country": "GB",
   "lat": 51.60045, "lng": -0.2, "wikidata_id": null, "website": null, "circuit": null},
  {"osm_id": "way/9000290003", "name": "Flimble Theatre", "city": "London", "country": "GB",
   "lat": 51.7045, "lng": -0.3, "wikidata_id": null, "website": null, "circuit": null},
  {"osm_id": "way/9000290004", "name": "Gronk Theatre Renamed", "city": "Leeds", "country": "GB",
   "lat": 51.8, "lng": -0.4, "wikidata_id": null, "website": null, "circuit": null},
  {"osm_id": "way/9000290005", "name": "Holder Twin Theatre", "city": "London", "country": "GB",
   "lat": 51.9, "lng": -0.5, "wikidata_id": "Q9000002", "website": null, "circuit": null},
  {"osm_id": "way/9000290006", "name": "Broad Way Theatre", "city": "New York", "country": "US",
   "lat": 40.76, "lng": -73.98, "wikidata_id": "Q9000003", "website": null, "circuit": "broadway"}
]$json$::jsonb) \gset first_

select is(:first_inserted, 4, 'four new venues inserted');
select is(:first_attached, 1, 'one existing venue got its osm_id');
select is(:first_filled, 1, 'one blank filled');
select is(:first_west_end, 1, 'one West End circuit set');
select is(:first_broadway, 1, 'one Broadway circuit set');

select is((select source from public.venues where osm_id = 'way/9000290001'), 'osm', 'inserted rows have source osm');
select is((select created_by from public.venues where osm_id = 'way/9000290001'), null, 'and no creator');
select is((select website from public.venues where osm_id = 'way/9000290001'), 'https://zorblatt.example', 'the website is kept');

select is((select osm_id from public.venues where name = 'Quindle Playhouse'), 'way/9000290002',
  'a same-named user venue 50 m away gets the osm_id');
select is((select source from public.venues where name = 'Quindle Playhouse'), 'user', 'and stays a user venue');
select is((select count(*)::int from public.venues where name = 'Flimble Theatre'), 2,
  'one 500 m away is not attached; the OSM row is inserted beside it');
select is((select osm_id from public.venues where name = 'Flimble Theatre' and source = 'user'), null,
  'the user venue 500 m away keeps no osm_id');

select is((select city from public.venues where osm_id = 'way/9000290004'), 'Leeds', 'a null city is filled');
select is((select name from public.venues where osm_id = 'way/9000290004'), 'Gronk Theatre', 'the name is never changed');

select is((select wikidata_id from public.venues where osm_id = 'way/9000290005'), null,
  'a wikidata_id already on another venue is skipped');
select is((select wikidata_id from public.venues where osm_id = 'way/9000290001'), 'Q9000001', 'a free wikidata_id is set');

select is((select circuit::text from public.venues where osm_id = 'way/9000290001'), 'west_end', 'the West End circuit is set');
select is((select verified from public.venues where osm_id = 'way/9000290001'), true, 'and the venue is verified');
select is((select circuit::text from public.venues where osm_id = 'way/9000290006'), 'broadway', 'the Broadway circuit is set');
select is((select verified from public.venues where osm_id = 'way/9000290003'), false, 'a venue with no circuit stays unverified');

select is(
  (select row(inserted, filled, attached, west_end, broadway)::text from public.load_osm_venues($json$[
    {"osm_id": "way/9000290001", "name": "Zorblatt Hall Theatre", "city": "London", "country": "GB",
     "lat": 51.5, "lng": -0.1, "wikidata_id": "Q9000001", "website": "https://zorblatt.example", "circuit": "west_end"},
    {"osm_id": "way/9000290002", "name": "Quindle Playhouse", "city": "London", "country": "GB",
     "lat": 51.60045, "lng": -0.2, "wikidata_id": null, "website": null, "circuit": null},
    {"osm_id": "way/9000290003", "name": "Flimble Theatre", "city": "London", "country": "GB",
     "lat": 51.7045, "lng": -0.3, "wikidata_id": null, "website": null, "circuit": null},
    {"osm_id": "way/9000290004", "name": "Gronk Theatre Renamed", "city": "Leeds", "country": "GB",
     "lat": 51.8, "lng": -0.4, "wikidata_id": null, "website": null, "circuit": null},
    {"osm_id": "way/9000290005", "name": "Holder Twin Theatre", "city": "London", "country": "GB",
     "lat": 51.9, "lng": -0.5, "wikidata_id": "Q9000002", "website": null, "circuit": null},
    {"osm_id": "way/9000290006", "name": "Broad Way Theatre", "city": "New York", "country": "US",
     "lat": 40.76, "lng": -73.98, "wikidata_id": "Q9000003", "website": null, "circuit": "broadway"}
  ]$json$::jsonb)),
  '(0,0,0,0,0)', 'a second call changes nothing');

select * from finish();
rollback;
