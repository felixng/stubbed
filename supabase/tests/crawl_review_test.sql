-- Crawl review (#359): admins only, marks, missed titles, scores, comparing runs.
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
insert into public.venues (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Review Theatre X'),
  ('a0000000-0000-0000-0000-00000000000b', 'Review Theatre Y');
insert into public.crawl_runs (id, venue_ids, method) values
  ('c0000000-0000-0000-0000-00000000000a', '{}', 'rules'),
  ('c0000000-0000-0000-0000-00000000000b', '{}', 'rules_model');

-- Run A
insert into public.crawl_findings (id, run_id, venue_id, source_url, raw_title, start_date, end_date, method) values
  ('f0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://x.test', 'Alpha', '2026-12-01', '2026-12-10', 'structured'),
  ('f0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://x.test', 'Beta',  '2026-12-02', null, 'structured'),
  ('f0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://x.test', 'Gamma', null, null, 'structured'),
  ('f0000000-0000-0000-0000-0000000000a4', 'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b', 'https://y.test', 'Delta', null, null, 'stub');
-- Run B
insert into public.crawl_findings (id, run_id, venue_id, source_url, raw_title, start_date, end_date, method) values
  ('f0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'https://x.test', 'ALPHA', '2026-12-01', '2026-12-10', 'model'),
  ('f0000000-0000-0000-0000-0000000000b2', 'c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'https://x.test', 'Beta',  '2026-12-03', null, 'model'),
  ('f0000000-0000-0000-0000-0000000000b3', 'c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'https://x.test', 'Epsilon', null, null, 'model');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000a1', 'right')$$, '42501', null, 'a user cannot mark');
select throws_ok($$select public.admin_add_missed_title('c0000000-0000-0000-0000-00000000000a', null, 'X')$$, '42501', null, 'a user cannot add a missed title');
select throws_ok($$select public.admin_delete_missed_title(gen_random_uuid())$$, '42501', null, 'a user cannot delete one');
select throws_ok($$select * from public.admin_crawl_scores('c0000000-0000-0000-0000-00000000000a')$$, '42501', null, 'a user cannot score');
select throws_ok($$select * from public.admin_compare_runs('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b')$$, '42501', null, 'a user cannot compare');
select is((select count(*) from public.crawl_missed), 0::bigint, 'a user sees no missed titles');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select lives_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000a1', 'right', '  matches the site ')$$, 'an admin marks right');
select lives_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000a2', 'wrong')$$, 'and wrong');
select throws_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000a2', 'maybe')$$, '22023', null, 'only right, wrong or unsure');
select throws_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000ff', 'right')$$, 'P0002', null, 'an unknown finding');
select is((select review_note from public.crawl_findings where id = 'f0000000-0000-0000-0000-0000000000a1'), 'matches the site', 'the note is trimmed');
select lives_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000a4', 'unsure')$$, 'unsure');
select lives_ok($$select public.admin_review_finding('f0000000-0000-0000-0000-0000000000a4', null)$$, 'a mark can be cleared');
select is((select review from public.crawl_findings where id = 'f0000000-0000-0000-0000-0000000000a4'), null, 'cleared');

-- Scores
select is((select row(findings, right_count, wrong_count, unsure_count, unreviewed, missed)::text
           from public.admin_crawl_scores('c0000000-0000-0000-0000-00000000000a') where venue_name = 'Review Theatre X'),
  '(3,1,1,0,1,0)', 'scores for theatre X in run A');
select is((select unreviewed from public.admin_crawl_scores('c0000000-0000-0000-0000-00000000000a') where venue_name = 'Review Theatre Y'), 1::bigint, 'and Y');

select lives_ok($$select public.admin_add_missed_title('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', ' Gamma ', 'on the site')$$, 'a missed title is added');
select lives_ok($$select public.admin_add_missed_title('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', 'Zeta')$$, 'for another theatre with no findings');
select throws_ok($$select public.admin_add_missed_title('c0000000-0000-0000-0000-00000000000b', null, '   ')$$, '22023', null, 'a blank title');
select throws_ok($$select public.admin_add_missed_title('c0000000-0000-0000-0000-0000000000ff', null, 'X')$$, 'P0002', null, 'an unknown run');
select is((select missed from public.admin_crawl_scores('c0000000-0000-0000-0000-00000000000b') where venue_name = 'Review Theatre X'), 1::bigint, 'missed counts in the score');
select is((select row(findings, missed)::text from public.admin_crawl_scores('c0000000-0000-0000-0000-00000000000b') where venue_name = 'Review Theatre Y'), '(0,1)', 'a theatre with only missed titles appears');
select is((select count(*) from public.crawl_missed), 2::bigint, 'an admin can read missed titles');
select lives_ok($$select public.admin_delete_missed_title((select id from public.crawl_missed where title = 'Zeta'))$$, 'delete a missed title');
select is((select count(*) from public.crawl_missed), 1::bigint, 'it is gone');
select throws_ok($$insert into public.crawl_missed (run_id, title) values ('c0000000-0000-0000-0000-00000000000a', 'x')$$, '42501', null, 'no direct writes');

-- Compare A to B
select is((select array_agg(status || ':' || raw_title order by raw_title) from public.admin_compare_runs('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b')),
  array['same:ALPHA', 'changed:Beta', 'lost:Delta', 'added:Epsilon', 'lost:Gamma'], 'same, changed, added and lost');
select is((select carried_review from public.admin_compare_runs('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b') where raw_title = 'ALPHA'), 'right',
  'a mark carries over when title and dates are the same');
select is((select carried_review from public.admin_compare_runs('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b') where raw_title = 'Beta'), null,
  'but not when the dates changed');
select is((select count(*) from public.admin_compare_runs('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b')), 1::bigint, 'one theatre only');
select is((select a_dates || ' / ' || b_dates from public.admin_compare_runs('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b') where raw_title = 'Beta'), '2026-12-02 / 2026-12-03', 'the dates of each run');

select pg_temp.as_postgres();
select ok(not has_table_privilege('anon', 'public.crawl_missed', 'select'), 'anon has no access');
select * from finish();
rollback;
