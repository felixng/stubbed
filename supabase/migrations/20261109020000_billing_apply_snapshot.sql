-- Server-side writes for Pro membership (#259, epic #219). Contract: docs/PAYWALL.md section 5.
-- RevenueCat's current state for a customer is authoritative: the server fetches it and hands the
-- mapped rows here, and this replaces that user's subscriptions in one transaction.

-- RevenueCat customers to delete once their account is gone. `delete_my_account` removes the
-- user (and, by cascade, their billing_customers row); the daily reconcile then deletes the
-- RevenueCat customer and clears the queue row.
create table public.billing_customer_deletions (
  app_user_id text primary key,
  queued_at timestamptz not null default now()
);
alter table public.billing_customer_deletions enable row level security;
revoke all on public.billing_customer_deletions from anon, authenticated;

create function public.billing_queue_customer_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.billing_customer_deletions (app_user_id) values (old.revenuecat_app_user_id)
  on conflict do nothing;
  return old;
end;
$$;
revoke execute on function public.billing_queue_customer_deletion() from public, anon, authenticated;

create trigger billing_customers_queue_deletion
  after delete on public.billing_customers
  for each row execute function public.billing_queue_customer_deletion();

-- Replace `uid`'s subscriptions with `rows` (an array of subscription objects), make sure the
-- billing customer exists, mark the webhook event processed when one is given, and return the
-- resulting membership. Service role only.
create function public.billing_apply_snapshot(uid uuid, rows jsonb, event_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'rows must be an array';
  end if;

  insert into public.billing_customers (user_id, revenuecat_app_user_id)
  values (uid, uid::text) on conflict do nothing;

  delete from public.subscriptions where user_id = uid;
  insert into public.subscriptions
    (user_id, provider, product_id, store_transaction_id, environment, status, will_renew, period_end, last_event_id)
  select uid, r.provider, r.product_id, r.store_transaction_id, r.environment, r.status,
         r.will_renew, r.period_end, billing_apply_snapshot.event_id
  from jsonb_to_recordset(rows) as r(provider text, product_id text, store_transaction_id text,
         environment text, status text, will_renew boolean, period_end timestamptz);

  if billing_apply_snapshot.event_id is not null then
    update public.billing_events set processed_at = now(), error = null
    where billing_events.event_id = billing_apply_snapshot.event_id;
  end if;

  return public.effective_membership(uid);
end;
$$;
revoke execute on function public.billing_apply_snapshot(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.billing_apply_snapshot(uuid, jsonb, text) to service_role;
