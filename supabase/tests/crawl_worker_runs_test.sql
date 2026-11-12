begin;
select no_plan();

insert into auth.users (id,email) values
  ('d4280000-0000-0000-0000-000000000001','schedule-member@example.com'),
  ('d4280000-0000-0000-0000-000000000002','schedule-admin@example.com');
update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
select public.start_crawl_generation('london_theatre','directory','directory','https://www.londontheatre.co.uk/venues') as generation \gset
-- Baseline before the fixture, so the test also holds on a database that already has crawl work.

select set_config('request.jwt.claims','{"sub":"d4280000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
select coalesce((public.admin_crawl_schedule()#>>'{forecast,london_theatre,new}')::int,0) as base_new,
  coalesce((public.admin_crawl_schedule()#>>'{forecast,london_theatre,retry}')::int,0) as base_retry,
  coalesce((public.admin_crawl_schedule()#>>'{forecast,london_theatre,reread}')::int,0) as base_reread,
  (public.admin_crawl_schedule()->>'total')::int as base_total \gset
reset role;

insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,available_at,consecutive_failures,last_success_at,refresh_at,parser_version)
select s.id,:'generation','https://www.londontheatre.co.uk/show/sched-'||n,'event',
  case when n<=3 then 'pending' when n<=5 then 'retry_wait' when n=6 then 'retry_wait' else 'succeeded' end,
  case when n=6 then now()+interval '1 hour' else now()-interval '1 minute' end,
  case when n in (4,5) then 1 else 0 end,
  case when n>=7 then now()-interval '40 days' end,
  case when n=7 then now()-interval '1 day' when n=8 then now()+interval '5 days' end,
  case when n>=7 then s.adapter_version end
from public.crawl_sources s cross join generate_series(1,8) n where s.source_key='london_theatre';

insert into public.crawl_worker_runs(started_at,finished_at,trigger,per_source,stop_reason,model_spend_usd,limits) values
  (now()-interval '2 hours',now()-interval '110 minutes','schedule','{"london_theatre":{"pages":40}}','page_allowance',0.25,'{"daily_spend_usd":2,"source_daily_pages":1000}'),
  (now()-interval '90 minutes',now()-interval '80 minutes','manual','{"playbill":{"pages":10}}','nothing_due',0,'{}'),
  (now()-interval '30 hours',now()-interval '29 hours','schedule','{"london_theatre":{"pages":99}}','page_allowance',1,'{}'),
  (now()-interval '3 hours',null,'admin_start','{}',null,0,'{}'),
  (now()-interval '5 minutes',null,'schedule','{}',null,0,'{}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4280000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*) from public.crawl_worker_runs),0::bigint,'a member sees no worker runs');
select throws_ok($$select public.admin_crawl_schedule()$$,'42501','Not allowed','a member cannot read the schedule');
select throws_ok($$insert into public.crawl_worker_runs(trigger) values ('schedule')$$,'42501',null,'a member cannot write worker runs');
set local request.jwt.claims = '{"sub":"d4280000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}';
select cmp_ok((select count(*) from public.crawl_worker_runs),'>=',5::bigint,'an admin reads worker runs');
select throws_ok($$insert into public.crawl_worker_runs(trigger) values ('schedule')$$,'42501',null,'an admin cannot write them directly either');

select is((public.admin_crawl_schedule()#>>'{running,trigger}'),'schedule','the open run from five minutes ago is running now');
select is((select count(*) from jsonb_array_elements(public.admin_crawl_schedule()->'runs') r where (r->>'interrupted')::boolean),1::bigint,'a run open for 3 hours reads as interrupted');
select is(public.admin_crawl_schedule()#>>'{last_run,trigger}','manual','the last finished run is the most recent closed one');
select is((select count(*) from jsonb_array_elements(public.admin_crawl_schedule()->'window')),4::bigint,'the 24 hour window holds the runs from the last day and leaves out older ones');
select is((public.admin_crawl_schedule()#>>'{limits,daily_spend_usd}'),null,'limits come from the latest run');
select is((select count(*) from jsonb_array_elements(public.admin_crawl_schedule(25,0,'manual')->'runs')),1::bigint,'the trigger filter limits the runs');
select is((public.admin_crawl_schedule(25,0,'admin_start')->>'total')::int,1,'the total follows the trigger filter');
select is((select count(*) from jsonb_array_elements(public.admin_crawl_schedule(2,0)->'runs')),2::bigint,'runs are paged');

select is((public.admin_crawl_schedule()#>>'{forecast,london_theatre,new}')::int - :'base_new'::int,3,'forecast counts new pages due now');
select is((public.admin_crawl_schedule()#>>'{forecast,london_theatre,retry}')::int - :'base_retry'::int,2,'forecast counts failed pages whose retry is due, not ones waiting');
select is((public.admin_crawl_schedule()#>>'{forecast,london_theatre,reread}')::int - :'base_reread'::int,1,'forecast counts pages whose re-read date has passed, not future ones');
select ok(public.admin_crawl_schedule()#>'{forecast}' ? 'playbill','forecast covers each source');
select is(public.admin_crawl_schedule()#>'{forecast}' ? 'official',false,'forecast leaves out the official-sites crawler');

-- The pages list carries what each page needs to say who acts next.
select ok(public.crawl_source_progress('london_theatre',null,'event',null,25,0)#>'{rows,0}' ? 'consecutive_failures','page rows carry consecutive_failures');
select ok(public.crawl_source_progress('london_theatre',null,'event',null,25,0)#>'{rows,0}' ? 'refresh_at','page rows carry refresh_at');
select * from finish();
rollback;
