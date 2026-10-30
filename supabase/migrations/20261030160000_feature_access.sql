-- Provider-independent access foundation. No launch feature is gated.
create table public.feature_access_policies (
  capability text primary key,
  required_entitlement text,
  constraint capability_name check (capability ~ '^[a-z][a-z0-9_]*$')
);

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (entitlement <> ''),
  -- Adapter-owned identity, not a vendor enum. Promotional grants coexist
  -- with subscriptions so expiry of one never overwrites the other.
  source text not null check (source <> ''),
  source_reference text not null check (source_reference <> ''),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique (source, source_reference, entitlement),
  check (expires_at is null or expires_at > starts_at)
);
create index access_grants_user_entitlement on public.access_grants(user_id, entitlement);

alter table public.feature_access_policies enable row level security;
alter table public.access_grants enable row level security;
revoke all on public.feature_access_policies, public.access_grants from public, anon, authenticated;
grant select on public.feature_access_policies, public.access_grants to authenticated;
grant all on public.feature_access_policies, public.access_grants to service_role;
create policy feature_policies_read on public.feature_access_policies
  for select to authenticated using (true);
create policy access_grants_read_own on public.access_grants
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.feature_access_policies(capability) values
  ('extra_photos'), ('advanced_insights'), ('premium_card_styles');

-- Caller-scoped: no user-id argument that could probe another account.
-- Unknown capability and unauthenticated callers always fail closed.
create function public.can_access(capability_key text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.feature_access_policies p
    where p.capability = capability_key and (
      p.required_entitlement is null or exists (
        select 1 from public.access_grants g
        where g.user_id = auth.uid()
          and g.entitlement = p.required_entitlement
          and g.starts_at <= now()
          and (g.expires_at is null or g.expires_at > now())
          and g.revoked_at is null
      )
    )
  );
$$;
revoke all on function public.can_access(text) from public, anon;
grant execute on function public.can_access(text) to authenticated, service_role;

create function public.own_feature_access()
returns table(capability text, allowed boolean)
language sql stable security invoker set search_path = '' as $$
  select p.capability, public.can_access(p.capability)
  from public.feature_access_policies p
  where auth.uid() is not null
  order by p.capability;
$$;
revoke all on function public.own_feature_access() from public, anon;
grant execute on function public.own_feature_access() to authenticated, service_role;
