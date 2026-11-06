-- #414 / #219: provider facts and product policy are separate. No gate is enabled.
create table public.app_config (
  key text primary key,
  value jsonb not null,
  constraint app_config_known_values check (
    (key = 'pro_display_name' and jsonb_typeof(value) = 'string' and length(value #>> '{}') between 1 and 60)
    or (key in ('paywall_sales_enabled', 'paywall_gates_enabled') and jsonb_typeof(value) = 'boolean')
    or (key = 'billing_environment' and value in ('"sandbox"'::jsonb, '"production"'::jsonb))
  )
);
insert into public.app_config values
  ('pro_display_name', '"Pro"'), ('paywall_sales_enabled', 'false'),
  ('paywall_gates_enabled', 'false'), ('billing_environment', '"sandbox"');
alter table public.app_config enable row level security;
create policy config_read on public.app_config for select to anon, authenticated using (true);
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
grant all on public.app_config to service_role;

create table public.feature_access (
  feature text primary key,
  tier text not null check (tier in ('free', 'pro'))
);
insert into public.feature_access values
  ('insights.current_year', 'free'), ('insights.past_years', 'pro'),
  ('insights.all_time', 'pro'), ('insights.show_mix', 'pro');
alter table public.feature_access enable row level security;
create policy feature_policy_read on public.feature_access for select to authenticated using (true);
revoke all on public.feature_access from anon, authenticated;
grant select on public.feature_access to authenticated;
grant all on public.feature_access to service_role;

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revenuecat_app_user_id text not null unique,
  created_at timestamptz not null default now(),
  constraint billing_customer_identity check (revenuecat_app_user_id = user_id::text)
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_customers(user_id) on delete cascade,
  provider text not null check (provider in ('app_store', 'rc_web')),
  product_id text not null check (length(product_id) > 0),
  store_transaction_id text not null check (length(store_transaction_id) > 0),
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null check (status in ('trial', 'active', 'grace', 'cancelled', 'expired', 'refunded')),
  will_renew boolean not null,
  period_end timestamptz not null check (isfinite(period_end)),
  updated_at timestamptz not null default now(),
  last_event_id text,
  unique (provider, environment, store_transaction_id)
);
create index subscriptions_owner_environment on public.subscriptions(user_id, environment, period_end);
create table public.billing_events (
  -- An id is scoped by environment; provider failures must remain retryable.
  event_id text not null,
  environment text not null check (environment in ('sandbox', 'production')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  primary key (event_id, environment),
  check (processed_at is null or error is null)
);
create table public.membership_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  reason text not null check (length(btrim(reason)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  granted_by uuid references auth.users(id) on delete set null,
  check (isfinite(starts_at) and isfinite(ends_at) and ends_at > starts_at)
);
create index membership_grants_owner_environment on public.membership_grants(user_id, environment, ends_at);

alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.membership_grants enable row level security;
create policy billing_customer_owner on public.billing_customers for select to authenticated using ((select auth.uid()) = user_id);
create policy subscription_owner on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy membership_grant_owner on public.membership_grants for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.billing_customers, public.subscriptions, public.billing_events, public.membership_grants from anon, authenticated;
grant select on public.billing_customers, public.subscriptions, public.membership_grants to authenticated;
grant all on public.billing_customers, public.subscriptions, public.billing_events, public.membership_grants to service_role;

-- Invoker rights: RLS and the explicit owner predicate both constrain these reads.
-- No user-id/clock/environment parameter can be supplied by a client.
create function public.my_membership()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with config as (
    select value #>> '{}' as environment from public.app_config where key = 'billing_environment'
  ), valid_subscriptions as materialized (
    select s.* from public.subscriptions s, config c
    where s.user_id = (select auth.uid()) and s.environment = c.environment
      and s.status in ('trial', 'active', 'grace', 'cancelled') and s.period_end > now()
  ), valid_grants as materialized (
    select g.* from public.membership_grants g, config c
    where g.user_id = (select auth.uid()) and g.environment = c.environment
      and g.starts_at <= now() and g.ends_at > now()
  ), access as (
    select period_end as expiry from valid_subscriptions
    union all select ends_at from valid_grants
  )
  select jsonb_build_object(
    'tier', case when exists (select 1 from access) then 'pro' else 'free' end,
    'source', coalesce((select jsonb_agg(source order by source) from (
      select provider as source from valid_subscriptions
      union select 'grant' from valid_grants
    ) sources), '[]'::jsonb),
    'expires_at', (select max(expiry) from access),
    'will_renew', coalesce((select bool_or(will_renew) from valid_subscriptions), false),
    'is_trial', coalesce((select bool_and(status = 'trial') from valid_subscriptions), false)
      and not exists (select 1 from valid_grants),
    'manage', coalesce((select jsonb_agg(manage order by manage) from (
      select distinct case provider when 'app_store' then 'app_store' else 'web' end as manage
      from valid_subscriptions
    ) stores), '[]'::jsonb)
  );
$$;
revoke all on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;

-- Unknown features always fail closed, even during the staged flags-off rollout.
create function public.has_feature(feature text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.feature_access f where f.feature = $1 and (
      f.tier = 'free'
      or (select value = 'false'::jsonb from public.app_config where key = 'paywall_gates_enabled')
      or public.my_membership()->>'tier' = 'pro'
    )
  );
$$;
revoke all on function public.has_feature(text) from public, anon;
grant execute on function public.has_feature(text) to authenticated;
