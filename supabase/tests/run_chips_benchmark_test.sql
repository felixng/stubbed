-- Run-chip benchmark (#428). 120 labelled venue/date/show cases, built from
-- deterministic fixtures. Labels come from how each case is constructed, not
-- from the function under test. This measures SQL behaviour on fixtures; it
-- is NOT a claim about production accuracy. Gate: >= 95% correct top-3 on
-- answerable cases, and zero unsupported claims on abstain cases.
begin;
select plan(7);

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000000', 'me@example.com');
update public.catalogue_consumer_flags set enabled = true where flag = 'catalogue_run_chips_enabled';

-- kind: 0 closed historical, 1 current/future confirmed closing, 2 booking horizon,
-- 3 unknown end, 4 conflicting closings, 5 two valid shows (ambiguous, both answerable)
create temp table bench (n int primary key, kind int, city text, venue uuid, show uuid, show2 uuid,
  query_date date, answerable boolean, expect_both boolean, category text[]);
insert into bench
select n, n % 6,
  (array['London','London','New York','Leeds','Edinburgh','Chicago'])[1 + (n / 6) % 6],
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  case n % 6 when 0 then date '2023-03-01' + n when 1 then date '2026-11-08' when 2 then date '2026-12-01'
    when 3 then date '2026-02-01' + n when 4 then date '2026-05-10' else date '2026-07-01' end,
  n % 6 in (0, 1, 2, 5), n % 6 = 5,
  array_remove(array[
    case when n % 6 = 0 then 'historical' end,
    case when n % 6 in (1, 2) then 'current_future' end,
    case when (n / 6) % 6 >= 2 then 'off_west_end' end,
    case when n % 6 in (3, 4, 5) then 'ambiguous' end], null)
from generate_series(1, 120) n;

insert into public.venues (id, name, city) select venue, 'Bench Venue ' || n, city from bench;
insert into public.shows (id, title) select show, 'Bench Show ' || n from bench
  union all select show2, 'Bench Second ' || n from bench where kind = 5;

create function pg_temp.f(ev text, v uuid, s uuid, t text, k text, d date) returns void language sql as $$
  insert into public.crawl_run_evidence (source_id, source_event_key, segment_key, engagement_id, venue_id, show_id,
    raw_title, fact_key, kind, precision, on_date, evidence_field, source_url, parser_version, extraction_method,
    match_status, page_checked, observed_at, last_seen_at, value_hash)
  values ((select id from public.crawl_sources where source_key = 'london_theatre'), ev, 'main', md5(ev)::uuid, v, s,
    t, k || ':f:day', k, 'day', d, 'f', 'https://example.test/' || ev, 'v1', 'fixture', 'show_resolved', true,
    now(), now(), md5(ev || k || d::text));
$$;

select pg_temp.f('b' || n, venue, show, 'Bench Show ' || n, 'start',
  case kind when 0 then date '2023-01-01' + n when 1 then date '2026-01-01' when 2 then date '2026-06-01'
    when 3 then query_date - 30 when 4 then date '2026-04-01' else date '2026-06-01' end) from bench;
select pg_temp.f('b' || n, venue, show, 'Bench Show ' || n, 'closing',
  case kind when 0 then date '2023-01-01' + n + 400 when 1 then date '2027-03-01' when 4 then date '2026-08-01' else date '2026-12-31' end)
  from bench where kind in (0, 1, 4, 5);
select pg_temp.f('b' || n, venue, show, 'Bench Show ' || n, 'closing', date '2026-09-01') from bench where kind = 4;
select pg_temp.f('b' || n, venue, show, 'Bench Show ' || n, 'booking_until', date '2027-01-01') from bench where kind = 2;
select pg_temp.f('c' || n, venue, show2, 'Bench Second ' || n, 'start', date '2026-06-15') from bench where kind = 5;
select pg_temp.f('c' || n, venue, show2, 'Bench Second ' || n, 'closing', date '2026-12-31') from bench where kind = 5;

grant select on bench to authenticated;
select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

create temp table outcome as
select b.*, (select coalesce(array_agg(r.show_id), '{}') from public.suggest_shows_v2(array[b.venue], b.query_date) r
  where r.source = 'run') as got
from bench b;

select is((select count(*) from bench), 120::bigint, 'at least 100 labelled cases');
select ok((select count(*) from bench where 'historical' = any(category)) >= 20
  and (select count(*) from bench where 'current_future' = any(category)) >= 20
  and (select count(*) from bench where 'off_west_end' = any(category)) >= 10
  and (select count(*) from bench where 'ambiguous' = any(category)) >= 10, 'category quotas met');

create temp table answerable as select * from outcome where answerable;
select ok((select count(*) filter (where show = any(got) and (not expect_both or show2 = any(got)))::numeric / count(*)
  from answerable) >= 0.95, 'top-3 correct on >= 95% of answerable cases');
select is((select count(*) from answerable where not (show = any(got))), 0::bigint, 'no answerable case missed on fixtures');
select is((select count(*) from outcome where not answerable and cardinality(got) > 0), 0::bigint,
  'unknown end, conflicting facts: no unsupported claims');
select is((select count(*) from outcome where cardinality(got) > 3), 0::bigint, 'never more than three run chips');

-- A booking horizon is not a claim beyond it.
select is((select count(*) from bench b, lateral public.suggest_shows_v2(array[b.venue], date '2027-02-01') r
  where b.kind = 2 and r.source = 'run'), 0::bigint, 'nothing past a booking horizon');

select * from finish();
rollback;
