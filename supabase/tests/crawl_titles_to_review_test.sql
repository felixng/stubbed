-- Crawl titles to show review (#367): only right, show-kind findings with no
-- matching show become candidates; repeats count; nothing reaches show search.
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
  ('a0000000-0000-0000-0000-00000000000a', 'Fringe Room One'),
  ('a0000000-0000-0000-0000-00000000000b', 'Fringe Room Two');
insert into public.shows (id, title, type) values ('5a000000-0000-0000-0000-000000000001', 'Blorple Held Show', 'play');
insert into public.show_aliases (show_id, alias) values ('5a000000-0000-0000-0000-000000000001', 'BHS Nickname');
-- A name already waiting from Wikidata.
select public.load_show_candidates('[{"wikidata_id":"Q9600001","title":"Blorple Wiki Name","type":"play","first_performed":2000,"aliases":[]}]'::jsonb);

insert into public.crawl_runs (id, venue_ids, method) values
  ('c0000000-0000-0000-0000-00000000000a', '{}', 'rules'),
  ('c0000000-0000-0000-0000-00000000000b', '{}', 'rules');

-- Run A findings
insert into public.crawl_findings (run_id, venue_id, source_url, raw_title, kind, method, review) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'Blorple New Fringe Play', 'show', 'structured', 'right'),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b', 'https://two.test/whats-on', 'BLORPLE NEW FRINGE PLAY', 'show', 'structured', 'right'),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'The Blorple Held Show', 'show', 'structured', 'right'),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'BHS Nickname', 'show', 'structured', 'right'),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'Blorple Talk Evening', 'talk', 'structured', 'right'),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'Blorple Wrong Title', 'show', 'model', 'wrong'),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'Blorple Unreviewed', 'show', 'model', null),
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'blorple wiki name', 'show', 'structured', 'right');
-- Run B sees the new play again
insert into public.crawl_findings (run_id, venue_id, source_url, raw_title, kind, method, review) values
  ('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'Blorple New Fringe Play', 'show', 'structured', 'right');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_send_findings_to_review('c0000000-0000-0000-0000-00000000000a')$$, '42501', null, 'a user cannot send findings');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_send_findings_to_review('c0000000-0000-0000-0000-0000000000ff')$$, 'P0002', null, 'an unknown run');
select is((select public.admin_send_findings_to_review('c0000000-0000-0000-0000-00000000000a')),
  '{"considered": 5, "already_shows": 2, "new_candidates": 1, "seen_again": 1}'::jsonb,
  '5 right show findings looked at: 2 already shows, 1 new name (seen twice), 1 raised a Wikidata candidate');
select pg_temp.as_postgres();
select is((select (lower(title), source, type::text, seen_count, status)::text from public.show_candidates where source = 'crawler'),
  '("blorple new fringe play",crawler,other,2,pending)', 'one crawler candidate, seen at two theatres');
select is((select c.source_url = case v.name when 'Fringe Room One' then 'https://one.test/whats-on' else 'https://two.test/whats-on' end
           from public.show_candidates c join public.venues v on v.id = c.venue_id where c.source = 'crawler'), true, 'with a source page and the theatre it was seen at');
select is((select seen_count from public.show_candidates where source_ref = 'Q9600001'), 2, 'a name already pulled from Wikidata only raised its count');
select is((select count(*) from public.show_candidates where title ilike 'blorple wiki name'), 1::bigint, 'no second candidate for it');
select is((select count(*) from public.show_candidates where title in ('Blorple Talk Evening', 'Blorple Wrong Title', 'Blorple Unreviewed')), 0::bigint, 'talks, wrong and unreviewed findings are left out');
select is((select count(*) from public.search_shows('Blorple New Fringe Play')), 0::bigint, 'nothing reaches show search');
select is((select count(*) from public.shows where title ilike 'blorple%'), 1::bigint, 'and no show was created');
select is((select count(*) from public.crawl_findings where run_id = 'c0000000-0000-0000-0000-00000000000a' and review = 'right' and kind = 'show' and sent_to_review_at is not null), 5::bigint, 'the findings are marked sent');

-- Sending again changes nothing.
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select public.admin_send_findings_to_review('c0000000-0000-0000-0000-00000000000a')),
  '{"considered": 0, "already_shows": 0, "new_candidates": 0, "seen_again": 0}'::jsonb, 'a second send does nothing');
-- A later run raises the count.
select is((select public.admin_send_findings_to_review('c0000000-0000-0000-0000-00000000000b')),
  '{"considered": 1, "already_shows": 0, "new_candidates": 0, "seen_again": 1}'::jsonb, 'a later sighting raises the count');
select pg_temp.as_postgres();
select is((select seen_count from public.show_candidates where source = 'crawler'), 3, 'to 3');
select is((select count(*) from public.show_candidates where source = 'crawler'), 1::bigint, 'still one row');

-- A reviewed candidate keeps its decision when seen again.
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select lives_ok($$select public.admin_reject_candidate((select id from public.show_candidates where source = 'crawler'))$$, 'reject it');
select pg_temp.as_postgres();
insert into public.crawl_runs (id, venue_ids, method) values ('c0000000-0000-0000-0000-00000000000c', '{}', 'rules');
insert into public.crawl_findings (run_id, venue_id, source_url, raw_title, kind, method, review) values
  ('c0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', 'https://one.test/whats-on', 'Blorple New Fringe Play', 'show', 'structured', 'right');
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select public.admin_send_findings_to_review('c0000000-0000-0000-0000-00000000000c');
select pg_temp.as_postgres();
select is((select status || ':' || seen_count from public.show_candidates where source = 'crawler'), 'rejected:4', 'a rejected name stays rejected but is counted');

-- A crawler candidate can be added like any other (no Wikidata id).
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select pg_temp.as_postgres();
insert into public.show_candidates (title, source, source_ref) values ('Blorple Crawl Only', 'crawler', 'blorple crawl only');
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select lives_ok($$select public.admin_add_candidate((select id from public.show_candidates where source_ref = 'blorple crawl only'))$$, 'add a crawler candidate');
select pg_temp.as_postgres();
select is((select (title, type::text, wikidata_id is null, verified)::text from public.shows where title = 'Blorple Crawl Only'), '("Blorple Crawl Only",other,t,t)', 'it becomes a show with no Wikidata id');
select is((select count(*) from public.search_shows('Blorple Crawl Only')), 1::bigint, 'findable once added');

select * from finish();
rollback;
