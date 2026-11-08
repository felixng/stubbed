-- suggest_shows (#360): community and yours suggestions, ranking, the 14-day
-- window, visibility, private profiles, blocks, dedupe, the cap and the empty
-- cases. Run with `supabase test db`.
begin;
select plan(16);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'me@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'b@example.com'),
  ('c0000000-0000-0000-0000-000000000000', 'c@example.com'),
  ('d0000000-0000-0000-0000-000000000000', 'd@example.com'),
  ('e0000000-0000-0000-0000-000000000000', 'e@example.com'),
  ('f0000000-0000-0000-0000-000000000000', 'f@example.com');
update public.profiles set is_private = true where id = 'd0000000-0000-0000-0000-000000000000';

insert into public.venues (id, name, city) values
  ('7e000000-0000-0000-0000-000000000001', 'Venue One', 'London'),
  ('7e000000-0000-0000-0000-000000000002', 'Venue Two', 'London'),
  ('7e000000-0000-0000-0000-000000000003', 'Venue Empty', 'London');
insert into public.shows (id, title) values
  ('5a000000-0000-0000-0000-000000000001', 'Show One'),
  ('5a000000-0000-0000-0000-000000000002', 'Show Two'),
  ('5a000000-0000-0000-0000-000000000003', 'Show Private Profile'),
  ('5a000000-0000-0000-0000-000000000004', 'Show Blocked'),
  ('5a000000-0000-0000-0000-000000000005', 'Show Private Entry'),
  ('5a000000-0000-0000-0000-000000000006', 'Show Out Of Window'),
  ('5a000000-0000-0000-0000-000000000007', 'Show Planned'),
  ('5a000000-0000-0000-0000-000000000008', 'Show Mine Only'),
  ('5a000000-0000-0000-0000-000000000009', 'Show Other Venue'),
  ('5a000000-0000-0000-0000-00000000000a', 'Show Blocker'),
  ('5a000000-0000-0000-0000-00000000000b', 'Show Four'),
  ('5a000000-0000-0000-0000-00000000000c', 'Show Five');

insert into public.blocks (blocker_id, blocked_id) values
  ('a0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000000'),
  ('f0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000');

-- Community (venue one, around 2026-10-05): Show One twice (b, c), Show Two once.
insert into public.entries (user_id, show_id, venue_id, date, visibility, status) values
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '2026-10-03', 'public', 'logged'),
  ('c0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '2026-10-08', 'public', 'logged'),
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000001', '2026-10-10', 'public', 'logged'),
  -- hidden: private profile, blocked either way, private entry, outside the window, planned, other venue
  ('d0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000001', '2026-10-05', 'public', 'logged'),
  ('e0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-000000000001', '2026-10-05', 'public', 'logged'),
  ('f0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-00000000000a', '7e000000-0000-0000-0000-000000000001', '2026-10-05', 'public', 'logged'),
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-000000000001', '2026-10-05', 'private', 'logged'),
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-000000000001', '2026-12-25', 'public', 'logged'),
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-000000000001', '2026-10-05', 'public', 'planned'),
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000009', '7e000000-0000-0000-0000-000000000002', '2026-10-05', 'public', 'logged'),
  -- mine: Show One again (dedupes against community), Show Mine Only (private entry still mine)
  ('a0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '2025-01-01', 'public', 'logged'),
  ('a0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-000000000001', '2024-01-01', 'private', 'logged');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');

select results_eq(
  $$select title, source from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-05')$$,
  $$values ('Show One'::text, 'yours'::text), ('Show Mine Only', 'yours'), ('Show Two', 'community')$$,
  'yours first, then community; same show+venue appears once; hidden rows absent');

select is(
  (select score from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-05') where title = 'Show Two'),
  1::numeric, 'community score is the number of different people');

select is_empty(
  $$select 1 from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-05')
    where title in ('Show Private Profile','Show Blocked','Show Blocker','Show Private Entry','Show Out Of Window','Show Planned','Show Other Venue')$$,
  'private profiles, blocks both ways, private entries, out-of-window, planned and other venues are excluded');

select is(
  (select count(*) from public.suggest_shows(array['7e000000-0000-0000-0000-000000000002']::uuid[], '2026-10-05')),
  1::bigint, 'only the requested venue is searched');

select is_empty(
  $$select 1 from public.suggest_shows(array['7e000000-0000-0000-0000-000000000003']::uuid[], '2026-10-05')$$,
  'a venue with no entries gives an empty result');
select is_empty($$select 1 from public.suggest_shows('{}'::uuid[], '2026-10-05')$$, 'no venues gives an empty result');
select is_empty($$select 1 from public.suggest_shows(null, '2026-10-05')$$, 'null venues gives an empty result');
select results_eq(
  $$select title from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], null)$$,
  $$values ('Show One'::text), ('Show Mine Only')$$,
  'no date: only your own history');

select is(
  (select count(*) from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-24')),
  3::bigint, 'the window is inclusive: Show Two on 10-10 still counts on 10-24 (14 days)');
select is(
  (select count(*) from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-25') where source = 'community'),
  0::bigint, 'just outside 14 days after the last community entry');

-- Cap: more than three community shows return three.
select pg_temp.as_admin();
insert into public.entries (user_id, show_id, venue_id, date, visibility, status)
select 'c0000000-0000-0000-0000-000000000000', s, '7e000000-0000-0000-0000-000000000002', '2026-10-05', 'public', 'logged'
from unnest(array['5a000000-0000-0000-0000-000000000002','5a000000-0000-0000-0000-00000000000a',
                  '5a000000-0000-0000-0000-00000000000b','5a000000-0000-0000-0000-00000000000c']::uuid[]) s;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
select is(
  (select count(*) from public.suggest_shows(array['7e000000-0000-0000-0000-000000000002']::uuid[], '2026-10-05') where source = 'community'),
  3::bigint, 'at most 3 community suggestions');

-- Another viewer sees their own view: b has no history, a is not blocked from b
select pg_temp.as_user('b0000000-0000-0000-0000-000000000000');
select is_empty(
  $$select 1 from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-05') where source = 'yours' and title = 'Show Mine Only'$$,
  'one user''s history never appears for another');

-- Signed out: no access
select pg_temp.as_anon();
select throws_ok(
  $$select * from public.suggest_shows(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-10-05')$$,
  '42501', null, 'anon cannot call suggest_shows');

select pg_temp.as_admin();
select has_function('public', 'suggest_shows', array['uuid[]', 'date'], 'signature is stable for #278');
select function_returns('public', 'suggest_shows', array['uuid[]', 'date'], 'setof record', 'returns rows');
select is_empty($$select 1 from information_schema.routine_privileges where routine_name = 'suggest_shows' and grantee = 'anon'$$, 'anon has no execute grant');

select * from finish();
rollback;
