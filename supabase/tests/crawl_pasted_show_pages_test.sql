begin;
select no_plan();

select is((select collection_enabled::text || ':' || publication_enabled::text from public.crawl_sources where source_key = 'web_links'), 'true:false',
  'the pasted-links source reads on but does not publish until the owner says so');
select ok(not has_function_privilege('authenticated', 'public.queue_pasted_show_page(uuid,text)', 'execute'), 'members cannot queue a page');
select ok(not has_function_privilege('authenticated', 'public.finish_crawl_link_request(uuid,text,text,text,jsonb)', 'execute'), 'members cannot finish a request');
select ok(not has_function_privilege('authenticated', 'public.crawl_link_requests_to_process(integer)', 'execute'), 'members cannot list requests to process');

-- Hosts added by pasting survive a sync that states none (hosts null), and a stated list replaces them.
update public.crawl_sources set allowed_hosts = array['a.test', 'www.a.test'] where source_key = 'web_links';
select public.sync_crawl_source('web_links', 'Pasted links', 'aggregate', null, 5000, 1, 'web-links-v1');
select is((select allowed_hosts from public.crawl_sources where source_key = 'web_links'), array['a.test', 'www.a.test'], 'a sync with no hosts keeps the pasted ones');
select public.sync_crawl_source('web_links', 'Pasted links', 'aggregate', array['b.test'], 5000, 1, 'web-links-v1');
select is((select allowed_hosts from public.crawl_sources where source_key = 'web_links'), array['b.test'], 'a sync with hosts replaces them');

-- A pasted page goes first, even before its first read.
insert into public.crawl_link_requests (id, url, host) values ('c5640000-0000-0000-0000-000000000001', 'https://c.test/show/one', 'c.test'),
  ('c5640000-0000-0000-0000-000000000002', 'https://c.test/show/two', 'c.test');
select public.queue_pasted_show_page('c5640000-0000-0000-0000-000000000001', 'web_links');
select is((select priority from public.crawl_tasks where canonical_url = 'https://c.test/show/one'), 3, 'a pasted page has the top priority');
select public.queue_pasted_show_page('c5640000-0000-0000-0000-000000000002', 'web_links');
update public.crawl_tasks set priority = 0 where canonical_url = 'https://c.test/show/one';
select is((public.claim_due_crawl_task('web_links', 'all', null, 'w', 'web-links-v1'))->>'canonical_url', 'https://c.test/show/two', 'the claim takes the pasted page ahead of an ordinary one');
select is((select status || ':' || kind from public.crawl_link_requests where id = 'c5640000-0000-0000-0000-000000000002'), 'done:show_page', 'the request is marked done');

select * from finish();
rollback;
