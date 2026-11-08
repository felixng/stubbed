-- Run chips (#278): suggest_shows_v2 from validated evidence only, behind
-- server flags that default off; older suggest_shows is unchanged.
-- Run with `supabase test db`.
begin;
select plan(19);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$ select set_config('role', 'postgres', true); $$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'me@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'b@example.com');
insert into public.venues (id, name, city) values
  ('7e000000-0000-0000-0000-000000000001', 'Venue One', 'London'),
  ('7e000000-0000-0000-0000-000000000002', 'Venue Two (other auditorium)', 'London'),
  ('7e000000-0000-0000-0000-000000000003', 'Venue Three', 'London');
insert into public.shows (id, title) values
  ('5a000000-0000-0000-0000-000000000001', 'Closed Show'),
  ('5a000000-0000-0000-0000-000000000002', 'Booking Show'),
  ('5a000000-0000-0000-0000-000000000003', 'Open Ended Show'),
  ('5a000000-0000-0000-0000-000000000004', 'Cancelled Show'),
  ('5a000000-0000-0000-0000-000000000005', 'Conflicting Show'),
  ('5a000000-0000-0000-0000-000000000006', 'Other Auditorium Show'),
  ('5a000000-0000-0000-0000-000000000007', 'Withdrawn Show'),
  ('5a000000-0000-0000-0000-000000000008', 'Single Show'),
  ('5a000000-0000-0000-0000-000000000009', 'Dated Show');

create function pg_temp.fact(ev text, venue uuid, show uuid, title text, k text, d date) returns void language sql as $$
  insert into public.crawl_run_evidence (source_id, source_event_key, segment_key, engagement_id, venue_id, show_id,
    raw_title, fact_key, kind, precision, on_date, evidence_field, source_url, parser_version, extraction_method,
    match_status, page_checked, observed_at, last_seen_at, value_hash)
  values ((select id from public.crawl_sources where source_key = 'london_theatre'), ev, 'main', md5(ev)::uuid, venue, show,
    title, k || ':f:' || case when d is null then 'unknown' else 'day' end, k,
    case when d is null then 'unknown' else 'day' end, d, 'f', 'https://example.test/' || ev, 'v1', 'fixture',
    case when show is null then 'venue_only' else 'show_resolved' end, true, now(), now(), md5(ev || k || coalesce(d::text, '')));
$$;

select pg_temp.fact('closed', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'Closed Show', 'start', '2026-03-01');
select pg_temp.fact('closed', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'Closed Show', 'closing', '2026-09-30');
select pg_temp.fact('booking', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'Booking Show', 'start', '2026-06-01');
select pg_temp.fact('booking', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'Booking Show', 'booking_until', '2026-12-31');
select pg_temp.fact('open', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', 'Open Ended Show', 'start', '2026-04-01');
select pg_temp.fact('cancel', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000004', 'Cancelled Show', 'start', '2026-04-01');
select pg_temp.fact('cancel', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000004', 'Cancelled Show', 'cancelled', null);
select pg_temp.fact('conflict', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000005', 'Conflicting Show', 'start', '2026-04-01');
select pg_temp.fact('conflict', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000005', 'Conflicting Show', 'closing', '2026-08-01');
select pg_temp.fact('conflict', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000005', 'Conflicting Show', 'closing', '2026-09-01');
select pg_temp.fact('other', '7e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000006', 'Other Auditorium Show', 'start', '2026-03-01');
select pg_temp.fact('other', '7e000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000006', 'Other Auditorium Show', 'closing', '2026-09-30');
select pg_temp.fact('unresolved', '7e000000-0000-0000-0000-000000000001', null, 'Raw Title Show', 'start', '2026-05-01');
select pg_temp.fact('unresolved', '7e000000-0000-0000-0000-000000000001', null, 'Raw Title Show', 'closing', '2026-05-31');
select pg_temp.fact('wd', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000007', 'Withdrawn Show', 'start', '2026-03-01');
select pg_temp.fact('wd', '7e000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000007', 'Withdrawn Show', 'closing', '2026-09-30');
update public.crawl_run_evidence set withdrawn_at = now() where source_event_key = 'wd';
-- Venue three: exactly one run, explicit closing (autofill candidate).
select pg_temp.fact('single', '7e000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000008', 'Single Show', 'start', '2026-03-01');
select pg_temp.fact('single', '7e000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000008', 'Single Show', 'closing', '2026-09-30');
-- Specific dates only
select pg_temp.fact('dated', '7e000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000009', 'Dated Show', 'performance', '2026-07-04');
select pg_temp.fact('dated', '7e000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000009', 'Dated Show', 'start', '2026-07-04');

create function pg_temp.chips(venue integer, d date) returns text language sql as $$
  select coalesce(string_agg(title || ':' || coalesce(eligibility_reason, source), ',' order by title), '')
  from public.suggest_shows_v2(array[('7e000000-0000-0000-0000-00000000000' || venue)::uuid], d)
  where source = 'run';
$$;
create function pg_temp.autofill(venue integer, d date) returns text language sql as $$
  select coalesce(string_agg(title || ':' || autofill_eligible, ',' order by title), '')
  from public.suggest_shows_v2(array[('7e000000-0000-0000-0000-00000000000' || venue)::uuid], d)
  where source = 'run';
$$;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
select is(pg_temp.chips(1, '2026-05-10'), '', 'flags default off: no run chips');
select is((select count(*) from public.suggest_shows_v2(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-05-10')),
  0::bigint, 'flags off: nothing else is returned for a venue with no entries');

select pg_temp.as_admin();
update public.catalogue_consumer_flags set enabled = true where flag = 'catalogue_run_chips_enabled';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');

select is(pg_temp.chips(1, '2026-05-10'), 'Closed Show:confirmed_closing,Raw Title Show:confirmed_closing',
  'inside confirmed runs; cancelled, conflicting, withdrawn and open-ended-later are excluded; unresolved show kept by title');
select is((select show_id is null from public.suggest_shows_v2(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-05-10') where title = 'Raw Title Show'),
  true, 'an unresolved show has a null show_id for the Did you mean resolver');
select is(pg_temp.chips(1, '2026-04-01'), 'Closed Show:confirmed_closing,Open Ended Show:start_date', 'an unknown end matches only its start date');
select is(pg_temp.chips(1, '2026-04-02'), 'Closed Show:confirmed_closing', 'an unknown end does not match arbitrary later dates');
select is(pg_temp.chips(1, '2026-08-01'), 'Booking Show:booking_horizon,Closed Show:confirmed_closing', 'a booking horizon is reported as such, with several shows offered');
select is(pg_temp.chips(1, '2026-10-15'), 'Booking Show:booking_horizon', 'after a confirmed closing the run no longer matches');
select is(pg_temp.chips(1, '2027-01-15'), '', 'beyond every supported interval nothing matches');
select is(pg_temp.chips(2, '2026-05-10'), 'Other Auditorium Show:confirmed_closing', 'another auditorium has its own runs');
select is(pg_temp.chips(3, '2026-05-10'), 'Single Show:confirmed_closing', 'specific-date runs do not match other days');
select is(pg_temp.chips(3, '2026-07-04'), 'Dated Show:specific_date,Single Show:confirmed_closing', 'a specific supported date matches');

-- Autofill has its own flag, defaults off, and needs exactly one candidate.
select is(pg_temp.autofill(3, '2026-05-10'), 'Single Show:false', 'autofill flag off: never eligible');
select pg_temp.as_admin();
update public.catalogue_consumer_flags set enabled = true where flag = 'catalogue_run_autofill_enabled';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
select is(pg_temp.autofill(3, '2026-05-10'), 'Single Show:true', 'one exact venue, one resolved show, explicit closing: eligible');
select is(pg_temp.autofill(3, '2026-07-04'), 'Dated Show:false,Single Show:false', 'two candidates: not eligible');
select is(pg_temp.autofill(1, '2026-05-10'), 'Closed Show:false,Raw Title Show:false', 'several or unresolved: not eligible');

-- Community chips from #360 are kept and win over a duplicate run chip.
select pg_temp.as_admin();
insert into public.entries (user_id, show_id, venue_id, date, visibility, status) values
  ('b0000000-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '2026-05-09', 'public', 'logged');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
select is((select string_agg(source, ',' order by source) from public.suggest_shows_v2(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-05-10') where title = 'Closed Show'),
  'community', 'the same show is offered once, community first');

-- Access
select pg_temp.as_anon();
select throws_ok($$select * from public.suggest_shows_v2(array['7e000000-0000-0000-0000-000000000001']::uuid[], '2026-05-10')$$, '42501', null, 'anon cannot call v2');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_set_catalogue_flag('catalogue_run_chips_enabled', false)$$, '42501', null, 'only admins switch flags');

select * from finish();
rollback;
