-- Owner sign-up alerts (#486): one row per new user, service-only, admin
-- devices only. Run with `supabase test db`.
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.com', '{"provider":"email","role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@example.com', '{"provider":"google"}');

select is((select count(*)::int from public.admin_alerts), 2, 'each new auth user creates exactly one alert');
select is((select provider from public.admin_alerts where user_id = '00000000-0000-0000-0000-0000000000b1'), 'google', 'the sign-in provider is recorded');

insert into public.push_destinations (id, user_id, secret_hash, kind, native_token, apns_environment)
values
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-0000000000a1', '\x00', 'apns', repeat('ab', 32), 'sandbox'),
  ('00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-0000000000b1', '\x00', 'apns', repeat('cd', 32), 'sandbox');

create temp table claimed on commit drop as
  select (alert ->> 'id')::uuid as id, (alert ->> 'lease')::uuid as lease, alert from public.claim_admin_alerts(10);
select is((select count(*)::int from claimed), 2, 'the service claims both alerts');
select is((select jsonb_array_length(alert -> 'destinations') from claimed where alert ->> 'provider' = 'google'), 1, 'push goes to the admin only');
select is((select alert -> 'destinations' -> 0 ->> 'token' from claimed where alert ->> 'provider' = 'google'), repeat('ab', 32), 'a non-admin member device gets no alert push');
select is((select (alert ->> 'total')::int from claimed limit 1) >= 2, true, 'totals count users');

select public.finish_admin_alert((select id from claimed where alert ->> 'provider' = 'google'), (select lease from claimed where alert ->> 'provider' = 'google'), 'done', 'retry', 'email_retryable');
select is((select push_done_at is not null and email_done_at is null from public.admin_alerts where provider = 'google'), true, 'a retry keeps only the failed channel pending');
select is((select count(*)::int from public.claim_admin_alerts(10)), 0, 'a retry waits for its backoff');

set local role authenticated;
select throws_ok($$ select * from public.admin_alerts $$, '42501', null, 'authenticated cannot read alerts');
set local role anon;
select throws_ok($$ select public.claim_admin_alerts(1) $$, '42501', null, 'anon cannot claim alerts');

select * from finish();
rollback;
