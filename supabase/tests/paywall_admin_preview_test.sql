-- Admins see the paywall for real while `paywall_preview_admins` is on; nobody else does.
-- Run with `supabase test db`.
begin;
select plan(11);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'user@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'admin@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000000', 'pro-admin@example.com');
insert into public.subscriptions (user_id, provider, product_id, store_transaction_id, environment, status, will_renew, period_end)
values ('eeeeeeee-0000-0000-0000-000000000000', 'app_store', 'stubbed_pro_monthly', 'tx-admin', 'sandbox', 'active', true, now() + interval '10 days');

select is((select value from public.app_config where key = 'paywall_preview_admins'), 'true', 'preview seeds on');
select is((select value from public.app_config where key = 'paywall_gates_enabled'), 'false', 'gates stay off for everyone');

-- A normal user: nothing changes.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'paywall_preview', 'false', 'a user gets no preview');
select ok(public.has_feature('insights.show_mix'), 'a user keeps Show mix while gates are off');

-- A Free admin: locked by the database, and told to show the paywall.
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'paywall_preview', 'true', 'an admin gets the preview');
select ok(not public.has_feature('insights.show_mix'), 'a Free admin has Show mix locked');
select ok(public.has_feature('insights.current_year'), 'a Free admin keeps this year');
select is(public.own_insights() -> 'access' -> 'locked' ? 'types', true, 'own_insights locks Show mix for a Free admin');

-- A Pro admin (a sandbox purchase): unlocked.
select pg_temp.as_admin_user('eeeeeeee-0000-0000-0000-000000000000');
select ok(public.has_feature('insights.show_mix'), 'a Pro admin has Show mix');

-- Switched off: admins see what everyone sees.
select pg_temp.as_postgres();
update public.app_config set value = 'false' where key = 'paywall_preview_admins';
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is(public.my_membership() ->> 'paywall_preview', 'false', 'preview off: no paywall for admins');
select ok(public.has_feature('insights.show_mix'), 'preview off: Show mix open again');

select * from finish();
rollback;
