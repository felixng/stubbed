-- Admin fixes shows (#365): admins only, edits survive the sync, nicknames, merges.
begin;
select no_plan();

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'admin@example.com');

insert into public.shows (id, title, type, wikidata_id, verified) values
  ('5a000000-0000-0000-0000-000000000001', 'Wrongly Named Musical', 'play', 'Q9200001', true),
  ('5a000000-0000-0000-0000-000000000002', 'Quibble Time', 'musical', 'Q9200002', true);
insert into public.shows (id, title, type) values
  ('5a000000-0000-0000-0000-000000000003', 'Quibble In Time', 'musical'),
  ('5a000000-0000-0000-0000-000000000004', 'Quibble Time', 'play');
insert into public.entries (user_id, show_id, date) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000003', '2026-10-01'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000003', '2026-10-02');
insert into public.show_aliases (show_id, alias) values ('5a000000-0000-0000-0000-000000000003', 'QIT');

-- Refused for non-admins.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_update_show('5a000000-0000-0000-0000-000000000001', 'X', 'play')$$, '42501', null, 'update refused');
select throws_ok($$select public.admin_add_show_alias('5a000000-0000-0000-0000-000000000001', 'Nick')$$, '42501', null, 'nickname refused');
select throws_ok($$select public.admin_merge_preview('5a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002')$$, '42501', null, 'preview refused');
select throws_ok($$select public.admin_merge_shows('5a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002')$$, '42501', null, 'merge refused');
select pg_temp.as_postgres();
select ok(not has_function_privilege('anon', 'public.admin_merge_shows(uuid, uuid, boolean)', 'execute'), 'anon cannot merge');
select ok(not has_column_privilege('authenticated', 'public.shows', 'title_locked', 'update'), 'users cannot write title_locked');

-- Edit a Wikidata show; the sync can't undo it.
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select lives_ok($$select public.admin_update_show('5a000000-0000-0000-0000-000000000001', '  Rightly Named Musical ', 'musical')$$, 'admin edits title and type');
select pg_temp.as_postgres();
select is((select (title, type::text, title_locked)::text from public.shows where wikidata_id = 'Q9200001'), '("Rightly Named Musical",musical,t)', 'saved, trimmed and locked');
update public.shows set title = 'Wrongly Named Musical', type = 'play', first_performed = 2001 where wikidata_id = 'Q9200001';  -- what the sync does
select is((select (title, type::text, first_performed)::text from public.shows where wikidata_id = 'Q9200001'), '("Rightly Named Musical",musical,2001)',
  'a sync keeps the corrected title and type, and still updates the rest');
update public.shows set title = 'Another Name' where wikidata_id = 'Q9200002';
select is((select title from public.shows where wikidata_id = 'Q9200002'), 'Another Name', 'unedited shows still follow the sync');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_update_show('5a000000-0000-0000-0000-000000000001', ' ', 'play')$$, '22023', null, 'blank title');
select throws_ok($$select public.admin_update_show('5a000000-0000-0000-0000-000000000001', 'Ok', 'ballet')$$, '22023', null, 'unknown type');
select throws_ok($$select public.admin_update_show('5a000000-0000-0000-0000-0000000000ff', 'Ok', 'play')$$, 'P0002', null, 'unknown show');

-- Nicknames.
select is((select public.admin_add_show_alias('5a000000-0000-0000-0000-000000000002', 'QT')), true, 'a nickname is added');
select is((select public.admin_add_show_alias('5a000000-0000-0000-0000-000000000002', 'qt')), false, 'the same nickname again is a no-op');
select throws_ok($$select public.admin_add_show_alias('5a000000-0000-0000-0000-000000000002', 'x')$$, '22023', null, 'too short');

-- Merge preview and merge.
select is((select public.admin_merge_preview('5a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002'))->'from'->>'entries', '2', 'preview: entries that would move');
select is((select public.admin_merge_preview('5a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002'))->>'types_differ', 'false', 'preview: same type');
select is((select public.admin_merge_preview('5a000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000002'))->>'types_differ', 'true', 'preview: types differ');
select throws_ok($$select public.admin_merge_shows('5a000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000002')$$, 'P0001', null, 'a type mismatch is refused without force');
select is((select public.admin_merge_shows('5a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002')), '{"entries": 2, "aliases": 1}'::jsonb, 'merge moves entries and nicknames');
select pg_temp.as_postgres();
select is((select count(*) from public.entries where show_id = '5a000000-0000-0000-0000-000000000002'), 2::bigint, 'the entries are on the survivor');
select is((select count(*) from public.shows where id = '5a000000-0000-0000-0000-000000000003'), 0::bigint, 'the duplicate is gone');
select ok(exists (select 1 from public.show_aliases where show_id = '5a000000-0000-0000-0000-000000000002' and alias = 'QIT'), 'its nickname moved');
select ok(exists (select 1 from public.show_aliases where show_id = '5a000000-0000-0000-0000-000000000002' and alias = 'Quibble In Time'), 'its title became a nickname');
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select lives_ok($$select public.admin_merge_shows('5a000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000002', true)$$, 'force merges across types');
select pg_temp.as_postgres();

select * from finish();
rollback;
