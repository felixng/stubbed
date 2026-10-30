begin;
select plan(18);
insert into auth.users(id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000000', 'access-a@example.com'),
 ('bbbbbbbb-0000-0000-0000-000000000000', 'access-b@example.com');
create function pg_temp.as_user(uid uuid) returns void language sql as $$
 select set_config('role', 'authenticated', true),
 set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is((select count(*)::int from public.own_feature_access()), 3, 'three registered capabilities');
select ok(public.can_access('extra_photos'), 'extra photos launch free');
select ok(public.can_access('advanced_insights'), 'insights launch free');
select ok(public.can_access('premium_card_styles'), 'styles launch free');
select ok(not public.can_access('typo'), 'unknown capability denied');
select throws_ok($$update public.feature_access_policies set required_entitlement = 'pro'$$, '42501', null, 'client cannot change policy');
select throws_ok($$insert into public.access_grants(user_id,entitlement,source,source_reference) values ('aaaaaaaa-0000-0000-0000-000000000000','pro','fake','1')$$, '42501', null, 'client cannot self-grant');
reset role;
update public.feature_access_policies set required_entitlement = 'pro' where capability = 'extra_photos';
insert into public.access_grants(user_id,entitlement,source,source_reference,expires_at) values
 ('bbbbbbbb-0000-0000-0000-000000000000','pro','promotion','bob',now()+interval '1 day');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(not public.can_access('extra_photos'), 'other account grant does not unlock');
select is((select count(*)::int from public.access_grants), 0, 'other account grants hidden');
reset role;
insert into public.access_grants(user_id,entitlement,source,source_reference,starts_at,expires_at) values
 ('aaaaaaaa-0000-0000-0000-000000000000','pro','promotion','alice',now()-interval '2 days',now()-interval '1 day');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(not public.can_access('extra_photos'), 'expired grant denied');
reset role;
update public.access_grants set starts_at=now()+interval '1 day', expires_at=now()+interval '2 days' where source_reference='alice';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(not public.can_access('extra_photos'), 'future grant denied');
reset role;
update public.access_grants set starts_at=now()-interval '1 day', revoked_at=now() where source_reference='alice';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(not public.can_access('extra_photos'), 'revoked grant denied');
reset role;
update public.access_grants set revoked_at=null where source_reference='alice';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(public.can_access('extra_photos'), 'active founder grant unlocks');
select throws_ok($$delete from public.access_grants$$, '42501', null, 'client cannot delete grants');
reset role;
insert into public.access_grants(user_id,entitlement,source,source_reference) values
 ('aaaaaaaa-0000-0000-0000-000000000000','pro','billing_adapter','subscription-1');
update public.access_grants set expires_at=now() where source_reference='alice';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(public.can_access('extra_photos'), 'paid grant survives promotion expiry');
reset role;
update public.access_grants set revoked_at=now() where source_reference='subscription-1';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select ok(not public.can_access('extra_photos'), 'access ends when no valid grant remains');
select ok(public.can_access('advanced_insights'), 'free capability remains available');
reset role;
set local role anon;
select throws_ok($$select * from public.own_feature_access()$$, '42501', null, 'anonymous access RPC denied');
reset role;
select * from finish();
rollback;
