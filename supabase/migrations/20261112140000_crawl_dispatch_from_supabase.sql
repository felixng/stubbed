-- Start the crawl on time from Supabase, and run sources in parallel (#510, epic #419). Additive.
-- No change to crawl behaviour by itself: until the Vault secret below exists, the job only records
-- that the token is missing. GitHub's own schedule stays as a backup.
--
-- Owner step (the token is never in a migration, a repo file or a log):
--   1. GitHub > Settings > Developer settings > Fine-grained personal access tokens > Generate new token.
--      Repository access: only felixng/stubbed. Permissions: Actions: Read and write. Expiry: 1 year.
--   2. In the Supabase SQL editor:  select vault.create_secret('<token>', 'github_crawl_dispatch_token');
--   To replace it later: update vault.secrets set secret = '<new token>' where name = 'github_crawl_dispatch_token';
--
-- 1. started_via on crawl_worker_runs: who sent the start (Supabase on time, or GitHub's schedule).
-- 2. daily_cap joins the run stop reasons (a source reached its rolling daily page cap).
-- 3. crawl_dispatch_log: every start Supabase sent, with GitHub's answer.
-- 4. dispatch_crawl_workflow(): reads the token from Vault at call time and asks GitHub to start the workflow.
-- 5. pg_cron job catalogue-crawl-dispatch at :17 and :47.
-- 6. admin_crawl_dispatch(): the trigger state for the hub (token missing / untested / working / failing).
-- 7. admin_crawl_schedule also returns started_via.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.crawl_worker_runs
  add column started_via text check (started_via in ('supabase', 'github_schedule'));
alter table public.crawl_worker_runs drop constraint crawl_worker_runs_stop_reason_check;
alter table public.crawl_worker_runs add constraint crawl_worker_runs_stop_reason_check
  check (stop_reason in ('page_allowance', 'time_limit', 'daily_cap', 'daily_spend_cap', 'nothing_due', 'failed', 'cancelled'));

create table public.crawl_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default clock_timestamp(),
  outcome text not null check (outcome in ('sent', 'token_missing', 'send_failed')),
  request_id bigint,
  status_code integer,
  error text
);
create index crawl_dispatch_log_sent on public.crawl_dispatch_log (sent_at desc);
alter table public.crawl_dispatch_log enable row level security;
revoke all on public.crawl_dispatch_log from public, anon, authenticated;
grant select on public.crawl_dispatch_log to authenticated;
create policy "Admins read crawl dispatch log"
  on public.crawl_dispatch_log for select
  to authenticated
  using (public.is_admin());

create function public.dispatch_crawl_workflow()
returns void language plpgsql security definer set search_path = '' as $$
declare
  token text;
  request bigint;
begin
  -- Settle earlier sends from pg_net's responses (it keeps them for a few hours), and tidy old rows.
  update public.crawl_dispatch_log l set
    status_code = r.status_code,
    error = coalesce(r.error_msg, case when r.timed_out then 'Timed out' end, case when r.status_code >= 300 then left(r.content, 200) end)
  from net._http_response r
  where r.id = l.request_id and l.status_code is null and l.error is null;
  delete from public.crawl_dispatch_log where sent_at < now() - interval '7 days';

  select decrypted_secret into token from vault.decrypted_secrets
  where name = 'github_crawl_dispatch_token' order by created_at desc limit 1;
  if token is null or btrim(token) = '' then
    insert into public.crawl_dispatch_log (outcome) values ('token_missing');
    return;
  end if;

  begin
    select net.http_post(
      url := 'https://api.github.com/repos/felixng/stubbed/actions/workflows/catalogue-crawl.yml/dispatches',
      body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('trigger', 'cron')),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || token,
        'Accept', 'application/vnd.github+json',
        'X-GitHub-Api-Version', '2022-11-28',
        'Content-Type', 'application/json',
        'User-Agent', 'stubbed-supabase-cron'),
      timeout_milliseconds := 10000
    ) into request;
    insert into public.crawl_dispatch_log (outcome, request_id) values ('sent', request);
  exception when others then
    -- Never raise (the job would only repeat the error); record it for the hub. The message cannot hold the token.
    insert into public.crawl_dispatch_log (outcome, error) values ('send_failed', left(sqlerrm, 200));
  end;
end;
$$;
revoke all on function public.dispatch_crawl_workflow() from public, anon, authenticated;

select cron.schedule('catalogue-crawl-dispatch', '17,47 * * * *', 'select public.dispatch_crawl_workflow()');

create function public.admin_crawl_dispatch()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  has_secret boolean;
  recent jsonb;
  latest_status integer;
  latest_error text;
  latest_outcome text;
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select exists (select 1 from vault.decrypted_secrets where name = 'github_crawl_dispatch_token' and btrim(decrypted_secret) <> '') into has_secret;
  -- Sends since the last settle also read GitHub's answer straight from pg_net.
  select coalesce(jsonb_agg(row order by (row->>'sent_at') desc), '[]'::jsonb) into recent from (
    select jsonb_build_object('sent_at', l.sent_at, 'outcome', l.outcome,
      'status_code', coalesce(l.status_code, r.status_code),
      'error', coalesce(l.error, r.error_msg, case when r.timed_out then 'Timed out' end,
        case when r.status_code >= 300 then left(r.content, 200) end)) as row
    from public.crawl_dispatch_log l
    left join net._http_response r on r.id = l.request_id
    order by l.sent_at desc limit 6) q;
  select (x->>'status_code')::integer, x->>'error', x->>'outcome' into latest_status, latest_error, latest_outcome
  from jsonb_array_elements(recent) x where x->>'outcome' in ('sent', 'send_failed') limit 1;
  return jsonb_build_object(
    'job', (select jsonb_build_object('schedule', j.schedule, 'active', j.active) from cron.job j where j.jobname = 'catalogue-crawl-dispatch'),
    'token', case
      when not has_secret then 'missing'
      when latest_outcome is null then 'untested'
      when latest_outcome = 'send_failed' or latest_error is not null or coalesce(latest_status, 0) >= 300 then 'failing'
      when latest_status between 200 and 299 then 'working'
      else 'untested' end,
    'recent', recent);
end;
$$;
revoke all on function public.admin_crawl_dispatch() from public, anon;
grant execute on function public.admin_crawl_dispatch() to authenticated;

create or replace function public.admin_crawl_schedule(
  page_size integer default 25, page_offset integer default 0, for_trigger text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  size integer := least(greatest(coalesce(page_size, 25), 1), 100);
  skip integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not public.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'server_time', now(),
    -- A run still open after 35 minutes was interrupted (the job is killed after 30).
    'running', (select to_jsonb(r) from (
      select id, started_at, trigger, started_via, log_url, source_filter from public.crawl_worker_runs
      where finished_at is null and started_at > now() - interval '35 minutes'
      order by started_at desc limit 1) r),
    'last_run', (select to_jsonb(r) from (
      select id, started_at, finished_at, trigger, started_via, log_url, per_source, stop_reason, model_spend_usd, limits
      from public.crawl_worker_runs where finished_at is not null or started_at <= now() - interval '35 minutes'
      order by started_at desc limit 1) r),
    'limits', (select limits from public.crawl_worker_runs order by started_at desc limit 1),
    'total', (select count(*) from public.crawl_worker_runs where for_trigger is null or trigger = for_trigger),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc) from (
      select id, started_at, finished_at, trigger, started_via, github_run_id, log_url, source_filter, stage_filter, scope_filter,
        per_source, stop_reason, model_spend_usd, limits,
        (finished_at is null and started_at <= now() - interval '35 minutes') as interrupted
      from public.crawl_worker_runs
      where for_trigger is null or trigger = for_trigger
      order by started_at desc limit size offset skip) r), '[]'::jsonb),
    -- The last 24 hours, for the daily page and model caps and when a capped source resumes.
    'window', coalesce((select jsonb_agg(jsonb_build_object('started_at', r.started_at, 'per_source', r.per_source,
        'model_spend_usd', r.model_spend_usd) order by r.started_at)
      from public.crawl_worker_runs r where r.started_at > now() - interval '24 hours'), '[]'::jsonb),
    -- Pages due right now, as claim_due_crawl_task would see them, split by why they are due.
    'forecast', coalesce((
      select jsonb_object_agg(f.source_key, jsonb_build_object(
        'claimable', f.claimable, 'new', f.new_pages, 'retry', f.retry_pages, 'reread', f.reread_pages))
      from (
        select s.source_key,
          (s.collection_enabled and s.paused_reason is null and s.operator_paused_at is null) as claimable,
          count(t.id) filter (where t.due and t.last_success_at is null and t.consecutive_failures = 0 and t.status <> 'retry_wait') as new_pages,
          count(t.id) filter (where t.due and t.last_success_at is null and (t.status = 'retry_wait' or t.consecutive_failures > 0)) as retry_pages,
          count(t.id) filter (where t.due and t.last_success_at is not null) as reread_pages
        from public.crawl_sources s
        left join lateral (
          select x.id, x.last_success_at, x.consecutive_failures, x.status,
            ((x.status in ('pending', 'retry_wait') and x.available_at <= now())
              or (x.status = 'leased' and x.lease_expires_at <= now())
              or (x.status = 'succeeded' and (x.parser_version is distinct from s.adapter_version
                or coalesce(x.refresh_at, x.last_success_at + interval '30 days') <= now()))) as due
          from public.crawl_tasks x
          join public.crawl_generations g on g.id = x.generation_id and g.is_current and g.paused_reason is null
          where x.source_id = s.id
        ) t on true
        where s.source_key <> 'official'
        group by s.id, s.source_key, s.collection_enabled, s.paused_reason, s.operator_paused_at
      ) f), '{}'::jsonb));
end;
$$;
