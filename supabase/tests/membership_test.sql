-- Membership and feature policy (#414). Run with `supabase test db`.
begin;
select plan(37);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.sub(uid uuid, tx text, st text, ends timestamptz,
                            prov text default 'app_store', env text default 'sandbox')
returns void language sql as $$
  insert into public.subscriptions (user_id, provider, product_id, store_transaction_id, environment, status, will_renew, period_end)
  values (uid, prov, 'pro_monthly', tx, env, st, true, ends);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@example.com'),
  ('cccccccc-0000-0000-0000-000000000000', 'c@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'd@example.com');

select is((select value from public.app_config where key = 'paywall_sales_enabled'), 'false', 'sales switch seeds off');
select is((select value from public.app_config where key = 'paywall_gates_enabled'), 'false', 'gates switch seeds off');
select is((select value from public.app_config where key = 'pro_display_name'), 'Pro', 'display name seeds as Pro');
select is((select count(*)::int from public.feature_access where feature like 'insights.%'), 4, 'four seeded insights features');

select pg_temp.sub('aaaaaaaa-0000-0000-0000-000000000000', 't-active', 'active', now() + interval '10 days');
select pg_temp.sub('bbbbbbbb-0000-0000-0000-000000000000', 't-trial', 'trial', now() + interval '10 days');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'pro', 'active subscription is Pro');
select is(public.my_membership() ->> 'source', 'subscription', 'source is subscription');
select is((public.my_membership() ->> 'is_trial')::boolean, false, 'active is not a trial');
select is(public.my_membership() -> 'manage', '["app_store"]'::jsonb, 'manage points at the App Store');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((public.my_membership() ->> 'is_trial')::boolean, true, 'trial reports is_trial');
select is(public.my_membership() ->> 'tier', 'pro', 'trial is Pro');

select pg_temp.as_admin();
update public.subscriptions set status = 'cancelled', will_renew = false where store_transaction_id = 't-active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'pro', 'cancelled keeps Pro until period end');
select is((public.my_membership() ->> 'will_renew')::boolean, false, 'cancelled does not renew');

select pg_temp.as_admin();
update public.subscriptions set period_end = now() - interval '1 second' where store_transaction_id = 't-active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'free', 'cancelled past period end is Free');

select pg_temp.as_admin();
update public.subscriptions set status = 'grace', period_end = now() + interval '3 days' where store_transaction_id = 't-active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'pro', 'grace within its deadline is Pro');
select pg_temp.as_admin();
update public.subscriptions set period_end = now() - interval '1 second' where store_transaction_id = 't-active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'free', 'grace past its deadline is Free');

select pg_temp.as_admin();
update public.subscriptions set status = 'refunded', period_end = now() + interval '10 days' where store_transaction_id = 't-active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'free', 'refund is Free immediately');
select pg_temp.as_admin();
update public.subscriptions set status = 'expired' where store_transaction_id = 't-active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'free', 'expired is Free');

select pg_temp.as_admin();
select pg_temp.sub('cccccccc-0000-0000-0000-000000000000', 't-ios', 'active', now() + interval '5 days');
select pg_temp.sub('cccccccc-0000-0000-0000-000000000000', 't-web', 'active', now() + interval '20 days', 'rc_web');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
select is(public.my_membership() -> 'manage', '["app_store","web"]'::jsonb, 'overlap lists both managers');
select ok((public.my_membership() ->> 'expires_at')::timestamptz > now() + interval '19 days', 'overlap uses the later expiry');

select pg_temp.as_admin();
select pg_temp.sub('dddddddd-0000-0000-0000-000000000000', 't-prod', 'active', now() + interval '10 days', 'app_store', 'production');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'free', 'production row does not count in sandbox');
select pg_temp.as_admin();
update public.app_config set value = 'production' where key = 'billing_environment';
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'pro', 'production row counts in production');
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'free', 'sandbox rows stop counting in production');
select pg_temp.as_admin();
update public.app_config set value = 'sandbox' where key = 'billing_environment';

select pg_temp.as_admin();
delete from public.subscriptions where user_id = 'dddddddd-0000-0000-0000-000000000000';
insert into public.membership_grants (user_id, reason, ends_at)
  values ('dddddddd-0000-0000-0000-000000000000', 'test', now() + interval '30 days');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'tier', 'pro', 'a current grant is Pro');
select pg_temp.as_admin();
select throws_ok($$insert into public.membership_grants (user_id, reason, ends_at)
  values ('dddddddd-0000-0000-0000-000000000000', 'forever', now() + interval '10 years')$$,
  '23514', null, 'grants are bounded');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select throws_ok($$insert into public.subscriptions (user_id, provider, product_id, store_transaction_id, environment, status, period_end)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'app_store', 'p', 'self', 'sandbox', 'active', now() + interval '1 year')$$,
  '42501', null, 'a client cannot insert a subscription');
select throws_ok($$update public.subscriptions set period_end = now() + interval '9 years'$$,
  '42501', null, 'a client cannot extend a subscription');
select throws_ok($$insert into public.membership_grants (user_id, reason, ends_at)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'self', now() + interval '1 day')$$,
  '42501', null, 'a client cannot grant itself membership');
select throws_ok($$select * from public.billing_events$$, '42501', null, 'billing_events is closed to clients');
select throws_ok($$update public.app_config set value = 'true' where key = 'paywall_gates_enabled'$$,
  '42501', null, 'a client cannot flip the switches');
select is((select count(*)::int from public.subscriptions), 1, 'a user reads only their own subscriptions');

select pg_temp.as_anon();
select throws_ok($$select public.my_membership()$$, '42501', null, 'anonymous cannot read membership');
select throws_ok($$select public.has_feature('insights.show_mix')$$, '42501', null, 'anonymous cannot resolve features');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(public.has_feature('insights.show_mix'), 'gates off: Show mix allowed');
select ok(not public.has_feature('insights.nonsense'), 'unknown feature is denied');

select pg_temp.as_admin();
update public.app_config set value = 'true' where key = 'paywall_gates_enabled';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(not public.has_feature('insights.show_mix') and public.has_feature('insights.current_year'),
  'gates on: Free locked from Show mix, current year free');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select ok(public.has_feature('insights.show_mix') and public.has_feature('insights.all_time'), 'gates on: Pro allowed');
select pg_temp.as_admin();
update public.feature_access set tier = 'free' where feature = 'insights.show_mix';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(public.has_feature('insights.show_mix'), 'changing one policy row changes access');

select * from finish();
rollback;
