-- Crawl tables (#277): admin read only, written by the service role only.
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
insert into public.venues (id, name) values ('a0000000-0000-0000-0000-000000000001', 'Crawl Test Theatre');
insert into public.crawl_runs (id, venue_ids, method) values
  ('c0000000-0000-0000-0000-000000000001', array['a0000000-0000-0000-0000-000000000001']::uuid[], 'rules');
insert into public.crawl_findings (run_id, venue_id, source_url, raw_title, method) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'https://x.test/whats-on', 'A Show', 'stub');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is((select count(*) from public.crawl_runs), 0::bigint, 'a user sees no runs');
select is((select count(*) from public.crawl_findings), 0::bigint, 'a user sees no findings');
select throws_ok($$insert into public.crawl_runs (venue_ids) values ('{}')$$, '42501', null, 'a user cannot start a run');
select throws_ok($$update public.crawl_findings set review = 'right'$$, '42501', null, 'a user cannot review');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select count(*) from public.crawl_runs), 1::bigint, 'an admin sees runs');
select is((select count(*) from public.crawl_findings), 1::bigint, 'an admin sees findings');
select throws_ok($$insert into public.crawl_runs (venue_ids) values ('{}')$$, '42501', null, 'even an admin cannot write directly');
select throws_ok($$update public.crawl_findings set review = 'right'$$, '42501', null, 'or edit a finding directly');

select pg_temp.as_postgres();
select ok(not has_table_privilege('anon', 'public.crawl_runs', 'select'), 'anon has no access');
select throws_ok($$insert into public.crawl_runs (status) values ('weird')$$, '23514', null, 'status is checked');
select throws_ok($$insert into public.crawl_findings (run_id, source_url, raw_title, method)
  values ('c0000000-0000-0000-0000-000000000001', 'https://x.test', 'T', 'guess')$$, '23514', null, 'method is checked');
select throws_ok($$insert into public.crawl_findings (run_id, source_url, raw_title, method, start_date, end_date)
  values ('c0000000-0000-0000-0000-000000000001', 'https://x.test', 'T', 'stub', '2026-12-02', '2026-12-01')$$, '23514', null, 'a show cannot end before it starts');
select throws_ok($$insert into public.crawl_findings (run_id, source_url, raw_title, method, confidence)
  values ('c0000000-0000-0000-0000-000000000001', 'https://x.test', 'T', 'stub', 1.5)$$, '23514', null, 'confidence is 0 to 1');

delete from public.venues where id = 'a0000000-0000-0000-0000-000000000001';
select is((select count(*) from public.crawl_findings where venue_id is null), 1::bigint, 'deleting a venue keeps its findings');
delete from public.crawl_runs where id = 'c0000000-0000-0000-0000-000000000001';
select is((select count(*) from public.crawl_findings), 0::bigint, 'deleting a run deletes its findings');

select * from finish();
rollback;
