-- Nicknames people teach for shows (#35, part 2).
begin;
select no_plan();

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0035-0000-0000-000000000001', 'alias-one@example.com'),
  ('aaaaaaaa-0035-0000-0000-000000000002', 'alias-two@example.com');

insert into public.shows (id, title, type) values
  ('5a000035-0000-0000-0000-000000000101', 'Zorblatt Revelations', 'musical'),
  ('5a000035-0000-0000-0000-000000000102', 'Quindle', 'play');

select is((select count(*)::int from public.search_shows('Glorpo')), 0,
  'a nickname finds nothing before it is taught');

select pg_temp.as_user('aaaaaaaa-0035-0000-0000-000000000001');
select ok(public.remember_show_alias('5a000035-0000-0000-0000-000000000101', 'Glorpo'),
  'a nickname search did not find is saved');
select ok(not public.remember_show_alias('5a000035-0000-0000-0000-000000000101', 'GLORPO!'),
  'the same nickname, written differently, is not saved twice');
select ok(not public.remember_show_alias('5a000035-0000-0000-0000-000000000101', 'Zorblatt Rev'),
  'a search that already finds the show is not saved');
select ok(not public.remember_show_alias('5a000035-0000-0000-0000-000000000101', 'Zorblat Revelatons'),
  'a typo search already finds is not saved');
select is((select count(*)::int from public.show_aliases where show_id = '5a000035-0000-0000-0000-000000000101'), 1,
  'only the useful nickname was stored');
select is((select created_by from public.show_aliases where alias = 'Glorpo'),
  'aaaaaaaa-0035-0000-0000-000000000001'::uuid, 'the nickname records who taught it');
reset role;

select is((select id from public.search_shows('Glorpo') limit 1),
  '5a000035-0000-0000-0000-000000000101'::uuid, 'a taught nickname finds the show');
select is((select id from public.search_shows('glor') limit 1),
  '5a000035-0000-0000-0000-000000000101'::uuid, 'a nickname prefix finds the show');
insert into public.show_aliases (show_id, alias) values ('5a000035-0000-0000-0000-000000000101', 'Zorblatt the Musical');
select is((select count(*)::int from public.search_shows('Zorblatt') where id = '5a000035-0000-0000-0000-000000000101'), 1,
  'a show matching by title and nickname is listed once');

-- Signed-out people can read but not add.
set local role anon;
select is((select count(*)::int from public.show_aliases where alias = 'Glorpo'), 1, 'nicknames are public');
select throws_ok($$insert into public.show_aliases (show_id, alias) values ('5a000035-0000-0000-0000-000000000102', 'Qd')$$,
  '42501', null, 'signed-out people cannot add nicknames');
select ok(not has_function_privilege('anon', 'public.remember_show_alias(uuid, text)', 'execute'),
  'signed-out people cannot call remember_show_alias');
reset role;

-- Another user can add their own, but not change or remove someone else's.
select pg_temp.as_user('aaaaaaaa-0035-0000-0000-000000000002');
select lives_ok($$insert into public.show_aliases (show_id, alias) values ('5a000035-0000-0000-0000-000000000102', 'Quinners')$$,
  'signed-in users add nicknames directly');
select throws_ok($$insert into public.show_aliases (show_id, alias, created_by) values ('5a000035-0000-0000-0000-000000000102', 'Forged', 'aaaaaaaa-0035-0000-0000-000000000001')$$,
  '42501', null, 'users cannot add a nickname in someone else''s name');
update public.show_aliases set alias = 'Vandalised' where alias = 'Glorpo';
delete from public.show_aliases where alias = 'Glorpo';
reset role;
select is((select count(*)::int from public.show_aliases where alias = 'Glorpo'), 1,
  'users cannot change or remove someone else''s nickname');

select pg_temp.as_user('aaaaaaaa-0035-0000-0000-000000000001');
update public.show_aliases set alias = 'Glorps' where alias = 'Glorpo';
select is((select count(*)::int from public.show_aliases where alias = 'Glorps'), 1, 'creators edit their nickname');
delete from public.show_aliases where alias = 'Glorps';
reset role;
select is((select count(*)::int from public.show_aliases where alias like 'Glorp%'), 0,
  'creators remove their nickname');

-- A user-added show merged into the catalogue keeps its nicknames.
insert into public.shows (id, title, type, wikidata_id, verified) values
  ('5a000035-0000-0000-0000-000000000103', 'Quindle', 'play', 'Q35000103', true);
select lives_ok($$select * from public.merge_into_catalogue()$$, 'the catalogue merge runs');
select is((select show_id from public.show_aliases where alias = 'Quinners'),
  '5a000035-0000-0000-0000-000000000103'::uuid, 'nicknames move to the catalogue show on merge');

select * from finish();
rollback;
