begin;select no_plan();
insert into auth.users(id,email)values('dddddddd-6666-0000-0000-000000000000','manual-discovery@example.com');
insert into public.venues(id,name,whats_on_url)values
('a0000000-6666-0000-0000-000000000001','No links at all',null),
('a0000000-6666-0000-0000-000000000002','Linked theatre','https://lease.test/current');
create function pg_temp.settings()returns jsonb language sql as $$select '{"venue_ids":["a0000000-6666-0000-0000-000000000001"],"method":"rules","model":"claude-haiku-5-5","budget_usd":1,"branch":"main","kind":"whats_on"}'::jsonb;$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dddddddd-6666-0000-0000-000000000000","role":"authenticated"}',true);
select throws_ok($$select public.admin_create_crawl_run(pg_temp.settings())$$,'42501','Not allowed','non-admin cannot queue discovery');
select throws_ok($$select public.claim_crawl_site(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())$$,'42501',null,'clients cannot claim sites');
select throws_ok($$select public.release_crawl_site(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'clients cannot release sites');
select set_config('request.jwt.claims','{"sub":"dddddddd-6666-0000-0000-000000000000","role":"authenticated","app_metadata":{"role":"admin"}}',true);
select lives_ok($$select public.admin_create_crawl_run(pg_temp.settings())$$,'admin selects theatre without any website or link');
select is((select pipeline from public.crawl_runs where created_by=auth.uid()),'discover','new manual runs default to discovery');
select throws_ok($$select public.admin_create_crawl_run(pg_temp.settings()||'{"pipeline":"legacy"}')$$,'P0001','Choose 1–10 different theatres with links','legacy comparison still requires links');
select throws_ok($$select public.admin_create_crawl_run(pg_temp.settings()||'{"pipeline":"unknown"}')$$,'P0001','Invalid pipeline','unknown pipeline rejected');
reset role;
create temp table lease_test as select crawl_site_id site,(select id from public.crawl_runs where created_by='dddddddd-6666-0000-0000-000000000000' limit 1) run from public.venues where id='a0000000-6666-0000-0000-000000000002';
select ok(public.claim_crawl_site(site,run,'b0000000-6666-0000-0000-000000000001'),'first worker claims')from lease_test;
select ok(not public.claim_crawl_site(site,run,'b0000000-6666-0000-0000-000000000002'),'second worker cannot claim same site, even in same run')from lease_test;
select public.release_crawl_site(site,'b0000000-6666-0000-0000-000000000002')from lease_test;
select is((select count(*)from public.crawl_site_leases),1::bigint,'wrong owner cannot release claim');
update public.crawl_site_leases set expires_at=now()-interval '1 second';
select ok(public.claim_crawl_site(site,run,'b0000000-6666-0000-0000-000000000002'),'expired crashed-worker claim is recoverable')from lease_test;
select public.release_crawl_site(site,'b0000000-6666-0000-0000-000000000002')from lease_test;
select is((select count(*)from public.crawl_site_leases),0::bigint,'owner releases claim');
select *from finish();rollback;
