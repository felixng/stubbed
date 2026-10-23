-- The Profile tab's own stats count the caller's private shows too, and only
-- ever the caller's. Run with `supabase test db`.
begin;
select plan(5);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Fixtures, as the superuser --------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@example.com');

insert into public.shows (id, title) values
  ('5a000000-0000-0000-0000-000000000001', 'Hamilton'),
  ('5a000000-0000-0000-0000-000000000002', 'Hadestown');

insert into public.venues (id, name, city) values
  ('7e000000-0000-0000-0000-000000000001', 'Richard Rodgers Theatre', 'New York'),
  ('7e000000-0000-0000-0000-000000000002', 'Walter Kerr Theatre', 'new york '),
  ('7e000000-0000-0000-0000-000000000003', 'Lyric Theatre', 'London');

-- Alice: two public shows, a private one in another city, one with no venue
-- (private), and a planned one that doesn't count yet.
insert into public.entries (user_id, show_id, venue_id, date, visibility, status) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '2026-10-01', 'public', 'logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000002', '2026-10-02', 'public', 'logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000003', '2026-10-03', 'private', 'logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', null, '2026-10-04', 'private', 'logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000003', '2099-01-01', 'public', 'planned');

-- Tests -----------------------------------------------------------------------

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');

select results_eq(
  $$ select shows, venues, cities, public_shows from public.own_profile_stats() $$,
  $$ values (4, 3, 2, 2) $$,
  'the owner counts private shows too, and how many are public'
);

select results_eq(
  $$ select shows from public.public_profile_stats('aaaaaaaa-0000-0000-0000-000000000000') $$,
  $$ values (2) $$,
  'the public numbers still leave the private shows out'
);

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

select results_eq(
  $$ select shows, venues, cities, public_shows from public.own_profile_stats() $$,
  $$ values (0, 0, 0, 0) $$,
  'another user gets their own (empty) numbers, never alice''s'
);

reset role;
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select * from public.own_profile_stats() $$,
  '42501',
  null,
  'signed-out visitors cannot call it'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.own_profile_stats()', 'execute'),
  'anon has no execute grant'
);

select * from finish();
rollback;
