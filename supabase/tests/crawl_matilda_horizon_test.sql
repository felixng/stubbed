-- #444: a JSON-LD endDate on a long run (Matilda, 2027-09-05) is a scheduled end / booking horizon, never a
-- confirmed closing: no autofill, and chips report it as scheduled_end rather than "until".
begin;
select plan(5);
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000f4', 'horizon@example.com');
insert into public.venues (id, name, city) values ('7e000000-0000-0000-0000-0000000000f4', 'Cambridge Theatre', 'London');
insert into public.shows (id, title) values ('5a000000-0000-0000-0000-0000000000f4', 'Matilda the Musical');
create function pg_temp.fact(ev text, venue uuid, show uuid, title text, k text, d date) returns void language sql as $$
  insert into public.crawl_run_evidence (source_id, source_event_key, segment_key, engagement_id, venue_id, show_id,
    raw_title, fact_key, kind, precision, on_date, evidence_field, source_url, parser_version, extraction_method,
    match_status, page_checked, observed_at, last_seen_at, value_hash)
  values ((select id from public.crawl_sources where source_key = 'london_theatre'), ev, 'main', md5(ev)::uuid, venue, show,
    title, k || ':f:' || case when d is null then 'unknown' else 'day' end, k,
    case when d is null then 'unknown' else 'day' end, d, 'f', 'https://example.test/' || ev, 'v1', 'fixture',
    case when show is null then 'venue_only' else 'show_resolved' end, true, now(), now(), md5(ev || k || coalesce(d::text, '')));
$$;


select pg_temp.fact('matilda', '7e000000-0000-0000-0000-0000000000f4', '5a000000-0000-0000-0000-0000000000f4', 'Matilda the Musical', 'start', '2026-01-01');
select pg_temp.fact('matilda', '7e000000-0000-0000-0000-0000000000f4', '5a000000-0000-0000-0000-0000000000f4', 'Matilda the Musical', 'end', '2027-09-05');
set local role postgres;
update public.catalogue_consumer_flags set enabled = true where flag in ('catalogue_run_chips_enabled', 'catalogue_run_autofill_enabled');
select is((select confirmed_end_date from public.catalogue_effective_runs where venue_id = '7e000000-0000-0000-0000-0000000000f4'),
  null::date, 'a JSON-LD end date is not a confirmed end');
select is((select scheduled_end_date from public.catalogue_effective_runs where venue_id = '7e000000-0000-0000-0000-0000000000f4'),
  '2027-09-05'::date, 'it is kept as a scheduled end');
select set_config('role', 'authenticated', true), set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
select is((select eligibility_reason from public.suggest_shows_v2(array['7e000000-0000-0000-0000-0000000000f4']::uuid[], '2026-12-15') where source = 'run'),
  'scheduled_end', 'chips never describe it as a confirmed closing');
select is((select autofill_eligible from public.suggest_shows_v2(array['7e000000-0000-0000-0000-0000000000f4']::uuid[], '2026-12-15') where source = 'run'),
  false, 'not eligible for autofill even with the autofill flag on');
select is((select count(*) from public.suggest_shows_v2(array['7e000000-0000-0000-0000-0000000000f4']::uuid[], '2027-12-01') where source = 'run'),
  0::bigint, 'nothing is claimed past the scheduled end');
select * from finish();
rollback;
