begin;
select no_plan();
-- 20261111130000: Publish and Run chips as Backstage buttons.

insert into auth.users (id, email) values ('d4730000-0000-0000-0000-000000000001', 'switches@example.com');
update public.crawl_sources set publication_enabled = false, withdrawn_at = null where source_key in ('london_theatre', 'playbill');
update public.catalogue_consumer_flags set enabled = false;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d4730000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_crawl_source_action('london_theatre','publish_on')$$, '42501', 'Not allowed',
  'a member cannot turn publication on');
select throws_ok($$select * from public.admin_catalogue_flags()$$, '42501', 'Not allowed', 'a member cannot read the flags');
select throws_ok($$select public.admin_set_catalogue_flag('catalogue_run_chips_enabled', true)$$, '42501', null,
  'a member cannot turn run chips on');

set local request.jwt.claims = '{"sub":"d4730000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.admin_crawl_source_action('london_theatre','publish_on'), 1, 'an admin turns publication on');
select is(public.admin_crawl_source_action('london_theatre','publish_on'), 0, 'turning it on again changes nothing');
select is((select count(*) from public.crawl_admin_actions a join public.crawl_sources s on s.id = a.source_id
  where s.source_key = 'london_theatre' and a.operation = 'publish_on'
    and a.actor_id = 'd4730000-0000-0000-0000-000000000001'), 2::bigint, 'each press is recorded with its actor');
select is(public.admin_crawl_source_action('london_theatre','publish_off'), 1, 'an admin turns publication off');
select is(public.admin_set_catalogue_flag('catalogue_run_chips_enabled', true), true, 'an admin turns run chips on');
select is((select enabled from public.admin_catalogue_flags() where flag = 'catalogue_run_chips_enabled'), true,
  'admins read the run chips flag');
select is((select enabled from public.admin_catalogue_flags() where flag = 'catalogue_run_autofill_enabled'), false,
  'autofill is unchanged');

reset role;
select is((select publication_enabled from public.crawl_sources where source_key = 'london_theatre'), false,
  'publication is off after publish_off');
update public.crawl_sources set withdrawn_at = now() where source_key = 'playbill';
set local role authenticated;
select throws_ok($$select public.admin_crawl_source_action('playbill','publish_on')$$, '22023',
  'Reinstate this source before publishing', 'a withdrawn source cannot be published');

select * from finish();
rollback;
