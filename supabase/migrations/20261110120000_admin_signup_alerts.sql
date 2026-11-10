-- Owner alerts for new sign-ups (#486, epic #483). One row per new auth user,
-- written in the same transaction, claimed by notification-worker, which pushes
-- to every admin's devices and emails OWNER_ALERT_EMAIL. Operational, owner-only:
-- it doesn't touch the members' notification inbox or preferences.
create table public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_signup')),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'email',
  created_at timestamptz not null default now(),
  push_done_at timestamptz,
  email_done_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  lease_until timestamptz,
  last_error text,
  unique (kind, user_id)
);
create index admin_alerts_pending on public.admin_alerts (next_attempt_at)
  where push_done_at is null or email_done_at is null;
alter table public.admin_alerts enable row level security;
revoke all on public.admin_alerts from anon, authenticated;

create function public.queue_signup_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_alerts (kind, user_id, provider)
  values ('new_signup', new.id, coalesce(nullif(new.raw_app_meta_data ->> 'provider', ''), 'email'))
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.queue_signup_alert() from public, anon, authenticated;

create trigger on_auth_user_created_alert
  after insert on auth.users
  for each row execute function public.queue_signup_alert();

-- Lease pending alerts. Returns everything the worker needs, so it never reads
-- tables itself: the alert, the person's email and whether they've confirmed,
-- today's and all-time totals, and the push destinations of every admin.
create function public.claim_admin_alerts(batch_size integer default 3)
returns table (alert jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_attempts constant integer := 6;
begin
  update public.admin_alerts
     set last_error = coalesce(last_error, 'attempts_exhausted'),
         push_done_at = coalesce(push_done_at, now()),
         email_done_at = coalesce(email_done_at, now())
   where (push_done_at is null or email_done_at is null)
     and attempts >= max_attempts
     and (lease_until is null or lease_until <= now());

  return query
  with ready as (
    select a.id from public.admin_alerts a
     where (a.push_done_at is null or a.email_done_at is null)
       and a.attempts < max_attempts
       and a.next_attempt_at <= now()
       and (a.lease_until is null or a.lease_until <= now())
     order by a.created_at
     for update skip locked
     limit greatest(1, least(batch_size, 10))
  ), leased as (
    update public.admin_alerts a
       set lease = gen_random_uuid(), lease_until = now() + interval '2 minutes', attempts = a.attempts + 1
      from ready where ready.id = a.id
    returning a.*
  )
  select jsonb_build_object(
    'id', l.id, 'lease', l.lease, 'provider', l.provider, 'created_at', l.created_at,
    'push_pending', l.push_done_at is null, 'email_pending', l.email_done_at is null,
    'email', u.email, 'confirmed', u.email_confirmed_at is not null or u.confirmed_at is not null,
    'today', (select count(*) from auth.users where created_at >= date_trunc('day', now())),
    'total', (select count(*) from auth.users),
    'destinations', case when l.push_done_at is null then coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', d.kind, 'token', d.native_token, 'environment', d.apns_environment,
        'subscription', case when d.kind = 'web' then jsonb_build_object(
          'endpoint', d.web_endpoint, 'keys', jsonb_build_object('p256dh', d.web_p256dh, 'auth', d.web_auth)) end))
        from public.push_destinations d
        join auth.users au on au.id = d.user_id and au.raw_app_meta_data ->> 'role' = 'admin'
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from leased l join auth.users u on u.id = l.user_id;
end;
$$;

-- push and email are each 'done' (sent, or nothing to send), 'skipped' (not
-- configured) or 'retry' (try again after a backoff). Anything else is recorded
-- as an error and not retried.
create function public.finish_admin_alert(alert_id uuid, lease_token uuid, push text, email text, error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admin_alerts;
  delays integer[];
begin
  select * into a from public.admin_alerts where id = alert_id and lease = lease_token for update;
  if not found then return; end if;
  select retry_delays_seconds into delays from public.notification_policy where singleton;
  update public.admin_alerts set
    push_done_at = case when push_done_at is null and push <> 'retry' then now() else push_done_at end,
    email_done_at = case when email_done_at is null and email <> 'retry' then now() else email_done_at end,
    next_attempt_at = now() + make_interval(secs => coalesce(delays[least(a.attempts, cardinality(delays))], 60)),
    last_error = coalesce(left(error, 200), last_error),
    lease = null, lease_until = null
  where id = alert_id;
end;
$$;

revoke all on function public.claim_admin_alerts(integer), public.finish_admin_alert(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_admin_alerts(integer), public.finish_admin_alert(uuid, uuid, text, text, text) to service_role;
