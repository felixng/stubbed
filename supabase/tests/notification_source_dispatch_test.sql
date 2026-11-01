begin;
select plan(9);
create function pg_temp.as_user(uid uuid) returns void language sql as $$ select set_config('role','authenticated',true),set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true); $$;
insert into auth.users(id,email) values
 ('a4444444-0000-0000-0000-000000000001','source-a@example.com'),
 ('b4444444-0000-0000-0000-000000000001','source-b@example.com'),
 ('c4444444-0000-0000-0000-000000000001','source-c@example.com');
update public.profiles set handle='source_a' where id='a4444444-0000-0000-0000-000000000001';
update public.profiles set handle='source_b' where id='b4444444-0000-0000-0000-000000000001';
update public.profiles set handle='source_c' where id='c4444444-0000-0000-0000-000000000001';
insert into public.shows(id,title) values('54444444-0000-0000-0000-000000000001','Dispatch show');
insert into public.entries(id,user_id,show_id,date) values
 ('e4444444-0000-0000-0000-000000000001','b4444444-0000-0000-0000-000000000001','54444444-0000-0000-0000-000000000001','2026-01-01'),
 ('e4444444-0000-0000-0000-000000000002','b4444444-0000-0000-0000-000000000001','54444444-0000-0000-0000-000000000001','2026-01-02'),
 ('e4444444-0000-0000-0000-000000000003','b4444444-0000-0000-0000-000000000001','54444444-0000-0000-0000-000000000001','2026-01-03');
update public.notification_policy set like_push_delay=interval '0';
select pg_temp.as_user('b4444444-0000-0000-0000-000000000001');
select public.register_native_push('14444444-0000-0000-0000-000000000001','24444444-0000-0000-0000-000000000001',repeat('a',64),'sandbox');
reset role;
update public.push_destinations set created_at=now()-interval '1 minute';
insert into public.entry_likes(entry_id,user_id) values('e4444444-0000-0000-0000-000000000001','a4444444-0000-0000-0000-000000000001');
delete from public.entry_likes where entry_id='e4444444-0000-0000-0000-000000000001';
insert into public.entry_likes(entry_id,user_id) values('e4444444-0000-0000-0000-000000000001','a4444444-0000-0000-0000-000000000001');
select is((select count(*)::int from public.notification_outbox),1,'repeat generation gets no second push intent');
select is((select count(*)::int from public.claim_notification_jobs()),0,'a re-like cannot revive a removed source generation for push');
insert into public.entry_likes(entry_id,user_id) values('e4444444-0000-0000-0000-000000000002','a4444444-0000-0000-0000-000000000001');
insert into public.notification_category_preferences(user_id,category,push) values('b4444444-0000-0000-0000-000000000001','like',false);
insert into public.entry_likes(entry_id,user_id) values('e4444444-0000-0000-0000-000000000002','c4444444-0000-0000-0000-000000000001');
update public.notification_category_preferences set push=true;
create temp table source_leases as select * from public.claim_notification_jobs();
select is((select count(*)::int from source_leases),1,'inbox-only activity does not erase an earlier live push intent');
select is((select public.prepare_notification_job(job_id,lease_id)->'notification'->>'body' from source_leases),'@source_a liked your Dispatch show diary entry','push-disabled actor is excluded from the push preview and count');
delete from public.entry_likes where entry_id='e4444444-0000-0000-0000-000000000002' and user_id='a4444444-0000-0000-0000-000000000001';
select is((select public.prepare_notification_job(job_id,lease_id) from source_leases),null::jsonb,'push-disabled actor cannot supply eligibility after the queued actor unlikes');
select is((select status from public.notification_deliveries),'cancelled','withdrawn queued source is explicitly cancelled');
insert into public.entry_likes(entry_id,user_id) values('e4444444-0000-0000-0000-000000000003','a4444444-0000-0000-0000-000000000001');
create temp table first_batch as select * from public.claim_notification_jobs();
insert into public.entry_likes(entry_id,user_id) values('e4444444-0000-0000-0000-000000000003','c4444444-0000-0000-0000-000000000001');
create temp table newer_batch as select * from public.claim_notification_jobs();
select is((select outcome from public.notification_deliveries where id=(select job_id from first_batch)),'superseded','new eligible like supersedes an unsent batch');
delete from public.entry_likes where entry_id='e4444444-0000-0000-0000-000000000003' and user_id='c4444444-0000-0000-0000-000000000001';
create temp table resumed_batch as select * from public.claim_notification_jobs();
select is((select count(*)::int from resumed_batch),1,'withdrawing the newer like resumes the earlier live batch');
select is((select job_id from resumed_batch),(select job_id from first_batch),'resumption reuses the bounded original delivery record');
select * from finish();
rollback;
