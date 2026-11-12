begin;
select no_plan();

insert into auth.users (id,email) values
  ('d4290000-0000-0000-0000-000000000001','dispatch-member@example.com'),
  ('d4290000-0000-0000-0000-000000000002','dispatch-admin@example.com');

-- The schedule: a pg_cron job at the same minutes as the workflow, calling the dispatch function.
select is((select schedule from cron.job where jobname = 'catalogue-crawl-dispatch'),'17,47 * * * *','the dispatch job runs at :17 and :47');
select ok((select command from cron.job where jobname = 'catalogue-crawl-dispatch') like '%dispatch_crawl_workflow()%','the job calls the dispatch function');

-- Without the secret nothing is sent, nothing is raised, and the log says why.
select count(*) as queued_before from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' \gset
delete from vault.secrets where name = 'github_crawl_dispatch_token';
select lives_ok($$select public.dispatch_crawl_workflow()$$,'no secret is not an error');
select is((select outcome from public.crawl_dispatch_log order by sent_at desc limit 1),'token_missing','a missing secret is recorded');
select is((select count(*) from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches'),:'queued_before'::bigint,'nothing is sent without the secret');

-- With the secret it asks GitHub to dispatch the workflow on main with trigger=cron.
select vault.create_secret('test-token-not-a-real-token','github_crawl_dispatch_token','test') as secret_id \gset
select lives_ok($$select public.dispatch_crawl_workflow()$$,'dispatch with the secret');
select is((select count(*) from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches'),:'queued_before'::bigint + 1,'one request is queued');
select is((select method from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' order by id desc limit 1),'POST','the request is a POST');
select is((select url from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' order by id desc limit 1),'https://api.github.com/repos/felixng/stubbed/actions/workflows/catalogue-crawl.yml/dispatches','it targets the crawl workflow');
select is((select convert_from(body,'utf8')::jsonb from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' order by id desc limit 1),'{"ref":"main","inputs":{"trigger":"cron"}}'::jsonb,'it dispatches main with trigger=cron');
select is((select headers->>'Authorization' from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' order by id desc limit 1),'Bearer test-token-not-a-real-token','the token is read from Vault at call time');
select is((select headers->>'X-GitHub-Api-Version' from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' order by id desc limit 1),'2022-11-28','it names the API version');
select is((select headers->>'Accept' from net.http_request_queue where url like '%catalogue-crawl.yml/dispatches' order by id desc limit 1),'application/vnd.github+json','it asks for the GitHub JSON type');
select is((select outcome from public.crawl_dispatch_log order by sent_at desc limit 1),'sent','the send is logged');
select is((select count(*) from public.crawl_dispatch_log where error like '%test-token%'),0::bigint,'the log never holds the token');

-- GitHub's answer settles on the next tick; 204 means working, a 401 means failing.
select request_id as sent_id from public.crawl_dispatch_log where outcome = 'sent' order by sent_at desc limit 1 \gset
insert into net._http_response (id, status_code, content, timed_out) values (:'sent_id', 204, '', false);

select set_config('request.jwt.claims','{"sub":"d4290000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
select is(public.admin_crawl_dispatch()->>'token','working','a 204 answer means the token works');
select is((public.admin_crawl_dispatch()#>>'{recent,0,status_code}')::int,204,'the hub sees GitHub''s answer before it is settled');
select is(public.admin_crawl_dispatch()#>>'{job,schedule}','17,47 * * * *','the hub reads the job schedule');
select is((public.admin_crawl_dispatch()#>>'{job,active}')::boolean,true,'the hub reads that the job is active');
reset role;

select public.dispatch_crawl_workflow();
select is((select status_code from public.crawl_dispatch_log where request_id = :'sent_id'::bigint),204,'the next tick settles the earlier send');
select request_id as second_id from public.crawl_dispatch_log where outcome = 'sent' order by sent_at desc, id limit 1 \gset
insert into net._http_response (id, status_code, content, timed_out) values (:'second_id', 401, '{"message":"Bad credentials"}', false);
set local role authenticated;
select is(public.admin_crawl_dispatch()->>'token','failing','a 401 answer means the token is failing');
select is(public.admin_crawl_dispatch()#>>'{recent,0,error}','{"message":"Bad credentials"}','the hub shows GitHub''s error text');
reset role;

delete from vault.secrets where name = 'github_crawl_dispatch_token';
set local role authenticated;
select is(public.admin_crawl_dispatch()->>'token','missing','no secret reads as missing');
reset role;
select vault.create_secret('another-test-token','github_crawl_dispatch_token','test');
delete from public.crawl_dispatch_log;
set local role authenticated;
select is(public.admin_crawl_dispatch()->>'token','untested','a secret that has not been used reads as untested');
select is((select value::text from (select public.admin_crawl_dispatch()->>'token' as value) x where value is not null),'untested','the token value is never returned');
select ok(position('another-test-token' in public.admin_crawl_dispatch()::text) = 0,'the response never holds the token');
reset role;

-- Access: only the database role runs the job; members cannot read the log or the RPC; the log is read-only for admins.
insert into public.crawl_dispatch_log (outcome) values ('token_missing');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4290000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.dispatch_crawl_workflow()$$,'42501',null,'a member cannot run the dispatch function');
select throws_ok($$select public.admin_crawl_dispatch()$$,'42501','Not allowed','a member cannot read the trigger state');
select is((select count(*) from public.crawl_dispatch_log),0::bigint,'a member sees no dispatch log rows');
select throws_ok($$insert into public.crawl_dispatch_log(outcome) values ('sent')$$,'42501',null,'a member cannot write the log');
set local request.jwt.claims = '{"sub":"d4290000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}';
select cmp_ok((select count(*) from public.crawl_dispatch_log),'>=',1::bigint,'an admin reads the dispatch log');
select throws_ok($$select public.dispatch_crawl_workflow()$$,'42501',null,'an admin cannot run the dispatch function either');
select throws_ok($$insert into public.crawl_dispatch_log(outcome) values ('sent')$$,'42501',null,'an admin cannot write the log directly');
reset role;

-- A run records who sent its start, and the daily page cap is a valid stop reason.
select lives_ok($$insert into public.crawl_worker_runs(trigger,started_via,stop_reason) values ('schedule','supabase','daily_cap')$$,'a Supabase start and the daily cap are recorded');
select throws_ok($$insert into public.crawl_worker_runs(trigger,started_via) values ('schedule','cron')$$,'23514',null,'started_via only takes known senders');
select set_config('request.jwt.claims','{"sub":"d4290000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
select is(public.admin_crawl_schedule(1,0)#>>'{runs,0,started_via}','supabase','the schedule shows who sent the start');
reset role;
select * from finish();
rollback;
