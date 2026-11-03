-- Saved venues near a point (#343).
begin;
select no_plan();

-- Around Trafalgar Square (51.5080, -0.1281). 0.001 degrees of latitude is about 111 m.
insert into public.venues (id, name, city, country, lat, lng, osm_id) values
  ('7e000343-0000-0000-0000-000000000001', 'Zed Near Theatre',   'London', 'GB', 51.5085, -0.1281, 'way/9000343001'),
  ('7e000343-0000-0000-0000-000000000002', 'Alpha Nearer Theatre','London', 'GB', 51.5081, -0.1281, 'way/9000343002'),
  ('7e000343-0000-0000-0000-000000000003', 'Just Outside Theatre','London', 'GB', 51.5097, -0.1281, 'way/9000343003'),
  ('7e000343-0000-0000-0000-000000000004', 'Far Theatre',         'London', 'GB', 51.6000, -0.2000, 'way/9000343004');
insert into public.venues (id, name, city, country) values
  ('7e000343-0000-0000-0000-000000000005', 'No Coordinates Theatre', 'London', 'GB');

select is(
  (select array_agg(name order by distance_m, name) from public.nearby_venues(51.5080, -0.1281, 150)),
  array['Alpha Nearer Theatre', 'Zed Near Theatre'],
  'returns venues within the radius, nearest first');

select is(
  (select distance_m from public.nearby_venues(51.5080, -0.1281, 150) where name = 'Alpha Nearer Theatre'),
  11, 'distance is in whole metres');

select is(
  (select name from public.nearby_venues(51.5080, -0.1281, 150) limit 1),
  'Alpha Nearer Theatre', 'the first row is the nearest');

select ok(
  not exists (select 1 from public.nearby_venues(51.5080, -0.1281, 150) where name = 'Just Outside Theatre'),
  'excludes a venue just outside the radius (about 190 m)');

select ok(
  exists (select 1 from public.nearby_venues(51.5080, -0.1281, 200) where name = 'Just Outside Theatre'),
  'a wider radius includes it');

select ok(
  not exists (select 1 from public.nearby_venues(51.5080, -0.1281, 100000) where name = 'No Coordinates Theatre'),
  'a venue with no coordinates is never returned');

select is((select count(*)::int from public.nearby_venues(0, 0, 150)), 0, 'nothing near a point with no venues');

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'venues_lat_lng_idx'),
  'the lat/lng index exists');

select ok(has_function_privilege('anon', 'public.nearby_venues(double precision, double precision, double precision)', 'execute'),
  'signed-out visitors can call it (venues are publicly readable)');

select * from finish();
rollback;
