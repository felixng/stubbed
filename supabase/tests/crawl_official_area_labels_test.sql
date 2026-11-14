begin;
select no_plan();

insert into auth.users (id, email) values ('d5460000-0000-0000-0000-000000000001', 'labels-admin@example.com');
insert into public.crawl_sites (id, whats_on_url) values ('b5460000-0000-0000-0000-000000000001', 'https://www.label-site.test/whats-on/');
update public.crawl_sources set collection_enabled = true, paused_reason = null where source_key in ('official', 'london_theatre');

set local role service_role;
select public.start_crawl_generation('official', 'b5460000-0000-0000-0000-000000000001', 'venue', 'https://www.label-site.test/whats-on/', 'b5460000-0000-0000-0000-000000000001');
select public.start_crawl_generation('london_theatre', 'venue-directory', 'directory', 'https://www.londontheatre.co.uk/venues');
reset role;

select set_config('request.jwt.claims', '{"sub":"d5460000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select is((public.crawl_source_summary()->'official'->'areas'->0)->>'label', 'label-site.test', 'an official area is labelled with its site host, without www.');
select is((public.crawl_source_summary()->'london_theatre'->'areas'->0) ? 'label', true, 'aggregate areas carry the key');
select is((public.crawl_source_summary()->'london_theatre'->'areas'->0)->>'label', null, 'and it is null');
select is((select s->>'label' from jsonb_array_elements(public.crawl_source_progress('official')->'scans') s limit 1), 'label-site.test', 'the progress area list carries the label too');
reset role;

select * from finish();
rollback;
