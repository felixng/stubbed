begin;
select no_plan();

insert into auth.users (id, email) values
  ('d5400000-0000-0000-0000-000000000001', 'registry-member@example.com'),
  ('d5400000-0000-0000-0000-000000000002', 'registry-admin@example.com');
insert into public.venues (id, name, city) values ('a5400000-0000-0000-0000-000000000001', 'Registry Theatre', 'London');
insert into public.shows (id, title) values ('b5400000-0000-0000-0000-000000000001', 'Registry Show');

-- The three existing rows carry the registry facts.
select is((select display_name || ':' || kind || ':' || authority from public.crawl_sources where source_key = 'london_theatre'), 'London Theatre:aggregate:2', 'London Theatre registry facts');
select is((select display_name || ':' || kind || ':' || authority from public.crawl_sources where source_key = 'playbill'), 'Playbill:aggregate:2', 'Playbill registry facts');
select is((select display_name || ':' || kind || ':' || authority from public.crawl_sources where source_key = 'official'), 'Official theatre sites:official:3', 'official registry facts');

-- authenticated cannot sync; service_role can.
select ok(not has_function_privilege('authenticated', 'public.sync_crawl_source(text,text,text,text[],integer,integer,text)', 'execute'), 'members cannot sync sources');
select ok(has_function_privilege('service_role', 'public.sync_crawl_source(text,text,text,text[],integer,integer,text)', 'execute'), 'the worker can sync sources');

set local role service_role;
select lives_ok($$select public.sync_crawl_source('registry_low', 'Registry Low', 'aggregate', array['low.example'], 5000, 1, 'low-v1')$$, 'a new source is added');
reset role;
select is((select collection_enabled::text || ':' || publication_enabled::text from public.crawl_sources where source_key = 'registry_low'), 'false:false', 'a new source arrives switched off');

-- A second sync updates the facts and leaves switches and pauses alone.
update public.crawl_sources set collection_enabled = true, publication_enabled = true, paused_reason = 'blocked', operator_paused_at = now()
where source_key = 'registry_low';
set local role service_role;
select public.sync_crawl_source('registry_low', 'Registry Low Two', 'aggregate', array['low.example', 'www.low.example'], 6000, 1, 'low-v2');
reset role;
select is((select display_name || ':' || array_length(allowed_hosts, 1) || ':' || min_interval_ms || ':' || adapter_version from public.crawl_sources where source_key = 'registry_low'),
  'Registry Low Two:2:6000:low-v2', 'a second sync updates the static facts');
select is((select collection_enabled::text || publication_enabled::text || coalesce(paused_reason, '-') || (operator_paused_at is not null)::text from public.crawl_sources where source_key = 'registry_low'),
  'truetrueblockedtrue', 'a second sync leaves switches and pauses untouched');

-- Bad input is refused.
set local role service_role;
select throws_ok($$select public.sync_crawl_source('Bad Key', 'x', 'aggregate', '{}', 5000, 1, 'v1')$$, '22023', null, 'a bad key is refused');
select throws_ok($$select public.sync_crawl_source('registry_x', 'x', 'aggregate', '{}', 5000, 4, 'v1')$$, '22023', null, 'authority above 3 is refused');
select throws_ok($$select public.sync_crawl_source('registry_x', 'x', 'aggregate', '{}', 999, 1, 'v1')$$, '22023', null, 'an interval under a second is refused');
reset role;

-- Authority comes from the column: the higher authority wins the closing date.
create function pg_temp.fact(src text, k text, d date) returns void language sql as $$
  insert into public.crawl_run_evidence (source_id, source_event_key, segment_key, engagement_id, venue_id, show_id,
    raw_title, fact_key, kind, precision, on_date, evidence_field, source_url, parser_version, extraction_method,
    match_status, page_checked, observed_at, last_seen_at, value_hash)
  values ((select id from public.crawl_sources where source_key = src), 'ev-' || src, 'main', md5('registry')::uuid,
    'a5400000-0000-0000-0000-000000000001', 'b5400000-0000-0000-0000-000000000001', 'Registry Show',
    k || ':f:day', k, 'day', d, 'f', 'https://example.test/' || src, 'v1', 'fixture', 'show_resolved', true,
    now(), now(), md5(src || k || d::text));
$$;
select pg_temp.fact('registry_low', 'start', '2026-11-01');
select pg_temp.fact('registry_low', 'closing', '2026-12-01');
select pg_temp.fact('official', 'closing', '2026-12-31');
select is((select confirmed_end_date from public.catalogue_effective_runs where id = md5('registry')::uuid), '2026-12-31'::date,
  'the source with authority 3 wins over authority 1');

-- Alias sources: a registered key is kept, an unknown one becomes admin.
select public.record_venue_alias('a5400000-0000-0000-0000-000000000001', 'Registry Alias One', 'alternative', 'registry_low');
select public.record_venue_alias('a5400000-0000-0000-0000-000000000001', 'Registry Alias Two', 'alternative', 'nowhere');
select is((select source from public.venue_aliases where alias = 'Registry Alias One'), 'registry_low', 'a registered source key is kept on an alias');
select is((select source from public.venue_aliases where alias = 'Registry Alias Two'), 'admin', 'an unknown source becomes admin');

-- The admin list.
select set_config('request.jwt.claims', '{"sub":"d5400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.admin_crawl_sources()$$, '42501', null, 'a non-admin cannot list sources');
reset role;
select set_config('request.jwt.claims', '{"sub":"d5400000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select is((select jsonb_agg(s->>'source_key') from jsonb_array_elements(public.admin_crawl_sources()) s),
  '["london_theatre","playbill","registry_low","official"]'::jsonb, 'aggregate sources come first by name, official last');
reset role;

select * from finish();
rollback;
