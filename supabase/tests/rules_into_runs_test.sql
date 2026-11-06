begin;
select no_plan();
create function pg_temp.admin(on_off boolean) returns void language sql as $$
select set_config('role','authenticated',true),set_config('request.jwt.claims',jsonb_build_object('sub','dddddddd-2222-0000-0000-000000000000','role','authenticated','app_metadata',case when on_off then '{"role":"admin"}'::jsonb else '{}'::jsonb end)::text,true);
$$;
insert into auth.users(id,email) values('dddddddd-2222-0000-0000-000000000000','rules-admin@example.com'),('dddddddd-2222-0000-0000-000000000001','other@example.com');
insert into public.venues(id,name,whats_on_url) values
('a0000000-2222-0000-0000-000000000001','Rules Venue','https://rules.test/current'),
('a0000000-2222-0000-0000-000000000002','Merge Venue','https://rules.test/current');
select is((select count(distinct crawl_site_id) from public.venues where name in ('Rules Venue','Merge Venue')),1::bigint,'shared URL attaches one site');
insert into public.crawl_rules(id,site_id,rules,author,status) select 'b0000000-2222-0000-0000-000000000001',crawl_site_id,'{}','test','active' from public.venues where id='a0000000-2222-0000-0000-000000000001';
insert into public.shows(id,title,type) values
('e0000000-2222-0000-0000-000000000001','Rules Alpha','play'),
('e0000000-2222-0000-0000-000000000002','Rules Beta','play'),
('e0000000-2222-0000-0000-000000000003','Rules Missed','play');
insert into public.crawl_runs(id) values('c0000000-2222-0000-0000-000000000001');
insert into public.crawl_findings(run_id,venue_id,source_url,raw_title,start_date,end_date,kind,method,page_checked,rule_id,review) values
('c0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','https://rules.test','Rules Alpha','2024-01-01','2024-02-01','show','rules',true,'b0000000-2222-0000-0000-000000000001',null),
('c0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','https://rules.test','Unknown Title','2024-01-01',null,'show','structured',true,null,null),
('c0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','https://rules.test','Rules Beta','2024-01-01','2024-01-02','show','model',true,null,'right'),
('c0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','https://rules.test','Unchecked','2024-01-01',null,'show','structured',false,null,null),
('c0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','https://rules.test','Talk','2024-01-01',null,'talk','structured',true,null,null),
('c0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','https://rules.test','No dates',null,null,'show','structured',true,null,null);
select pg_temp.admin(false);
select throws_ok($$select public.publish_crawl_findings('c0000000-2222-0000-0000-000000000001')$$,'42501','Not allowed','non-admin cannot publish');
select throws_ok($$select * from public.admin_diary_crawl_score('{}')$$,'42501','Not allowed','non-admin cannot score diary');
select throws_ok($$select public.admin_redo_archive(gen_random_uuid())$$,'42501','Not allowed','non-admin cannot redo');
select is((select count(*) from public.crawl_rules),0::bigint,'rules hidden from non-admin');
select throws_ok($$insert into public.runs(venue_id,title,start_date,source,source_url,confidence) values(gen_random_uuid(),'X',current_date,'x','x',1)$$,'42501',null,'clients cannot write runs');
select pg_temp.admin(true);
select is(public.publish_crawl_findings('c0000000-2222-0000-0000-000000000001'),2,'only active rules and structured checked shows publish automatically');
select is((select count(*) from public.runs),2::bigint,'only two runs');
select is((select show_id from public.runs where title='Rules Alpha'),'e0000000-2222-0000-0000-000000000001'::uuid,'same-match links existing show');
select is((select show_id from public.runs where title='Unknown Title'),null,'unmatched title has no show');
select is(public.publish_crawl_findings('c0000000-2222-0000-0000-000000000001'),2,'second publish upserts');
select is((select count(*) from public.runs),2::bigint,'no duplicate runs');
select is(public.publish_crawl_findings('c0000000-2222-0000-0000-000000000001',true),3,'manual publish includes reviewed model finding');
reset role;
update public.crawl_rules set status='retired' where id='b0000000-2222-0000-0000-000000000001';
delete from public.runs where title='Rules Alpha';
select pg_temp.admin(true);
select is(public.publish_crawl_findings('c0000000-2222-0000-0000-000000000001'),1,'retired rules cannot publish');
reset role;
update public.crawl_rules set status='active' where id='b0000000-2222-0000-0000-000000000001';
select public.publish_crawl_findings('c0000000-2222-0000-0000-000000000001');
insert into public.entries(user_id,show_id,venue_id,date,status,visibility) values
('dddddddd-2222-0000-0000-000000000000','e0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000001','2024-01-10','logged','private'),
('dddddddd-2222-0000-0000-000000000000','e0000000-2222-0000-0000-000000000002','a0000000-2222-0000-0000-000000000001','2024-03-10','logged','private'),
('dddddddd-2222-0000-0000-000000000000','e0000000-2222-0000-0000-000000000003','a0000000-2222-0000-0000-000000000001','2024-03-10','logged','private'),
('dddddddd-2222-0000-0000-000000000001','e0000000-2222-0000-0000-000000000003','a0000000-2222-0000-0000-000000000001','2024-03-10','logged','public');
select pg_temp.admin(true);
select results_eq($$select outcome from public.admin_diary_crawl_score(array['a0000000-2222-0000-0000-000000000001'::uuid]) order by outcome$$,$$select unnest(array['matching_dates','missed','wrong_dates'])$$,'three diary outcomes, no other user entries');
reset role;
select lives_ok($$select public.merge_shows('e0000000-2222-0000-0000-000000000001','e0000000-2222-0000-0000-000000000002')$$,'merge shows carries runs');
select is((select show_id from public.runs where title='Rules Alpha'),'e0000000-2222-0000-0000-000000000002'::uuid,'run show moved');
select lives_ok($$select public.merge_venues('a0000000-2222-0000-0000-000000000001','a0000000-2222-0000-0000-000000000002')$$,'merge venues carries runs');
select is((select count(*) from public.runs where venue_id='a0000000-2222-0000-0000-000000000002'),3::bigint,'runs at surviving venue');
set local role anon;
select is((select count(*) from public.runs),3::bigint,'runs readable anonymously');
reset role;
delete from public.runs;
select is((select count(*) from public.entries where user_id='dddddddd-2222-0000-0000-000000000000'),3::bigint,'deleting runs never affects entries');
select * from finish();rollback;
