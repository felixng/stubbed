-- Admin edits a theatre (#357): admins only, URL checks, shared URLs, blanks.
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
insert into public.venues (id, name, circuit, website) values
  ('a0000000-0000-0000-0000-000000000001', 'Olivier Test', 'west_end', 'https://old.test'),
  ('a0000000-0000-0000-0000-000000000002', 'Lyttelton Test', null, null);

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok(
  $$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', 'https://x.test', null, null)$$,
  '42501', null, 'a non-admin is refused');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select lives_ok(
  $$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', ' https://nt.test ', 'https://nt.test/whats-on', 'west_end')$$,
  'an admin saves all three');
select lives_ok(
  $$select public.admin_update_venue('a0000000-0000-0000-0000-000000000002', 'https://nt.test', 'https://nt.test/whats-on', 'off_west_end')$$,
  'a second theatre can share the what''s-on link');
select pg_temp.as_postgres();
select is((select website from public.venues where name = 'Olivier Test'), 'https://nt.test', 'the website is trimmed and saved');
select is((select count(*) from public.venues where whats_on_url = 'https://nt.test/whats-on'), 2::bigint, 'two theatres share one URL');
select is((select circuit::text from public.venues where name = 'Lyttelton Test'), 'off_west_end', 'the circuit is saved');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', 'ftp://x.test', null, null)$$, '22023', null, 'website must be http(s)');
select throws_ok($$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', null, 'javascript:alert(1)', null)$$, '22023', null, 'what''s-on link must be http(s)');
select throws_ok($$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', null, 'https://x.test/' || repeat('a', 500), null)$$, '22023', null, 'at most 500 characters');
select throws_ok($$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', null, null, 'opera_house')$$, '22023', null, 'unknown circuit');
select throws_ok($$select public.admin_update_venue('a0000000-0000-0000-0000-0000000000ff', null, null, null)$$, 'P0002', null, 'unknown theatre');

select lives_ok($$select public.admin_update_venue('a0000000-0000-0000-0000-000000000001', '', '  ', '')$$, 'blanks clear the fields');
select pg_temp.as_postgres();
select is((select (website, whats_on_url, circuit)::text from public.venues where name = 'Olivier Test'), '(,,)', 'cleared to null');
select is((select website from public.venues where name = 'Lyttelton Test'), 'https://nt.test', 'other theatres untouched');

select ok(not has_function_privilege('anon', 'public.admin_update_venue(uuid, text, text, text)', 'execute'), 'anon cannot run it');

select * from finish();
rollback;
