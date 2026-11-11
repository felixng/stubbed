begin;
select no_plan();

insert into auth.users (id,email) values ('d4260000-0000-0000-0000-000000000001','results@example.com');
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select public.start_crawl_generation('london_theatre','directory','directory','https://www.londontheatre.co.uk/venues')
  as generation \gset
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,last_success_at)
select s.id, :'generation', 'https://www.londontheatre.co.uk/venues/result-theatre', 'venue', 'succeeded', now()
from public.crawl_sources s where s.source_key = 'london_theatre';
select id as venue_task from public.crawl_tasks where canonical_url like '%result-theatre' \gset
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,last_success_at)
select s.id, :'generation', 'https://www.londontheatre.co.uk/show/1-' || n, 'event', case when n = 1 then 'succeeded' else 'failed' end, now()
from public.crawl_sources s cross join generate_series(1,3) n where s.source_key = 'london_theatre';
insert into public.crawl_task_edges(generation_id,parent_id,child_id)
select :'generation', :'venue_task', id from public.crawl_tasks where stage = 'event' and generation_id = :'generation';
insert into public.crawl_extractions(task_id,parser_version,content_hash,observations)
values (:'venue_task','fixture',repeat('a',64),'[{"observation_kind":"venue","name":"Result Theatre","street":"1 High St","city":"London","postcode":"W1 1AA","country":"GB","lat":51.5,"lng":-0.1,"geocode":{"provider":"geocoded:postcodes.io"}},{"observation_kind":"event_link","label":"A Show"}]');
select id as event_task from public.crawl_tasks where canonical_url like '%/show/1-1' \gset
insert into public.crawl_extractions(task_id,parser_version,content_hash,observations)
values (:'event_task','fixture',repeat('b',64),'[{"observation_kind":"event","raw_title":"A Show","show_type":"musical","event_kind":"show","venue":{"name":"Result Theatre"},"dates":[{"date":"2026-01-02","kind":"start","evidence":{"text":"x"}},{"date":"2027-01-02","kind":"end","evidence":{"text":"y"}}]}]');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4260000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(format($$select public.admin_crawl_task_results(array['%s']::uuid[])$$, :'venue_task'),'42501','Not allowed','member cannot read page results');
set local request.jwt.claims = '{"sub":"d4260000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.admin_crawl_task_results(array[:'venue_task']::uuid[])->(:'venue_task')#>>'{name}','Result Theatre','venue page result names the venue');
select is((public.admin_crawl_task_results(array[:'venue_task']::uuid[])->(:'venue_task'))->'located','true'::jsonb,'venue page reports it was located');
select is((public.admin_crawl_task_results(array[:'venue_task']::uuid[])->(:'venue_task'))->>'shows_total','3','venue page counts its show pages');
select is((public.admin_crawl_task_results(array[:'venue_task']::uuid[])->(:'venue_task'))->>'shows_read','1','venue page counts show pages read');
select is((public.admin_crawl_task_results(array[:'venue_task']::uuid[])->(:'venue_task'))->>'shows_stuck','2','venue page counts show pages that failed');
select is(public.admin_crawl_task_results(array[:'event_task']::uuid[])->(:'event_task')#>>'{dates,1,kind}','end','event page result keeps date kinds');
select is(public.admin_crawl_task_results(array[:'event_task']::uuid[])->(:'event_task')#>>'{dates,0,evidence}',null,'event page result leaves evidence out');
select is(public.admin_crawl_task_results('{}'::uuid[]),'{}'::jsonb,'no pages gives an empty result');
select * from finish();
rollback;
