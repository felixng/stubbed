begin;
select no_plan();

insert into auth.users(id,email) values
  ('d4240000-0000-0000-0000-000000000001','run-owner@example.com'),
  ('d4240000-0000-0000-0000-000000000002','run-other@example.com');
insert into public.venues(id,name,city,country) values
  ('a4240000-0000-0000-0000-000000000001','Fixture Hall','London','GB'),
  ('a4240000-0000-0000-0000-000000000002','Fixture Transfer Hall','London','GB');
insert into public.shows(id,title,type) values
  ('b4240000-0000-0000-0000-000000000001','The Glass Atlas','play'),
  ('b4240000-0000-0000-0000-000000000002','Fixture Miss','play');
insert into public.entries(user_id,show_id,venue_id,date,status,visibility) values
  ('d4240000-0000-0000-0000-000000000001','b4240000-0000-0000-0000-000000000001','a4240000-0000-0000-0000-000000000001','2019-09-01','logged','private'),
  ('d4240000-0000-0000-0000-000000000001','b4240000-0000-0000-0000-000000000001','a4240000-0000-0000-0000-000000000001','2026-01-10','logged','private'),
  ('d4240000-0000-0000-0000-000000000001','b4240000-0000-0000-0000-000000000002','a4240000-0000-0000-0000-000000000001','2020-01-02','logged','private'),
  ('d4240000-0000-0000-0000-000000000002','b4240000-0000-0000-0000-000000000001','a4240000-0000-0000-0000-000000000001','2019-09-03','logged','private');

create function pg_temp.record(source_key text, external text, segment text, shared text, facts jsonb,
  observed timestamptz default '2026-11-01T00:00:00Z')
returns uuid language sql as $$
  select public.record_crawl_run_segment(s.id, external, segment, shared,
    'a4240000-0000-0000-0000-000000000001','b4240000-0000-0000-0000-000000000001',
    'The Glass Atlas', facts,'https://fixture.test/event',observed,'fixture-v1','deterministic')
  from public.crawl_sources s where s.source_key = $1;
$$;

select ok(not has_table_privilege('anon', 'public.catalogue_effective_runs', 'select'),
  'effective catalogue is private before consumer rollout');
select ok(not has_function_privilege('authenticated', 'public.publish_crawl_run_evidence(text,integer)', 'execute'),
  'run publication is service-only');

set local role service_role;
select is(public.publish_crawl_run_evidence('london_theatre'), '{"inactive":true}'::jsonb, 'source flag pauses run publishing');

select pg_temp.record('london_theatre','one','first','verified-fixture-id',
  '[{"kind":"preview","date":"2019-09-01"},{"kind":"opening","date":"2019-09-05"},
    {"kind":"closing","date":"2019-10-01"}]') as engagement \gset
select is((select start_date from public.catalogue_effective_runs where id = :'engagement'),
  '2019-09-01'::date,'explicit previews support attendance before opening');
select is((select opening_date from public.catalogue_effective_runs where id = :'engagement'),
  '2019-09-05'::date,'press opening remains separately visible');
select is((select autofill_reason from public.catalogue_effective_runs where id = :'engagement'), 'eligible',
  'verified closed historical interval does not expire');

select is(pg_temp.record('playbill','different-source-key','first','verified-fixture-id',
  '[{"kind":"start","date":"2019-09-01"},{"kind":"closing","date":"2019-10-02"}]'),
  :'engagement'::uuid, 'explicit shared engagement plus known show and venue permits equivalence');
select ok((select conflicting and confirmed_end_date is null and autofill_reason = 'conflicting_evidence'
  from public.catalogue_effective_runs where id = :'engagement'), 'same-authority closing disagreement cannot autofill');

select is(pg_temp.record('official','official-event','first','verified-fixture-id',
  '[{"kind":"start","date":"2019-09-01"},{"kind":"closing","date":"2019-10-06"}]'),
  :'engagement'::uuid, 'official evidence joins a corroborated engagement');
select ok((select not conflicting and confirmed_end_date = '2019-10-06'
  from public.catalogue_effective_runs where id = :'engagement'), 'official closing outranks aggregate assertions');
select pg_temp.record('official','official-event','first','verified-fixture-id',
  '[{"kind":"cancelled","evidence":{"field":"official.status","text":"Cancelled"}}]', '2026-11-02');
select ok((select cancelled and autofill_reason = 'cancelled' from public.catalogue_effective_runs where id = :'engagement'),
  'an explicit higher-authority cancellation suppresses the engagement');
select pg_temp.record('official','official-event','first','verified-fixture-id',
  '[{"kind":"reopened","evidence":{"field":"official.status","text":"Reopened"}}]', '2026-11-03');
select ok((select not cancelled from public.catalogue_effective_runs where id = :'engagement'),
  'an explicit later reopening supersedes the cancellation from that field');

select ok(public.set_crawl_source_withdrawal('official',true),'official withdrawal recorded independently');
select ok((select conflicting from public.catalogue_effective_runs where id = :'engagement'),
  'withdrawal removes only the withdrawn source contribution');
select ok(public.set_crawl_source_withdrawal('playbill',true),'second source can be withdrawn');
select is((select confirmed_end_date from public.catalogue_effective_runs where id = :'engagement'),
  '2019-10-01'::date,'independently supported evidence and engagement ID survive withdrawal');
select is((select count(*) from public.crawl_run_evidence where engagement_id = :'engagement'), 9::bigint,
  'withdrawal retains source evidence and superseded status for audit');

select pg_temp.record('london_theatre','booking','default',null,
  '[{"kind":"opening","date":"2030-01-10"},{"kind":"booking_until","date":"2030-02-01"}]') as booking \gset
select ok((select start_date = '2030-01-10' and support_end_date = '2030-02-01' and confirmed_end_date is null
  and autofill_reason = 'no_confirmed_closing' from public.catalogue_effective_runs where id = :'booking'),
  'press opening supports no earlier dates and booking bounds the interval without confirming closing');

select pg_temp.record('london_theatre','unknown','default',null,
  '[{"kind":"start","date":"2026-01-01"},{"kind":"unknown","intended_kind":"closing","precision":"month",
    "evidence":{"field":"Closing","text":"February 2026"}}]') as unknown_run \gset
select ok((select support_end_date is null and confirmed_end_date is null
  from public.catalogue_effective_runs where id = :'unknown_run'), 'unknown closing never implies an infinite run');
select is((select count(*) from public.crawl_run_evidence where engagement_id = :'unknown_run' and precision = 'month'
  and on_date is null), 1::bigint, 'partial date is retained without an invented day');

select pg_temp.record('london_theatre','two-days','default',null,
  '[{"kind":"performance","date":"2026-01-11"},{"kind":"performance","date":"2026-01-25"}]') as discrete \gset
select ok((select performance_dates = array['2026-01-11','2026-01-25']::date[] and support_end_date is null
  from public.catalogue_effective_runs where id = :'discrete'), 'discrete dates do not imply an uninterrupted interval');

select pg_temp.record('london_theatre','hiatus','before',null,
  '[{"kind":"start","date":"2020-02-01"},{"kind":"closing","date":"2020-02-10"},{"kind":"exception","date":"2020-02-05"}]') as early \gset
select pg_temp.record('london_theatre','hiatus','after',null,
  '[{"kind":"start","date":"2020-03-01"},{"kind":"closing","date":"2020-03-10"}]') as late \gset
select isnt(:'early'::uuid, :'late'::uuid,'explicit hiatus segments have separate IDs');
select ok((select support_end_date = '2020-02-10' and exception_dates = array['2020-02-05']::date[]
  from public.catalogue_effective_runs where id = :'early'),'hiatus gap and exception are preserved');

select pg_temp.record('london_theatre','corrected','default',null,
  '[{"kind":"start","date":"2030-04-01"},{"kind":"closing","date":"2030-04-30"}]', now() - interval '20 days') as corrected \gset
select is(pg_temp.record('london_theatre','corrected','default',null,
  '[{"kind":"start","date":"2030-04-03"}]', now() - interval '19 days'), :'corrected'::uuid,
  'correcting start preserves the engagement ID');
select ok((select start_date = '2030-04-03' and confirmed_end_date = '2030-04-30' and autofill_reason = 'stale'
  from public.catalogue_effective_runs where id = :'corrected'), 'omitted closing keeps last good evidence and current freshness is required');
select isnt(pg_temp.record('london_theatre','separate-production','default',null,
  '[{"kind":"start","date":"2030-04-03"},{"kind":"closing","date":"2030-04-30"}]'), :'corrected'::uuid,
  'overlapping same-title events stay separate without engagement evidence');
select is(pg_temp.record('london_theatre','corrected','default',null,
  '[{"kind":"start","date":"2030-04-03"}]', now() - interval '19 days'), :'corrected'::uuid, 'publication replay keeps the ID');
select is((select count(*) from public.crawl_run_evidence where engagement_id = :'corrected'), 3::bigint,
  'replay neither duplicates facts nor erases history');

-- Check the real publication checkpoints with a two-venue transfer.
update public.crawl_sources set collection_enabled = true, publication_enabled = true where source_key = 'london_theatre';
insert into public.crawl_source_entities (source_id, entity_kind, external_key, venue_id, resolution_status)
select id, 'venue', 'fixture-main','a4240000-0000-0000-0000-000000000001'::uuid,'linked'
from public.crawl_sources where source_key = 'london_theatre'
union all
select id, 'venue', 'fixture-transfer','a4240000-0000-0000-0000-000000000002'::uuid,'linked'
from public.crawl_sources where source_key = 'london_theatre';
select public.start_crawl_generation('london_theatre','transfer','event',
  'https://www.londontheatre.co.uk/show/424-transfer') as generation \gset
select public.claim_crawl_task('london_theatre','event','transfer','test') as claimed \gset
select public.finish_crawl_fetch((:'claimed'::jsonb->>'id')::uuid, (:'claimed'::jsonb->>'lease_token')::uuid,
  '2', repeat('a',64), '[]',
  '[{"observation_kind":"event","external_key":"transfer","event_kind":"show","show_type":"play","raw_title":"The Glass Atlas",
     "date_status":"supported","venue":{"external_key":"fixture-main"},"dates":[{"kind":"start","date":"2024-01-01"}],
     "segments":[
       {"segment_key":"initial","venue":{"external_key":"fixture-main"},"dates":[{"kind":"start","date":"2024-01-01"},{"kind":"closing","date":"2024-01-31"}]},
       {"segment_key":"transfer","venue":{"external_key":"fixture-transfer"},"dates":[{"kind":"start","date":"2024-02-15"},{"kind":"closing","date":"2024-02-25"}]}
     ]}]', null, null);
select is(public.publish_crawl_run_evidence('london_theatre')->>'processed','0','run publishing waits for identity checkpoint');
select is(public.publish_crawl_identities('london_theatre')->>'processed','1','identity checkpoint lands independently');
update public.crawl_sources set collection_enabled = false where source_key = 'london_theatre';

savepoint before_run_publish;
select public.publish_crawl_run_evidence('london_theatre');
rollback to before_run_publish;
select is((select count(*) from public.crawl_run_evidence where source_event_key = 'transfer'),0::bigint,
  'interruption before commit leaves the publication pending');
select is(public.publish_crawl_run_evidence('london_theatre')->>'observed_segments','2',
  'restart publishes both resolved transfer segments with collection off');
select is(public.publish_crawl_run_evidence('london_theatre')->>'processed','0','committed publication replay is a no-op');
select is((select count(distinct venue_id) from public.crawl_run_evidence where source_event_key = 'transfer'),
  2::bigint,'transfer keeps the source venue for each segment');

-- A good legacy end date survives a later checked reading with no end.
select public.set_crawl_source_withdrawal('official',false);
insert into public.crawl_runs (id) values
  ('c4240000-0000-0000-0000-000000000001'), ('c4240000-0000-0000-0000-000000000002');
insert into public.crawl_findings (run_id,venue_id,source_url,raw_title,start_date,end_date,method,page_checked)
values
  ('c4240000-0000-0000-0000-000000000001','a4240000-0000-0000-0000-000000000001','https://fixture.test/legacy','The Glass Atlas','2023-01-01','2023-01-31','structured',true),
  ('c4240000-0000-0000-0000-000000000002','a4240000-0000-0000-0000-000000000001','https://fixture.test/legacy','The Glass Atlas','2023-01-01',null,'structured',true);
select is(public.publish_crawl_findings('c4240000-0000-0000-0000-000000000001'),1,'legacy publisher signature still works');
select id as legacy_run from public.runs where start_date = '2023-01-01' \gset
select public.publish_crawl_findings('c4240000-0000-0000-0000-000000000002');
select ok((select end_date = '2023-01-31' from public.runs where id = :'legacy_run'),
  'same legacy ID retains its explicit end date');
select is((select autofill_reason from public.catalogue_effective_runs where id = :'legacy_run'),
  'legacy_unknown','legacy evidence never inherits autofill eligibility');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4240000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select * from public.admin_diary_crawl_evidence_score('{}')$$, '42501','Not allowed',
  'non-admin cannot score diaries');
set local request.jwt.claims = '{"sub":"d4240000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select results_eq($$select outcome from public.admin_diary_crawl_evidence_score(array['a4240000-0000-0000-0000-000000000001'::uuid]) order by on_date$$,
  $$select unnest(array['exact','missing','partial'])$$, 'owner-only scoring distinguishes exact, missing and partial');
reset role;
select is((select count(*) from public.entries where venue_id = 'a4240000-0000-0000-0000-000000000001'),
  4::bigint, 'withdrawal and supersession leave entries intact');

select * from finish();
rollback;
