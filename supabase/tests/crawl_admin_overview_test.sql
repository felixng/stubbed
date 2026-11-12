begin;
select no_plan();

insert into auth.users (id,email) values ('d4270000-0000-0000-0000-000000000001','overview@example.com');
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select public.start_crawl_generation('london_theatre','directory','directory','https://www.londontheatre.co.uk/venues') as generation \gset
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,last_error,last_attempt_at)
select s.id, :'generation', 'https://www.londontheatre.co.uk/show/ov-' || n, 'event',
  case when n <= 2 then 'failed' when n = 3 then 'blocked' when n = 4 then 'retry_wait' when n = 5 then 'succeeded' else 'pending' end,
  case when n <= 4 then 'Fixture error ' || n end, now() - (n || ' minutes')::interval
from public.crawl_sources s cross join generate_series(1,6) n where s.source_key = 'london_theatre';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4270000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_crawl_overview()$$,'42501','Not allowed','member cannot read the overview');
set local request.jwt.claims = '{"sub":"d4270000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(jsonb_array_length(public.admin_crawl_overview('london_theatre')#>'{sources,london_theatre,attention}'),3,
  'attention groups failed, blocked and retrying pages by step and status');
select is((select (a->>'n')::int from jsonb_array_elements(public.admin_crawl_overview('london_theatre')#>'{sources,london_theatre,attention}') a where a->>'status' = 'failed'),2,
  'attention counts failed pages');
select is((select a->>'reason' from jsonb_array_elements(public.admin_crawl_overview('london_theatre')#>'{sources,london_theatre,attention}') a where a->>'status' = 'failed'),'Fixture error 1',
  'attention reason is the latest error');
select is(public.admin_crawl_overview('london_theatre')#>'{sources}' ? 'playbill',false,'one source asked for, one source returned');
select ok(public.admin_crawl_overview()#>'{sources}' ? 'playbill','no source asked for returns every source');
select is(public.admin_crawl_overview()#>>'{run_dates,from_sources}','0','no crawler run dates published');
select is(public.admin_crawl_source_action('london_theatre','pause'),1,'admin pauses new claims');
select is(public.admin_crawl_overview('london_theatre')#>>'{recent_actions,0,operation}','pause','recent actions list the change');
select is((select count(*) from jsonb_array_elements(public.admin_crawl_overview('london_theatre')->'recent_actions') a where a->>'source' <> 'london_theatre'),0::bigint,'recent actions are limited to the source');

-- Summary buckets filter the pages list; the raw statuses still work.
select is(jsonb_array_length(public.crawl_source_progress('london_theatre',null,'event','stuck')->'rows'),3,'stuck bucket is failed plus blocked');
select is(jsonb_array_length(public.crawl_source_progress('london_theatre',null,'event','retrying')->'rows'),1,'retrying bucket is retry wait');
select is(jsonb_array_length(public.crawl_source_progress('london_theatre',null,'event','todo')->'rows'),1,'to do bucket is queued and in flight');
select is(jsonb_array_length(public.crawl_source_progress('london_theatre',null,'event','done')->'rows'),1,'done bucket is succeeded');
select is(jsonb_array_length(public.crawl_source_progress('london_theatre',null,'event','failed')->'rows'),2,'raw status filter still works');
select * from finish();
rollback;
