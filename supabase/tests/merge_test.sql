-- Merge duplicate shows and venues, and one city per venue (#274).
begin;
select no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-0274-0000-0000-000000000001', 'merge-owner@example.com'),
  ('aaaaaaaa-0274-0000-0000-000000000002', 'merge-fan@example.com');

insert into public.shows (id, title, type) values
  ('5a000274-0000-0000-0000-000000000001', 'Quillmeat Dupe', 'musical'),
  ('5a000274-0000-0000-0000-000000000002', 'Quillmeat Canon', 'musical'),
  ('5a000274-0000-0000-0000-000000000003', 'Quillmeat Play', 'play'),
  ('5a000274-0000-0000-0000-000000000004', 'Quillmeat Untouched', 'musical');
insert into public.show_aliases (show_id, alias) values
  ('5a000274-0000-0000-0000-000000000001', 'Quillie'),
  ('5a000274-0000-0000-0000-000000000001', 'Q Meat'),
  ('5a000274-0000-0000-0000-000000000002', 'quillie');

insert into public.venues (id, name, city, country, lat, lng, osm_id) values
  ('7e000274-0000-0000-0000-000000000001', 'Quill Dupe Theatre', 'London', 'GB', null, null, null),
  ('7e000274-0000-0000-0000-000000000002', 'Quill Canon Theatre', 'Greater London', 'GB', 51.5, -0.12, 'way/274001');

insert into public.entries (id, user_id, show_id, venue_id, date, visibility, status) values
  ('e0000274-0000-0000-0000-000000000001', 'aaaaaaaa-0274-0000-0000-000000000001',
   '5a000274-0000-0000-0000-000000000001', '7e000274-0000-0000-0000-000000000001', '2026-10-01', 'public', 'logged'),
  ('e0000274-0000-0000-0000-000000000002', 'aaaaaaaa-0274-0000-0000-000000000001',
   '5a000274-0000-0000-0000-000000000004', '7e000274-0000-0000-0000-000000000002', '2026-10-02', 'public', 'logged');

insert into public.collections (id, user_id, name, start_date, end_date) values
  ('c0000274-0000-0000-0000-000000000001', 'aaaaaaaa-0274-0000-0000-000000000001', 'Merge trip', '2026-10-01', '2026-10-03');
insert into public.entry_collections (entry_id, collection_id) values
  ('e0000274-0000-0000-0000-000000000001', 'c0000274-0000-0000-0000-000000000001');
insert into public.entry_likes (entry_id, user_id) values
  ('e0000274-0000-0000-0000-000000000001', 'aaaaaaaa-0274-0000-0000-000000000002');

-- Privileges.
select ok(not has_function_privilege('authenticated', 'public.merge_shows(uuid, uuid, boolean)', 'execute'), 'users cannot merge shows');
select ok(not has_function_privilege('anon', 'public.merge_shows(uuid, uuid, boolean)', 'execute'), 'anon cannot merge shows');
select ok(has_function_privilege('service_role', 'public.merge_shows(uuid, uuid, boolean)', 'execute'), 'service role can merge shows');
select ok(not has_function_privilege('authenticated', 'public.merge_venues(uuid, uuid)', 'execute'), 'users cannot merge venues');
select ok(not has_function_privilege('anon', 'public.merge_venues(uuid, uuid)', 'execute'), 'anon cannot merge venues');
select ok(has_function_privilege('service_role', 'public.merge_venues(uuid, uuid)', 'execute'), 'service role can merge venues');

-- Refusals.
select throws_like($$ select public.merge_shows('5a000274-0000-0000-0000-000000000001', '5a000274-0000-0000-0000-000000000001') $$,
  '%two different shows%', 'a show cannot merge into itself');
select throws_like($$ select public.merge_shows('5a000274-0000-0000-0000-000000000001', '5a000274-0000-0000-0000-0000000000ff') $$,
  '%not found%', 'a missing show is refused');
select throws_like($$ select public.merge_shows('5a000274-0000-0000-0000-000000000001', '5a000274-0000-0000-0000-000000000003') $$,
  '%types differ%', 'a type mismatch is refused');
select is((select count(*)::int from public.shows where id = '5a000274-0000-0000-0000-000000000001'), 1,
  'a refused merge changes nothing');
select throws_like($$ select public.merge_venues('7e000274-0000-0000-0000-000000000001', '7e000274-0000-0000-0000-000000000001') $$,
  '%two different venues%', 'a venue cannot merge into itself');
select throws_like($$ select public.merge_venues('7e000274-0000-0000-0000-000000000001', '7e000274-0000-0000-0000-0000000000ff') $$,
  '%not found%', 'a missing venue is refused');

-- Shows.
select is(public.merge_shows('5a000274-0000-0000-0000-000000000001', '5a000274-0000-0000-0000-000000000002'),
  '{"entries": 1, "aliases": 1}'::jsonb, 'counts moved: one entry, one new alias (the other already exists)');
select is((select show_id from public.entries where id = 'e0000274-0000-0000-0000-000000000001'),
  '5a000274-0000-0000-0000-000000000002'::uuid, 'the entry follows the show');
select is((select count(*)::int from public.entry_collections where entry_id = 'e0000274-0000-0000-0000-000000000001'), 1,
  'trip links are untouched');
select is((select count(*)::int from public.entry_likes where entry_id = 'e0000274-0000-0000-0000-000000000001'), 1,
  'likes are untouched');
select is((select count(*)::int from public.shows where id = '5a000274-0000-0000-0000-000000000001'), 0, 'the duplicate show is gone');
select is((select count(*)::int from public.show_aliases where show_id = '5a000274-0000-0000-0000-000000000002'), 2,
  'aliases moved without duplicates');
select is((select count(*)::int from public.entries e where not exists (select 1 from public.shows s where s.id = e.show_id)), 0,
  'no orphaned entries');
select lives_ok($$ select public.merge_shows('5a000274-0000-0000-0000-000000000003', '5a000274-0000-0000-0000-000000000004', true) $$,
  'force merges across types');

-- Venues.
select is(public.merge_venues('7e000274-0000-0000-0000-000000000001', '7e000274-0000-0000-0000-000000000002'),
  '{"entries": 1}'::jsonb, 'venue counts moved');
select is((select venue_id from public.entries where id = 'e0000274-0000-0000-0000-000000000001'),
  '7e000274-0000-0000-0000-000000000002'::uuid, 'the entry follows the venue');
select is((select count(*)::int from public.venues where id = '7e000274-0000-0000-0000-000000000001'), 0, 'the duplicate venue is gone');
select is((select count(*)::int from public.entries e where e.venue_id is not null
  and not exists (select 1 from public.venues v where v.id = e.venue_id)), 0, 'no orphaned venue references');

-- Cities.
select is(public.canonical_city('Greater London', 'GB'), 'London', 'Greater London');
select is(public.canonical_city('City of Westminster', 'GB'), 'London', 'City of Westminster');
select is(public.canonical_city('City of London', 'GB'), 'London', 'City of London');
select is(public.canonical_city('London Borough of Camden', 'GB'), 'London', 'London Borough of …');
select is(public.canonical_city('Camden', 'GB'), 'London', 'a borough name');
select is(public.canonical_city('Brooklyn', 'US'), 'New York', 'Brooklyn');
select is(public.canonical_city('The Bronx', 'US'), 'New York', 'The Bronx');
select is(public.canonical_city('Camden', 'US'), 'Camden', 'Camden, NJ is not London');
select is(public.canonical_city('Manchester', 'GB'), 'Manchester', 'other cities stay');
select is(public.canonical_city('  Bath ', 'GB'), 'Bath', 'trimmed');
select is(public.canonical_city('  ', 'GB'), null, 'blank is null');

insert into public.venues (id, name, city, country) values
  ('7e000274-0000-0000-0000-000000000011', 'Trigger Insert Theatre', 'City of Westminster', 'GB');
select is((select city from public.venues where id = '7e000274-0000-0000-0000-000000000011'), 'London', 'insert is canonicalised');
update public.venues set city = 'Queens', country = 'US' where id = '7e000274-0000-0000-0000-000000000011';
select is((select city from public.venues where id = '7e000274-0000-0000-0000-000000000011'), 'New York', 'update is canonicalised');

select * from finish();
rollback;
