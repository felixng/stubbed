-- Search ranks prefix matches first, then word starts, fuzzy matches, and
-- mid-word matches last (#35). Uses a made-up word so seed data can't interfere.
begin;
select no_plan();

insert into public.shows (id, title, type) values
  ('5a000035-0000-0000-0000-000000000001', 'Glimmer Strangers', 'musical'),
  ('5a000035-0000-0000-0000-000000000002', 'Glimmer Ladies', 'play'),
  ('5a000035-0000-0000-0000-000000000003', 'The Glimmer Gentlemen of Verona', 'play'),
  ('5a000035-0000-0000-0000-000000000004', 'Between Glimmer Worlds', 'play'),
  ('5a000035-0000-0000-0000-000000000005', 'Unglimmering', 'play'),
  ('5a000035-0000-0000-0000-000000000006', 'Les Glimmérables', 'musical');

-- The search, in result order.
create function pg_temp.shows(q text) returns text[] language sql as $$
  select array_agg(title order by ordinality)
  from public.search_shows(q) with ordinality
  where title ilike '%glim%';
$$;

select is((pg_temp.shows('Glimmer '))[4], 'Between Glimmer Worlds',
  'a word starting with the search comes after the titles that start with it');
select set_eq($$select unnest((pg_temp.shows('Glimmer '))[1:3])$$,
  array['Glimmer Strangers', 'Glimmer Ladies', 'The Glimmer Gentlemen of Verona'],
  'titles starting with the search come first, ignoring a leading "The"');
select is((pg_temp.shows('Glimmer '))[array_length(pg_temp.shows('Glimmer '), 1)], 'Unglimmering',
  'a mid-word match comes last');
select is((pg_temp.shows('glimmer str'))[1], 'Glimmer Strangers',
  'a partial second word still finds the title first');
select is((pg_temp.shows('glimer strangers'))[1], 'Glimmer Strangers',
  'typos still match');
select is((pg_temp.shows('les glimmerables'))[1], 'Les Glimmérables',
  'accents are ignored');
select is((pg_temp.shows('Les Glimm'))[1], 'Les Glimmérables',
  'a shortened title finds the full one');
select is((select count(*)::int from public.search_shows('Glimmer ') where title ilike '%glim%'), 6,
  'every matching show is still returned');

-- Venues: the same tiers, with a theatre next to the photo first.
insert into public.venues (id, name, city, country, lat, lng) values
  ('5b000035-0000-0000-0000-000000000001', 'Glimmer Hall', 'Far Town', 'GB', 55.0, -3.0),
  ('5b000035-0000-0000-0000-000000000002', 'Old Glimmer Playhouse', 'Near Town', 'GB', 51.5007, -0.1246),
  ('5b000035-0000-0000-0000-000000000003', 'Reglimmered Arts', 'Near Town', 'GB', 51.5008, -0.1247),
  ('5b000035-0000-0000-0000-000000000004', 'The Glimmer Rooms', 'Far Town', 'GB', 55.1, -3.1);

create function pg_temp.venues(q text, lat double precision, lng double precision) returns text[] language sql as $$
  select array_agg(name order by ordinality)
  from public.search_venues(q, lat, lng) with ordinality
  where name ilike '%glim%';
$$;

select set_eq($$select unnest((pg_temp.venues('glimmer', null, null))[1:2])$$,
  array['Glimmer Hall', 'The Glimmer Rooms'],
  'venue names starting with the search come first, ignoring a leading "The"');
select is((pg_temp.venues('glimmer', 51.5007, -0.1246))[1], 'Old Glimmer Playhouse',
  'a venue next to the photo comes first when a word starts with the search');
select isnt((pg_temp.venues('glimmer', 51.5007, -0.1246))[1], 'Reglimmered Arts',
  'a nearby venue matching only mid-word does not jump ahead');
select is((pg_temp.venues('glimmer', null, null))[4], 'Reglimmered Arts',
  'a mid-word venue match comes last');

select * from finish();
rollback;
