begin;select no_plan();
create function pg_temp.admin(flag boolean) returns void language sql as $$select set_config('role','authenticated',true),set_config('request.jwt.claims',jsonb_build_object('sub','dddddddd-4444-0000-0000-000000000000','role','authenticated','app_metadata',case when flag then '{"role":"admin"}'::jsonb else '{}'::jsonb end)::text,true);$$;
insert into auth.users(id,email) values('dddddddd-4444-0000-0000-000000000000','loop@example.com');
insert into public.venues(id,name,website,whats_on_url,circuit) values
('a0000000-4444-0000-0000-000000000001','Logged First','https://first.test','https://first.test/current',null),
('a0000000-4444-0000-0000-000000000002','Broadway Next',null,null,'broadway'),
('a0000000-4444-0000-0000-000000000003','Other Last',null,null,null),
('a0000000-4444-0000-0000-000000000004','Shared Site','https://first.test','https://first.test/current',null);
insert into public.shows(id,title,type) values('e0000000-4444-0000-0000-000000000001','Loop Test','play');
insert into public.entries(user_id,show_id,venue_id,date,status) values('dddddddd-4444-0000-0000-000000000000','e0000000-4444-0000-0000-000000000001','a0000000-4444-0000-0000-000000000001','2024-01-01','logged');
select is(public.crawl_work(1)->0->>'id','a0000000-4444-0000-0000-000000000001','logged theatre first');
select is(public.crawl_work(3)->1->>'id','a0000000-4444-0000-0000-000000000002','major circuit second');
select is(jsonb_array_length(public.crawl_work(100)),3,'one item per shared site');
select is(jsonb_array_length(public.crawl_work(0)),0,'zero batch does no work');
update public.crawl_sites set archive_status='done',status='ready',last_crawled_at=now() where whats_on_url='https://first.test/current';
select is(jsonb_array_length(public.crawl_work(100)),2,'weekly check skips recent ready sites');
update public.crawl_sites set last_crawled_at=now()-interval '8 days' where whats_on_url='https://first.test/current';
select is(jsonb_array_length(public.crawl_work(100)),3,'weekly due site returns');
update public.crawl_sites set status='needs_attention' where whats_on_url='https://first.test/current';
select is(jsonb_array_length(public.crawl_work(100)),2,'attention sites wait for owner');
insert into public.crawl_rules(id,site_id,rules,author,status,validation) select 'b0000000-4444-0000-0000-000000000001',id,'{}','hand','active','{"ok":true}' from public.crawl_sites where whats_on_url='https://first.test/current';
select pg_temp.admin(false);
select throws_ok($$select public.crawl_work(25)$$,'42501',null,'user cannot get privileged work list');
select throws_ok($$select public.admin_crawl_progress()$$,'42501','Not allowed','progress is admin only');
select throws_ok($$select public.admin_crawl_rule_action('b0000000-4444-0000-0000-000000000001','retire')$$,'42501','Not allowed','rules admin only');
select throws_ok($$select public.admin_retry_crawl_site(gen_random_uuid())$$,'42501','Not allowed','retry admin only');
select throws_ok($$select * from public.admin_list_crawl_venues()$$,'42501','Admins only','unresolved venue list admin only');
select pg_temp.admin(true);
select ok((public.admin_crawl_progress()->>'needs_attention')::integer>=2,'progress counts affected theatres');
select is((select count(*) from public.admin_list_crawl_venues(only_attention=>true)),2::bigint,'attention filter includes shared venues');
select lives_ok($$select public.admin_crawl_rule_action('b0000000-4444-0000-0000-000000000001','retire')$$,'owner retires rules');
select is((select status from public.crawl_rules where id='b0000000-4444-0000-0000-000000000001'),'retired','retired');
select lives_ok($$select public.admin_crawl_rule_action('b0000000-4444-0000-0000-000000000001','restore')$$,'owner proposes restoration');
select is((select status from public.crawl_rules where id='b0000000-4444-0000-0000-000000000001'),'proposed','restore cannot bypass code validation');
select lives_ok($$select public.admin_update_venue('a0000000-4444-0000-0000-000000000003','https://manual.test','https://manual.test/list','')$$,'manual links save');
select is((select whats_on_source from public.venues where id='a0000000-4444-0000-0000-000000000003'),'manual','human link source recorded');
select is((select website_source from public.venues where id='a0000000-4444-0000-0000-000000000003'),'manual','human website source recorded');
select * from finish();rollback;
