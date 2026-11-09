-- Backstage membership lookup and billing activity (#466, epic #219). Admins only, read only;
-- no table grants are added.

-- Whose state a webhook event concerned, so support can see a member's recent events.
alter table public.billing_events add column user_id uuid references auth.users (id) on delete set null;
create index billing_events_user_idx on public.billing_events (user_id, received_at desc);

-- One user's membership, subscriptions, grants and last 10 billing events, by handle.
create function public.admin_membership(handle text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid;
  h text := handle;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select p.id into uid from public.profiles p
  where lower(p.handle::text) = lower(ltrim(btrim(coalesce(h, '')), '@'));
  if uid is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'user_id', uid,
    'handle', (select p.handle from public.profiles p where p.id = uid),
    'membership', public.effective_membership(uid),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'provider', s.provider, 'product_id', s.product_id, 'environment', s.environment, 'status', s.status,
        'period_end', s.period_end, 'will_renew', s.will_renew, 'updated_at', s.updated_at)
        order by s.period_end desc) from public.subscriptions s where s.user_id = uid), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object(
        'reason', g.reason, 'starts_at', g.starts_at, 'ends_at', g.ends_at) order by g.ends_at desc)
        from public.membership_grants g where g.user_id = uid), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'event_id', e.event_id, 'received_at', e.received_at, 'processed_at', e.processed_at, 'error', e.error)
        order by e.received_at desc)
        from (select * from public.billing_events b where b.user_id = uid order by b.received_at desc limit 10) e), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.admin_membership(text) from public, anon;
grant execute on function public.admin_membership(text) to authenticated;

-- The config switches and when billing last did something. Reconcile runs are recorded as
-- billing_events named `reconcile:<time>`.
create function public.admin_billing_activity()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'config', coalesce((select jsonb_object_agg(c.key, c.value) from public.app_config c), '{}'::jsonb),
    'last_webhook', (select max(processed_at) from public.billing_events where event_id not like 'reconcile:%'),
    'last_reconcile', (select max(processed_at) from public.billing_events where event_id like 'reconcile:%'));
end;
$$;
revoke execute on function public.admin_billing_activity() from public, anon;
grant execute on function public.admin_billing_activity() to authenticated;
