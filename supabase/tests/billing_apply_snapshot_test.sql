-- Server-side membership writes (#259). Run with `supabase test db`.
begin;
select plan(13);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@example.com');

update public.profiles set handle = 'alice' where id = 'aaaaaaaa-0000-0000-0000-000000000000';

select ok(not has_function_privilege('anon', 'public.billing_apply_snapshot(uuid,jsonb,text)', 'execute'), 'anon cannot apply a snapshot');
select ok(not has_function_privilege('authenticated', 'public.billing_apply_snapshot(uuid,jsonb,text)', 'execute'), 'signed-in users cannot apply a snapshot');
select ok(has_function_privilege('service_role', 'public.billing_apply_snapshot(uuid,jsonb,text)', 'execute'), 'the service role can');

insert into public.billing_events (event_id) values ('evt-1');

select pg_temp.as_service();
select is(
  public.billing_apply_snapshot('aaaaaaaa-0000-0000-0000-000000000000',
    jsonb_build_array(jsonb_build_object('provider', 'app_store', 'product_id', 'pro_monthly', 'store_transaction_id', 't1',
      'environment', 'sandbox', 'status', 'active', 'will_renew', true, 'period_end', now() + interval '10 days')),
    'evt-1') ->> 'tier', 'pro', 'applying an active snapshot returns Pro');
select ok((select processed_at is not null from public.billing_events where event_id = 'evt-1'), 'the event is marked processed');
select is((select count(*)::int from public.billing_customers where user_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 1, 'the billing customer exists');

-- A later snapshot replaces the earlier one.
select is(
  public.billing_apply_snapshot('aaaaaaaa-0000-0000-0000-000000000000',
    jsonb_build_array(jsonb_build_object('provider', 'rc_web', 'product_id', 'web_annual', 'store_transaction_id', 't2',
      'environment', 'sandbox', 'status', 'expired', 'will_renew', false, 'period_end', now() - interval '1 day'))) ->> 'tier',
  'free', 'an expired snapshot replaces the active one');
select is((select count(*)::int from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 1, 'only the snapshot remains');

-- Rows from the other environment don't count (config says sandbox).
select is(
  public.billing_apply_snapshot('bbbbbbbb-0000-0000-0000-000000000000',
    jsonb_build_array(jsonb_build_object('provider', 'app_store', 'product_id', 'pro_monthly', 'store_transaction_id', 't3',
      'environment', 'production', 'status', 'active', 'will_renew', true, 'period_end', now() + interval '10 days'))) ->> 'tier',
  'free', 'a production row does not count in the sandbox environment');
select throws_ok($$select public.billing_apply_snapshot('bbbbbbbb-0000-0000-0000-000000000000', '{}'::jsonb)$$, 'P0001', 'rows must be an array', 'rows must be an array');

-- Clients can't read the queue or the events.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select * from public.billing_customer_deletions$$, '42501', null, 'clients cannot read the deletion queue');

-- Account deletion queues the RevenueCat customer.
select public.delete_my_account('alice');
select pg_temp.as_admin();
select is((select count(*)::int from public.billing_customer_deletions where app_user_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 1, 'deleting the account queues the RevenueCat customer');
select is((select count(*)::int from public.billing_customer_deletions where app_user_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'other customers are not queued');

select * from finish();
rollback;
