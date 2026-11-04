-- Admin show list and name check (#364): admins only, filters, problems.
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

insert into public.shows (id, title, type, wikidata_id, first_performed) values
  ('5a000000-0000-0000-0000-000000000001', 'Quorbal Producers', 'musical', 'Q9100001', 2001),
  ('5a000000-0000-0000-0000-000000000002', 'Zinthe Time', 'musical', 'Q9100002', 1999);
insert into public.shows (id, title, type) values
  ('5a000000-0000-0000-0000-000000000003', 'Quorbal Producer', 'musical'),   -- typed in, close to the first
  ('5a000000-0000-0000-0000-000000000004', 'Zinthe time', 'play'),            -- typed in, same title as the second
  ('5a000000-0000-0000-0000-000000000005', 'Plonk Unique', 'other');          -- typed in, no problem
insert into public.entries (user_id, show_id, date) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000003', '2026-10-01'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000003', '2026-10-02'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000002', '2026-10-03');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select * from public.admin_list_shows('quorbal')$$, '42501', null, 'a non-admin cannot list');
select throws_ok($$select * from public.admin_show_totals('quorbal')$$, '42501', null, 'a non-admin cannot get totals');
select throws_ok($$select * from public.admin_check_show_names(array['Hamilton'])$$, '42501', null, 'a non-admin cannot check names');
select throws_ok($$select * from public.admin_shows_filtered(null, null, null, null, false)$$, '42501', null, 'the shared function is not callable');
select pg_temp.as_postgres();
select ok(not has_function_privilege('anon', 'public.admin_list_shows(text, text, text, text, boolean, integer, integer)', 'execute'), 'anon cannot list');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select title from public.admin_list_shows('quorbal') limit 1), 'Quorbal Producer', 'typed-in shows with entries come first');
select is((select entry_count from public.admin_list_shows('quorbal producer') where title = 'Quorbal Producer'), 2::bigint, 'counts entries');
select is((select problem from public.admin_list_shows('quorbal') where title = 'Quorbal Producer'), 'Close to another show', 'a close typed-in show is flagged');
select is((select other_title from public.admin_list_shows('quorbal') where title = 'Quorbal Producer'), 'Quorbal Producers', 'and names the other');
select is((select problem from public.admin_list_shows('zinthe') where title = 'Zinthe time'), 'Same title as another show', 'same normalised title is flagged');
select is((select count(*) from public.admin_list_shows('zinthe', null, null, null, true)), 2::bigint, 'only problems: both of the pair');
select is((select count(*) from public.admin_list_shows('plonk', null, null, null, true)), 0::bigint, 'a clean show is not a problem');
select is((select count(*) from public.admin_list_shows('quorbal zinthe plonk')), 0::bigint, 'search needs the whole phrase');
select is((select count(*) from public.admin_list_shows('zinthe', 'play')), 1::bigint, 'type filter');
select is((select count(*) from public.admin_list_shows('quorbal', null, 'wikidata')), 1::bigint, 'from Wikidata');
select is((select count(*) from public.admin_list_shows('quorbal', null, 'typed')), 1::bigint, 'typed in');
select is((select count(*) from public.admin_list_shows('zinthe', null, null, 'has')), 1::bigint, 'has entries');
select is((select count(*) from public.admin_list_shows('zinthe', null, null, 'none')), 1::bigint, 'no entries');
select is((select count(*) from public.admin_list_shows('zinthe', null, null, null, false, 1, 0)), 1::bigint, 'page size');
select is((select title from public.admin_list_shows('zinthe', null, null, null, false, 1, 1)), 'Zinthe time', 'page offset');

select is((select row(shows, from_wikidata, typed_in, typed_in_logged, no_entries, with_problems)::text
           from public.admin_show_totals('quorbal zinthe plonk')), '(0,0,0,0,0,0)', 'totals for an empty match');
select is((select row(shows, from_wikidata, typed_in, typed_in_logged, no_entries, with_problems)::text
           from public.admin_show_totals('zinthe')), '(2,1,1,0,1,2)', 'totals');

-- Name check.
select is((select found_at from public.admin_check_show_names(array['Zinthe Time']) ), 1, 'found first');
select is((select found_at from public.admin_check_show_names(array['Qxzzy Nothing Here'])), null, 'missing: no result');
select is((select jsonb_array_length(results) from public.admin_check_show_names(array['Qxzzy Nothing Here'])), 0, 'missing: no results listed');
select is((select count(*) from public.admin_check_show_names(array['Zinthe Time', '', '  ', 'Plonk Unique'])), 2::bigint, 'blank lines are skipped');
select is((select pos from public.admin_check_show_names(array['Zinthe Time', '', 'Plonk Unique']) offset 1), 3, 'positions follow the pasted order');
select throws_ok($$select * from public.admin_check_show_names(array_fill('x'::text, array[101]))$$, '22023', null, 'at most 100 titles');

select * from finish();
rollback;
