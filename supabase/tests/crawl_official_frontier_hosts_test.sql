begin;
select no_plan();

insert into public.crawl_sites (id, whats_on_url, archive_url)
values ('b5420000-0000-0000-0000-000000000001', 'https://www.main-site.test/whats-on/', 'https://archive-site.test/past/');
update public.crawl_sources set collection_enabled = true, paused_reason = null where source_key = 'official';

set local role service_role;
select lives_ok($$select public.start_crawl_generation('official', 'b5420000-0000-0000-0000-000000000001', 'venue',
  'https://www.main-site.test/whats-on/', 'b5420000-0000-0000-0000-000000000001')$$, 'the what''s-on host is accepted');
select lives_ok($$select public.enqueue_crawl_task((select id from public.crawl_generations where site_id = 'b5420000-0000-0000-0000-000000000001'),
  'venue', 'https://archive-site.test/past/page/2/')$$, 'the archive host is accepted');
select lives_ok($$select public.enqueue_crawl_task((select id from public.crawl_generations where site_id = 'b5420000-0000-0000-0000-000000000001'),
  'venue', 'https://www.archive-site.test/past/page/3/')$$, 'the archive host with www is accepted');
select lives_ok($$select public.enqueue_crawl_task((select id from public.crawl_generations where site_id = 'b5420000-0000-0000-0000-000000000001'),
  'venue', 'https://main-site.test/whats-on/page/2/')$$, 'the what''s-on host without www is accepted');
select throws_ok($$select public.enqueue_crawl_task((select id from public.crawl_generations where site_id = 'b5420000-0000-0000-0000-000000000001'),
  'venue', 'https://evil.test/whats-on/')$$, '22023', null, 'an unrelated host is refused');

select * from finish();
rollback;
