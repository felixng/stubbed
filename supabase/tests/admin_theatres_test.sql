-- Admin theatre list (#356): admins only, the filters, entry counts, order.
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

insert into public.venues (id, name, city, country, circuit, website, whats_on_url) values
  ('a0000000-0000-0000-0000-000000000001', 'Zed Playhouse',  'Zedville', 'GB', 'west_end', 'https://zed.test', 'https://zed.test/whats-on'),
  ('a0000000-0000-0000-0000-000000000002', 'Zed Studio',     'Zedville', 'GB', null,       'https://zed.test', null),
  ('a0000000-0000-0000-0000-000000000003', 'Zed Barn',       'Zedtown',  'US', 'regional_us', null, null);
insert into public.shows (id, title) values ('5a000000-0000-0000-0000-000000000001', 'Zed Show');
insert into public.entries (user_id, show_id, venue_id, date) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', '2026-10-01'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', '2026-10-02'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-10-03');

-- Refused for a signed-in non-admin, and for anon.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select * from public.admin_list_venues('zed')$$, '42501', null, 'a non-admin cannot list');
select throws_ok($$select * from public.admin_venue_totals('zed')$$, '42501', null, 'a non-admin cannot get totals');
select pg_temp.as_postgres();
select ok(not has_function_privilege('anon', 'public.admin_list_venues(text, text, text, boolean, boolean, integer, integer)', 'execute'), 'anon cannot run the list');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select array_agg(name order by ord) from (select name, row_number() over () ord from public.admin_list_venues('zed')) s),
  array['Zed Studio', 'Zed Playhouse', 'Zed Barn'], 'most logged first, then by name');
select is((select entry_count from public.admin_list_venues('zed studio')), 2::bigint, 'counts entries');
select is((select count(*) from public.admin_list_venues('zedville')), 2::bigint, 'search matches the city');
select is((select count(*) from public.admin_list_venues('zed', 'west_end')), 1::bigint, 'circuit filter');
select is((select name from public.admin_list_venues('zed', 'none')), 'Zed Studio', 'unlabelled filter');
select is((select name from public.admin_list_venues('zed', null, 'US')), 'Zed Barn', 'country filter');
select is((select count(*) from public.admin_list_venues('zed', null, null, false)), 1::bigint, 'lacks a website');
select is((select count(*) from public.admin_list_venues('zed', null, null, true)), 2::bigint, 'has a website');
select is((select count(*) from public.admin_list_venues('zed', null, null, null, false)), 2::bigint, 'lacks a what''s-on link');
select is((select count(*) from public.admin_list_venues('zed', null, null, true, false)), 1::bigint, 'website but no what''s-on link');
select is((select count(*) from public.admin_list_venues('zed', null, null, null, null, 2, 0)), 2::bigint, 'page size');
select is((select name from public.admin_list_venues('zed', null, null, null, null, 2, 2)), 'Zed Barn', 'page offset');

select is((select row(venues, labelled, with_website, with_whats_on, logged_at)::text from public.admin_venue_totals('zed')),
  '(3,2,2,1,2)', 'totals');
select is((select venues from public.admin_venue_totals('zed', null, null, false)), 1::bigint, 'totals follow the filters');

select pg_temp.as_postgres();
select ok(not has_column_privilege('authenticated', 'public.venues', 'whats_on_url', 'update'), 'users cannot write whats_on_url');
select throws_ok($$insert into public.venues (name, whats_on_url) values ('Bad Link', 'ftp://x.test')$$, '23514', null, 'http(s) only');
select throws_ok($$insert into public.venues (name, whats_on_url) values ('Long Link', 'https://x.test/' || repeat('a', 500))$$, '23514', null, '500 characters at most');

select * from finish();
rollback;
