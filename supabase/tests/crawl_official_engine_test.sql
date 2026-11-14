begin;
select no_plan();

-- Venues attach to a site by their what's-on URL (the venues_attach trigger creates the site).
insert into public.venues (id, name, city, whats_on_url) values
  ('a5440000-0000-0000-0000-000000000001', 'Pending Frontier', 'London', 'https://engine-a.test/whats-on/'),
  ('a5440000-0000-0000-0000-000000000002', 'Flagged Frontier', 'London', 'https://engine-b.test/whats-on/'),
  ('a5440000-0000-0000-0000-000000000003', 'Attention Frontier', 'London', 'https://engine-c.test/whats-on/'),
  ('a5440000-0000-0000-0000-000000000004', 'Legacy Pending', 'London', 'https://engine-d.test/whats-on/'),
  ('a5440000-0000-0000-0000-000000000005', 'Ready Frontier', 'London', 'https://engine-e.test/whats-on/'),
  ('a5440000-0000-0000-0000-000000000006', 'No Site', 'London', null);
update public.crawl_sites set engine = 'frontier', status = 'pending' where whats_on_url = 'https://engine-a.test/whats-on/';
update public.crawl_sites set engine = 'frontier', status = 'ready', repair_requested_at = now(), repair_reason = 'x' where whats_on_url = 'https://engine-b.test/whats-on/';
update public.crawl_sites set engine = 'frontier', status = 'needs_attention', repair_requested_at = now() where whats_on_url = 'https://engine-c.test/whats-on/';
update public.crawl_sites set status = 'pending' where whats_on_url = 'https://engine-d.test/whats-on/';
update public.crawl_sites set engine = 'frontier', status = 'ready', archive_url = 'https://archive.engine-e.test/past/' where whats_on_url = 'https://engine-e.test/whats-on/';
update public.crawl_sources set collection_enabled = true, paused_reason = null where source_key = 'official';

select ok(not has_function_privilege('authenticated', 'public.crawl_setup_work(integer)', 'execute'), 'members cannot list setup work');
select ok(not has_function_privilege('authenticated', 'public.flag_official_site_repair(uuid,text)', 'execute'), 'members cannot flag repairs');
select ok(not has_function_privilege('authenticated', 'public.official_sites_to_seed(integer)', 'execute'), 'members cannot list sites to seed');
select ok(not has_function_privilege('authenticated', 'public.seed_official_site(uuid,text,text,boolean)', 'execute'), 'members cannot seed sites');

set local role service_role;
select is((select jsonb_agg(w->>'name' order by w->>'name') from jsonb_array_elements(public.crawl_work(100)) w
  where w->>'name' in ('Pending Frontier','Flagged Frontier','Attention Frontier','Legacy Pending','Ready Frontier','No Site')),
  '["Legacy Pending", "No Site"]'::jsonb, 'the legacy lane skips frontier sites and keeps venues with no site');
select is((select jsonb_agg(w->>'name' order by w->>'name') from jsonb_array_elements(public.crawl_setup_work(100)) w),
  '["Flagged Frontier", "Pending Frontier"]'::jsonb, 'the setup lane takes a pending and a repair-flagged frontier site, not needs_attention or legacy');

-- Flagging.
reset role;

create function pg_temp.task_for(site_url text) returns uuid language sql as $$
  select t.id from public.crawl_tasks t join public.crawl_generations g on g.id = t.generation_id
  join public.crawl_sites s on s.id = g.site_id where s.whats_on_url = site_url order by t.id limit 1;
$$;

-- Seeding: the ready frontier site is listed once, and not after it is seeded.
set local role service_role;
select is((select jsonb_agg(x->>'whats_on_url') from jsonb_array_elements(public.official_sites_to_seed(25)) x),
  '["https://engine-e.test/whats-on/"]'::jsonb, 'the ready frontier site is listed (the flagged one is not)');
select lives_ok($$select public.seed_official_site((select id from public.crawl_sites where whats_on_url = 'https://engine-e.test/whats-on/'),
  'https://engine-e.test/whats-on/', 'https://archive.engine-e.test/past/', false)$$, 'a site is seeded');
select is(public.official_sites_to_seed(25), '[]'::jsonb, 'a seeded site is no longer listed');
reset role;
select is((select count(*) from public.crawl_tasks t join public.crawl_generations g on g.id = t.generation_id
  join public.crawl_sites s on s.id = g.site_id where s.whats_on_url = 'https://engine-e.test/whats-on/' and t.stage = 'venue'), 2::bigint,
  'the what''s-on page and the archive page are both venue tasks');

-- Flagging works for frontier sites only and keeps the first timestamp.
update public.crawl_sites set repair_requested_at = null, repair_reason = null where whats_on_url = 'https://engine-e.test/whats-on/';
set local role service_role;
select is(public.flag_official_site_repair(pg_temp.task_for('https://engine-e.test/whats-on/'), 'extraction: junk_titles'), true, 'a frontier site is flagged');
reset role;
select is((select repair_reason from public.crawl_sites where whats_on_url = 'https://engine-e.test/whats-on/'), 'extraction: junk_titles', 'with the reason');
update public.crawl_sites set repair_requested_at = '2026-01-01' where whats_on_url = 'https://engine-e.test/whats-on/';
set local role service_role;
select public.flag_official_site_repair(pg_temp.task_for('https://engine-e.test/whats-on/'), 'second');
reset role;
select is((select repair_requested_at::date from public.crawl_sites where whats_on_url = 'https://engine-e.test/whats-on/'), '2026-01-01'::date, 'the first timestamp is kept');
update public.crawl_sites set engine = 'legacy' where whats_on_url = 'https://engine-e.test/whats-on/';
update public.crawl_sites set repair_requested_at = null where whats_on_url = 'https://engine-e.test/whats-on/';
set local role service_role;
select is(public.flag_official_site_repair(pg_temp.task_for('https://engine-e.test/whats-on/'), 'legacy'), false, 'a legacy site is never flagged');
reset role;
update public.crawl_sites set engine = 'frontier' where whats_on_url = 'https://engine-e.test/whats-on/';

-- Seeding clears the flag; a refresh makes a new current generation and keeps the old tasks.
update public.crawl_sites set repair_requested_at = now(), repair_reason = 'again' where whats_on_url = 'https://engine-e.test/whats-on/';
select count(*) as old_tasks from public.crawl_tasks \gset
set local role service_role;
select public.seed_official_site((select id from public.crawl_sites where whats_on_url = 'https://engine-e.test/whats-on/'),
  'https://engine-e.test/whats-on/', 'https://archive.engine-e.test/past/', true);
reset role;
select is((select count(*) from public.crawl_generations g join public.crawl_sites s on s.id = g.site_id
  where s.whats_on_url = 'https://engine-e.test/whats-on/' and g.is_current), 1::bigint, 'one current generation');
select is((select count(*) from public.crawl_generations g join public.crawl_sites s on s.id = g.site_id
  where s.whats_on_url = 'https://engine-e.test/whats-on/'), 2::bigint, 'the old generation is kept');
select ok((select repair_requested_at is null and repair_reason is null from public.crawl_sites where whats_on_url = 'https://engine-e.test/whats-on/'), 'seeding clears the repair flag');
select ok((select count(*) from public.crawl_tasks) >= :old_tasks, 'old tasks are kept');

select * from finish();
rollback;
