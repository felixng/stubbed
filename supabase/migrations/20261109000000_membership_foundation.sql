-- Pro membership and feature policy, the database foundation (#414, slice of #259, epic #219).
-- Contract: docs/PAYWALL.md sections 3, 5 and 6.
--
-- Nothing here changes what anyone can do: both rollout switches seed to false, and no stats
-- read is gated yet. Only the server (service role) writes subscription facts; clients read their
-- own membership. Provider names appear only as data in `subscriptions`, never in feature code.

-- Config ----------------------------------------------------------------------

create table public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;
create policy "app_config is public to read" on public.app_config for select using (true);
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

insert into public.app_config (key, value) values
  ('pro_display_name', 'Pro'),
  ('paywall_sales_enabled', 'false'),
  ('paywall_gates_enabled', 'false'),
  ('billing_environment', 'sandbox');

-- Subscription facts (server-owned) -------------------------------------------

create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revenuecat_app_user_id text not null unique,
  created_at timestamptz not null default now(),
  check (revenuecat_app_user_id = user_id::text)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('app_store', 'rc_web')),
  product_id text not null,
  store_transaction_id text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null check (status in ('trial', 'active', 'grace', 'cancelled', 'expired', 'refunded')),
  will_renew boolean not null default false,
  period_end timestamptz not null,
  updated_at timestamptz not null default now(),
  last_event_id text,
  unique (provider, environment, store_transaction_id)
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create table public.billing_events (
  event_id text primary key,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- Deliberate grants (none at launch). Always finite and bounded.
create table public.membership_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  granted_by uuid references auth.users (id) on delete set null,
  check (ends_at > starts_at and ends_at <= starts_at + interval '5 years')
);
create index membership_grants_user_idx on public.membership_grants (user_id);

alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.membership_grants enable row level security;

create policy "own billing customer" on public.billing_customers for select using (user_id = auth.uid());
create policy "own subscriptions" on public.subscriptions for select using (user_id = auth.uid());
create policy "own grants" on public.membership_grants for select using (user_id = auth.uid());
-- billing_events: no policy and no grant, so only the service role reaches it.

revoke all on public.billing_customers, public.subscriptions, public.billing_events,
  public.membership_grants from anon, authenticated;
grant select on public.billing_customers, public.subscriptions, public.membership_grants to authenticated;

-- Effective membership --------------------------------------------------------

-- Internal: the membership of any user. Not callable by clients.
create function public.effective_membership(uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with env as (
    select coalesce((select value from public.app_config where key = 'billing_environment'), 'production') as v
  ),
  live as (
    select s.*
    from public.subscriptions s, env
    where s.user_id = uid
      and s.environment = env.v
      and s.status in ('trial', 'active', 'grace', 'cancelled')
      and s.period_end > now()
  ),
  grants as (
    select g.* from public.membership_grants g
    where g.user_id = uid and g.starts_at <= now() and g.ends_at > now()
  ),
  best as (
    (select 'subscription' as source, status = 'trial' as is_trial, will_renew, period_end as expires_at from live)
    union all
    (select 'grant', false, false, ends_at from grants)
    order by expires_at desc
    limit 1
  )
  select case
    when uid is null or not exists (select 1 from best) then
      jsonb_build_object('tier', 'free', 'source', null, 'expires_at', null,
                         'will_renew', false, 'is_trial', false, 'manage', '[]'::jsonb)
    else jsonb_build_object(
      'tier', 'pro',
      'source', (select source from best),
      'expires_at', (select expires_at from best),
      'will_renew', (select will_renew from best),
      'is_trial', (select is_trial from best),
      'manage', coalesce((
        select jsonb_agg(m order by m)
        from (select distinct case provider when 'app_store' then 'app_store' else 'web' end as m from live) x
      ), '[]'::jsonb)
    )
  end;
$$;

revoke execute on function public.effective_membership(uuid) from public, anon, authenticated;

-- The caller's own membership.
create function public.my_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public.effective_membership(auth.uid());
end;
$$;

revoke execute on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;

-- Feature policy --------------------------------------------------------------

create table public.feature_access (
  feature text primary key,
  tier text not null check (tier in ('free', 'pro'))
);

alter table public.feature_access enable row level security;
create policy "feature_access is public to read" on public.feature_access for select using (true);
revoke all on public.feature_access from anon, authenticated;
grant select on public.feature_access to anon, authenticated;

insert into public.feature_access (feature, tier) values
  ('insights.current_year', 'free'),
  ('insights.past_years', 'pro'),
  ('insights.all_time', 'pro'),
  ('insights.show_mix', 'pro');

-- Whether the caller may use a feature. Unknown features are denied. While
-- `paywall_gates_enabled` is not 'true', every known feature is allowed.
create function public.has_feature(feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  required text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select fa.tier into required from public.feature_access fa where fa.feature = has_feature.feature;
  if required is null then
    return false;
  end if;

  if required = 'free'
     or coalesce((select value from public.app_config where key = 'paywall_gates_enabled'), 'false') <> 'true' then
    return true;
  end if;

  return public.effective_membership(auth.uid()) ->> 'tier' = 'pro';
end;
$$;

revoke execute on function public.has_feature(text) from public, anon;
grant execute on function public.has_feature(text) to authenticated;
