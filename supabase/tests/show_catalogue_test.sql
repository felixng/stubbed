-- Optional catalogue, privileges, search and conservative merges (#145).
begin;
select no_plan();

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0145-0000-0000-000000000001', 'catalogue-owner@example.com'),
  ('aaaaaaaa-0145-0000-0000-000000000002', 'catalogue-other@example.com');

insert into public.shows (id, title, type, created_by) values
  ('5a000145-0000-0000-0000-000000000001', 'The Les Misérables (Broadway)', 'musical', 'aaaaaaaa-0145-0000-0000-000000000001'),
  ('5a000145-0000-0000-0000-000000000002', 'Shared Title', 'play', 'aaaaaaaa-0145-0000-0000-000000000001'),
  ('5a000145-0000-0000-0000-000000000003', 'Type Mismatch', 'play', 'aaaaaaaa-0145-0000-0000-000000000001'),
  ('5a000145-0000-0000-0000-000000000004', 'A Fringe Show', 'other', 'aaaaaaaa-0145-0000-0000-000000000001'),
  ('5a000145-0000-0000-0000-000000000005', 'Equal Match', 'musical', 'aaaaaaaa-0145-0000-0000-000000000001');

select is((select count(*)::int from public.shows where wikidata_id is not null), 0,
  'fresh database has no catalogue');
select is((select id from public.search_shows('Fringe') limit 1),
  '5a000145-0000-0000-0000-000000000004'::uuid, 'search works with an empty catalogue');
select is(public.normalise_show_title(' The Les Misérables: The Musical '), 'les miserables',
  'normalisation strips accents, article and documented suffix');

insert into public.shows (id, title, type, wikidata_id, first_performed, aliases, verified, created_by) values
  ('5a000145-0000-0000-0000-000000000011', 'Les Miserables', 'musical', 'Q830581', 1980, array['Les Miz'], true, null),
  ('5a000145-0000-0000-0000-000000000012', 'Shared Title', 'play', 'Q145001', 1900, '{}', true, null),
  ('5a000145-0000-0000-0000-000000000013', 'The Shared Title', 'play', 'Q145002', 1950, '{}', true, null),
  ('5a000145-0000-0000-0000-000000000014', 'Type Mismatch', 'musical', 'Q145003', null, '{}', true, null),
  ('5a000145-0000-0000-0000-000000000015', 'Equal Match', 'musical', 'Q145004', null, '{}', true, null);

select throws_ok($$insert into public.shows(title, wikidata_id) values ('Duplicate ID', 'Q830581')$$,
  '23505', null, 'Wikidata identity is unique');
select throws_ok($$insert into public.shows(title, wikidata_id) values ('Bad ID', 'not-an-id')$$,
  '23514', null, 'invalid Wikidata identity is rejected');
select throws_ok($$insert into public.shows(title, first_performed) values ('Bad year', 0)$$,
  '23514', null, 'invalid year is rejected');
select is((select id from public.search_shows('Equal Match') limit 1),
  '5a000145-0000-0000-0000-000000000015'::uuid, 'catalogue wins an equal title match');
select is((select id from public.search_shows('Les Miz') limit 1),
  '5a000145-0000-0000-0000-000000000011'::uuid, 'aliases are searchable');
select ok(not has_function_privilege('authenticated', 'public.merge_into_catalogue()', 'execute'),
  'users cannot call the merge');
select ok(not has_function_privilege('anon', 'public.merge_into_catalogue()', 'execute'),
  'anonymous users cannot call the merge');
select ok(has_function_privilege('service_role', 'public.merge_into_catalogue()', 'execute'),
  'service role can call the merge');

select pg_temp.as_user('aaaaaaaa-0145-0000-0000-000000000001');
select lives_ok($$insert into public.shows (title, type) values ('Still user-added', 'play')$$,
  'user insertion still works without catalogue fields');
select throws_ok($$insert into public.shows (title, wikidata_id) values ('Forged', 'Q145005')$$,
  '42501', null, 'users cannot insert a Wikidata identity');
select throws_ok($$insert into public.shows (title, first_performed) values ('Forged', 2000)$$,
  '42501', null, 'users cannot insert a first-performance year');
select throws_ok($$insert into public.shows (title, aliases) values ('Forged', array['fake'])$$,
  '42501', null, 'users cannot insert aliases');
select throws_ok($$update public.shows set wikidata_id = 'Q145005' where id = '5a000145-0000-0000-0000-000000000004'$$,
  '42501', null, 'users cannot update a Wikidata identity');
select throws_ok($$update public.shows set first_performed = 2000 where id = '5a000145-0000-0000-0000-000000000004'$$,
  '42501', null, 'users cannot update a first-performance year');
select throws_ok($$update public.shows set aliases = array['fake'] where id = '5a000145-0000-0000-0000-000000000004'$$,
  '42501', null, 'users cannot update aliases');
select throws_ok($$select * from public.merge_into_catalogue()$$,
  '42501', null, 'merge execution is denied to signed-in users');
reset role;

insert into public.entries (id, user_id, show_id, date, status, rating, note, visibility, photo_path) values
  ('e0000145-0000-0000-0000-000000000001', 'aaaaaaaa-0145-0000-0000-000000000001',
   '5a000145-0000-0000-0000-000000000001', '2026-01-01', 'logged', 4.5, 'Keep my note', 'private', 'owner/photo.jpg'),
  ('e0000145-0000-0000-0000-000000000002', 'aaaaaaaa-0145-0000-0000-000000000002',
   '5a000145-0000-0000-0000-000000000001', '2026-01-02', 'planned', null, null, 'public', null);
insert into public.collections (id, user_id, name, kind, start_date, end_date) values
  ('c0000145-0000-0000-0000-000000000001', 'aaaaaaaa-0145-0000-0000-000000000001',
   'Keep my trip', 'trip', '2026-01-01', '2026-01-03');
insert into public.entry_collections (entry_id, collection_id) values
  ('e0000145-0000-0000-0000-000000000001', 'c0000145-0000-0000-0000-000000000001');
create temp table entry_snapshot as
  select id, to_jsonb(e) - 'show_id' - 'updated_at' as data from public.entries e;
create temp table link_snapshot as select * from public.entry_collections;
create temp table merge_result as select * from public.merge_into_catalogue();

select is((select count(*)::int from merge_result where outcome = 'merged'), 2, 'only unique title/type pairs merge');
select is((select count(*)::int from merge_result where outcome = 'ambiguous'), 2, 'ambiguous and type-mismatched titles are reported');
select is((select moved_entries from merge_result where title = 'The Les Misérables (Broadway)'), 2::bigint,
  'all owners and both entry statuses are moved');
select is((select count(*)::int from public.entries where show_id = '5a000145-0000-0000-0000-000000000011'), 2,
  'entries reference the catalogue row');
select is((select count(*)::int from public.shows where id = '5a000145-0000-0000-0000-000000000001'), 0,
  'merged user-created duplicate is removed');
select is((select count(*)::int from public.shows where id in
  ('5a000145-0000-0000-0000-000000000002','5a000145-0000-0000-0000-000000000003','5a000145-0000-0000-0000-000000000004')), 3,
  'ambiguous, type-mismatched and unrelated user shows are preserved');
select results_eq($$select id, to_jsonb(e) - 'show_id' - 'updated_at' from public.entries e order by id$$,
  $$select id, data from entry_snapshot order by id$$, 'owners, dates, status, rating, visibility, photo and notes are unchanged');
select results_eq($$select * from public.entry_collections order by entry_id, collection_id$$,
  $$select * from link_snapshot order by entry_id, collection_id$$, 'trip links are unchanged');
select is((select count(*)::int from public.merge_into_catalogue() where outcome = 'merged'), 0,
  'repeated merge is idempotent');

select pg_temp.as_user('aaaaaaaa-0145-0000-0000-000000000002');
select is((select count(*)::int from public.entries where id = 'e0000145-0000-0000-0000-000000000001'), 0,
  'another user still cannot read the private entry after merging');
reset role;
select pg_temp.as_user('aaaaaaaa-0145-0000-0000-000000000001');
select is((select rating from public.entries where id = 'e0000145-0000-0000-0000-000000000001'), 4.5::numeric,
  'the private entry remains visible to its owner');
reset role;

select * from finish();
rollback;
