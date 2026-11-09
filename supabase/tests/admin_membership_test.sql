-- Backstage membership lookup (#466). Run with `supabase test db`.
begin;
select plan(12);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'member@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'admin@example.com');
update public.profiles set handle = 'memberone' where id = 'aaaaaaaa-0000-0000-0000-000000000000';
insert into public.subscriptions (user_id, provider, product_id, store_transaction_id, environment, status, will_renew, period_end)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'app_store', 'pro_monthly', 't1', 'sandbox', 'active', true, now() + interval '5 days');
insert into public.billing_events (event_id, user_id, processed_at)
  values ('evt-a', 'aaaaaaaa-0000-0000-0000-000000000000', now() - interval '1 hour'),
         ('reconcile:2026-11-09', null, now());

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_membership('memberone')$$, '42501', null, 'a member cannot look anyone up');
select throws_ok($$select public.admin_billing_activity()$$, '42501', null, 'a member cannot read billing activity');
select pg_temp.as_anon();
select ok(not has_function_privilege('anon', 'public.admin_membership(text)', 'execute'), 'anon cannot run the lookup');

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is(public.admin_membership('@MemberOne') ->> 'found', 'true', 'an admin finds a user by handle, ignoring case and @');
select is(public.admin_membership('memberone') -> 'membership' ->> 'tier', 'pro', 'shows the effective membership');
select is(jsonb_array_length(public.admin_membership('memberone') -> 'subscriptions'), 1, 'lists subscriptions');
select is(jsonb_array_length(public.admin_membership('memberone') -> 'events'), 1, 'lists that user''s events only');
select is(public.admin_membership('nobody') ->> 'found', 'false', 'an unknown handle is not found');
select is(public.admin_billing_activity() -> 'config' ->> 'paywall_gates_enabled', 'false', 'shows the config switches');
select isnt(public.admin_billing_activity() ->> 'last_webhook', null, 'shows the last webhook');
select isnt(public.admin_billing_activity() ->> 'last_reconcile', null, 'shows the last reconcile');

select pg_temp.as_postgres();
select is((select count(*)::int from information_schema.role_table_grants
           where table_name = 'billing_events' and grantee = 'authenticated'), 0, 'no table grants for clients');

select * from finish();
rollback;
