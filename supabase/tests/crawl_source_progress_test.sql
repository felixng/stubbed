begin;
select no_plan();

insert into auth.users (id,email) values ('d4250000-0000-0000-0000-000000000001','progress@example.com');
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select public.start_crawl_generation('london_theatre','directory','directory','https://www.londontheatre.co.uk/venues')
  as generation \gset
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage)
select s.id, :'generation', 'https://www.londontheatre.co.uk/venues/theatre-' || lpad(n::text,4,'0'), 'venue'
from public.crawl_sources s cross join generate_series(1,1000) n where s.source_key = 'london_theatre';

update public.crawl_tasks set status = 'succeeded', last_success_at = now(), attempts = 1
where generation_id = :'generation' and canonical_url ~ 'theatre-000[1-3]$';
update public.crawl_tasks set status = 'blocked', last_error = 'Fixture policy block'
where generation_id = :'generation' and canonical_url ~ 'theatre-000[45]$';
select public.claim_crawl_task('london_theatre','venue','directory','fixture') as claim \gset
select public.enqueue_crawl_task(:'generation','event','https://www.londontheatre.co.uk/show/425-fixture') as event_task \gset
update public.crawl_tasks set status = 'failed' where id = :'event_task';
insert into public.crawl_task_edges (generation_id,parent_id,child_id)
select :'generation', id, :'event_task' from public.crawl_tasks
where generation_id = :'generation' and canonical_url like '%theatre-0001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4250000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.crawl_source_progress()$$,'42501','Not allowed','member cannot read source progress');
select throws_ok($$select public.admin_crawl_source_action('london_theatre','pause')$$,'42501','Not allowed',
  'member cannot pause a source');
set local request.jwt.claims = '{"sub":"d4250000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.crawl_source_progress()#>'{stages,venue}',
  '{"discovered":1000,"processed":3,"pending":994,"leased":1,"succeeded":3,"retry_wait":0,"blocked":2,"failed":0}'::jsonb,
  'unique discovered pages and task statuses have honest denominators');
select is(public.crawl_source_progress()->>'enriched_venue_pages','2','failed child leaves a processed venue unenriched');
select is(public.crawl_source_progress()#>>'{scan,enumeration_status}','enumerating','discovery is still running');
select is(public.crawl_source_progress('london_theatre',null,'venue',null,25,100)#>>'{rows,0,canonical_url}',
  'https://www.londontheatre.co.uk/venues/theatre-0101','server paginates beyond 100 rows');
select is(jsonb_array_length(public.crawl_source_progress('london_theatre',null,'venue','blocked')->'rows'),
  2,'stage status filter limits rows without changing scan counts');
select is(public.admin_crawl_source_action('london_theatre','pause'),1,'admin pauses new claims');

reset role;
set local role service_role;
select is(public.claim_crawl_task('london_theatre','venue','directory','second'),null::jsonb,'paused source does not claim more tasks');
select ok(public.renew_crawl_task((:'claim'::jsonb->>'id')::uuid,(:'claim'::jsonb->>'lease_token')::uuid),
  'operator pause still allows bounded in-flight work');
select public.reserve_crawl_request((:'claim'::jsonb->>'id')::uuid,(:'claim'::jsonb->>'lease_token')::uuid,
  'www.londontheatre.co.uk',5000) as request_slot \gset
select ok((:'request_slot'::jsonb->>'token') is not null,'an existing lease can finish its request');
select public.release_crawl_request('www.londontheatre.co.uk',(:'request_slot'::jsonb->>'token')::uuid,null);
select ok(public.acknowledge_crawl_task((:'claim'::jsonb->>'id')::uuid,(:'claim'::jsonb->>'lease_token')::uuid,
  'fixture',repeat('a',64),'[]','[]'),'operator pause preserves atomic acknowledgements');
select is(public.crawl_source_progress()->>'http_requests','1','HTTP requests count independently');
select is(public.crawl_source_progress()#>>'{stages,venue,processed}','4','in-flight success increments processed once');

reset role;
set local role authenticated;
select is(public.admin_crawl_source_action('london_theatre','resume'),1,'resume clears operator pause');
select is(public.admin_crawl_source_action('london_theatre','retry_failed',:'generation',:'event_task'),
  1,'failed child can retry in the same scan');
select is(public.admin_crawl_source_action('london_theatre','retry_blocked',:'generation'),
  2,'blocked tasks require a distinct retry action');
select is(public.admin_crawl_source_action('london_theatre','reparse',:'generation',(:'claim'::jsonb->>'id')::uuid),
  1,'one selected page can be reparsed');
select is(public.crawl_source_progress()#>>'{stages,venue,processed}','4',
  'reparse does not inflate or discard unique processed count');
select is(public.crawl_source_progress()#>>'{scan,id}',:'generation','retries do not create a new scan');
select is(public.admin_crawl_source_action('london_theatre','rediscover',:'generation'),1,'rediscovery creates a scan');
select isnt(public.crawl_source_progress()#>>'{scan,id}',:'generation','rediscovery changes the current generation');
select is(public.crawl_source_progress('london_theatre',:'generation')#>>'{stages,venue,discovered}',
  '1000','prior scan can still be inspected');
select is((select count(*) from public.crawl_admin_actions where actor_id = 'd4250000-0000-0000-0000-000000000001'),
  6::bigint,'every mutation is audited');

reset role;
select * from finish();
rollback;
