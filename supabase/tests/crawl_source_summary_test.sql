begin;
select no_plan();

insert into auth.users (id,email) values
  ('d42a0000-0000-0000-0000-000000000001','summary-member@example.com'),
  ('d42a0000-0000-0000-0000-000000000002','summary-admin@example.com');
update public.crawl_sources set collection_enabled = true where source_key = 'playbill';

-- Baseline first, so the test also holds on a database that already has crawl work.
select set_config('request.jwt.claims','{"sub":"d42a0000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
select (public.crawl_source_summary('playbill')#>>'{playbill,totals,known}')::int as b_known,
  (public.crawl_source_summary('playbill')#>>'{playbill,totals,read}')::int as b_read,
  (public.crawl_source_summary('playbill')#>>'{playbill,totals,waiting}')::int as b_waiting,
  (public.crawl_source_summary('playbill')#>>'{playbill,totals,due}')::int as b_due,
  (public.crawl_source_summary('playbill')#>>'{playbill,totals,stuck}')::int as b_stuck,
  (public.crawl_source_summary('playbill')#>>'{playbill,totals,read_3h}')::int as b_read3h,
  jsonb_array_length(public.crawl_source_summary('playbill')#>'{playbill,areas}') as b_areas,
  (public.crawl_source_progress('playbill',null,'event',null,25,0,true)#>>'{stages,event,discovered}')::int as b_event_all \gset
reset role;

-- Four current areas for one source, like Playbill today: a big one, a finished one and two single theatres.
select public.start_crawl_generation('playbill','fx-broadway','directory','https://playbill.com/fx-broadway') as g1 \gset
select public.start_crawl_generation('playbill','fx-london','directory','https://playbill.com/fx-london') as g2 \gset
select public.start_crawl_generation('playbill','fx-circle','directory','https://playbill.com/fx-circle') as g3 \gset
select public.start_crawl_generation('playbill','fx-stratford','directory','https://playbill.com/fx-stratford') as g4 \gset

insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,available_at,last_success_at)
select s.id, :'g1', 'https://playbill.com/production/fx1-' || n, 'event',
  case when n <= 3 then 'succeeded' when n <= 5 then 'pending' else 'failed' end,
  now() - interval '1 minute',
  case when n = 1 or n = 2 then now() - interval '1 hour' when n = 3 then now() - interval '5 hours' end
from public.crawl_sources s cross join generate_series(1,6) n where s.source_key = 'playbill';
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,available_at,last_success_at)
select s.id, :'g2', 'https://playbill.com/production/fx2-' || n, 'event','succeeded', now() - interval '1 minute', now() - interval '5 hours'
from public.crawl_sources s cross join generate_series(1,4) n where s.source_key = 'playbill';
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,available_at,last_success_at)
select s.id, :'g3', 'https://playbill.com/production/fx3-1', 'event','succeeded', now() - interval '1 minute', now()
from public.crawl_sources s where s.source_key = 'playbill';
insert into public.crawl_tasks(source_id,generation_id,canonical_url,stage,status,available_at)
select s.id, :'g4', 'https://playbill.com/production/fx4-1', 'event','pending', now() + interval '1 day'
from public.crawl_sources s where s.source_key = 'playbill';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d42a0000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.crawl_source_summary()$$,'42501','Not allowed','a member cannot read the source summary');
set local request.jwt.claims = '{"sub":"d42a0000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}';

-- Each area's own numbers (the seed directory page of each area is one more known, waiting page).
select is((select (a->>'known')::int from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a where a->>'scope_key' = 'fx-broadway'),7,'the big area counts all its pages');
select is((select (a->>'read')::int from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a where a->>'scope_key' = 'fx-broadway'),3,'the big area counts the pages read');
select is((select (a->>'stuck')::int from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a where a->>'scope_key' = 'fx-broadway'),1,'the big area counts stuck pages');
select is((select (a->>'read_3h')::int from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a where a->>'scope_key' = 'fx-broadway'),2,'only pages read in the last 3 hours count as recent');
select is((select (a->'stages'->'event'->>'known')::int from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a where a->>'scope_key' = 'fx-broadway'),6,'an area keeps its pages per step');
select is((select (a->>'due')::int from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a where a->>'scope_key' = 'fx-stratford'),1,'a page not yet due does not count as due');
select is((select array_agg((a->>'known')::int order by ord) from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') with ordinality t(a, ord) where a->>'scope_key' like 'fx-%'),array[7,5,2,2],'areas are listed largest first');

-- Nothing is dropped: the source totals are the sum of all four areas, not just the newest.
select is((public.crawl_source_summary('playbill')#>>'{playbill,totals,known}')::int - :'b_known',16,'source total known is the sum of every area');
select is((public.crawl_source_summary('playbill')#>>'{playbill,totals,read}')::int - :'b_read',8,'source total read is the sum of every area');
select is((public.crawl_source_summary('playbill')#>>'{playbill,totals,waiting}')::int - :'b_waiting',7,'source total waiting is the sum of every area');
select is((public.crawl_source_summary('playbill')#>>'{playbill,totals,due}')::int - :'b_due',6,'source total due is the sum of every area');
select is((public.crawl_source_summary('playbill')#>>'{playbill,totals,stuck}')::int - :'b_stuck',1,'source total stuck is the sum of every area');
select is((public.crawl_source_summary('playbill')#>>'{playbill,totals,read_3h}')::int - :'b_read3h',3,'pages read in the last 3 hours are summed across areas');
select is(jsonb_array_length(public.crawl_source_summary('playbill')#>'{playbill,areas}') - :'b_areas',4,'all four areas are listed');
select is((select sum((a->>'known')::int) from jsonb_array_elements(public.crawl_source_summary('playbill')#>'{playbill,areas}') a),(public.crawl_source_summary('playbill')#>>'{playbill,totals,known}')::bigint,'the areas add up to the source total');
select is((select sum((s.value->>'known')::int) from jsonb_each(public.crawl_source_summary('playbill')#>'{playbill,stages}') s),(public.crawl_source_summary('playbill')#>>'{playbill,totals,known}')::bigint,'the steps add up to the source total');
select is(public.crawl_source_summary('london_theatre')#>>'{london_theatre,totals,known}' is null,false,'a source with no pages still has numeric totals');
select ok(not (public.crawl_source_summary() ? 'official'),'the official-sites crawler has no areas and is not summarised here');
select ok((public.crawl_source_summary())->'london_theatre' is not null and (public.crawl_source_summary())->'playbill' is not null,'with no source named, both venue-first sources are returned');

-- The pages list can cover every area, or just one.
select is((public.crawl_source_progress('playbill',null,'event',null,25,0,true)#>>'{stages,event,discovered}')::int - :'b_event_all',12,'all areas: the pages list counts every area');
select is((public.crawl_source_progress('playbill',:'g1','event',null,25,0,false)#>>'{stages,event,discovered}')::int,6,'one area: only that area');
select is((public.crawl_source_progress('playbill',:'g1','event',null,25,0)#>>'{stages,event,discovered}')::int,6,'a call without the new argument is unchanged');
select is((public.crawl_source_progress('playbill',null,'event','stuck',25,0,true)->>'filtered_total')::int >= 1,true,'status buckets still work across areas');
select * from finish();
rollback;
