begin;
select no_plan();

insert into auth.users (id, email) values
  ('d5630000-0000-0000-0000-000000000001', 'link-member@example.com'),
  ('d5630000-0000-0000-0000-000000000002', 'link-admin@example.com');

select set_config('request.jwt.claims', '{"sub":"d5630000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.admin_add_crawl_link('https://example.test/shows')$$, '42501', null, 'a non-admin cannot add a link');
select is((select count(*) from public.crawl_link_requests), 0::bigint, 'and reads no requests');
reset role;

select set_config('request.jwt.claims', '{"sub":"d5630000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select lives_ok($$select public.admin_add_crawl_link('  HTTPS://Www.Example.test/shows/london?utm_source=x&page=2&fbclid=abc#top  ')$$, 'an admin adds a link');
select is((select url from public.crawl_link_requests), 'https://www.example.test/shows/london?page=2', 'it is cleaned: host lower-cased, tracking and fragment removed');
select is((select status || ':' || host || ':' || (requested_by = 'd5630000-0000-0000-0000-000000000002')::text from public.crawl_link_requests), 'new:www.example.test:true', 'it starts as new, with host and requester');
select throws_ok($$select public.admin_add_crawl_link('https://www.example.test/shows/london?page=2')$$, '23505', null, 'the same link is refused for a day');
select lives_ok($$select public.admin_add_crawl_link('https://www.example.test')$$, 'a bare host gets a path');
select is((select count(*) from public.crawl_link_requests where url = 'https://www.example.test/'), 1::bigint, 'a bare host becomes /');

select throws_ok($$select public.admin_add_crawl_link('ftp://example.test/x')$$, '22023', null, 'ftp is refused');
select throws_ok($$select public.admin_add_crawl_link('example.test/x')$$, '22023', null, 'a link without a scheme is refused');
select throws_ok($$select public.admin_add_crawl_link('http://localhost/x')$$, '22023', null, 'localhost is refused');
select throws_ok($$select public.admin_add_crawl_link('http://192.168.1.5/x')$$, '22023', null, 'an IP address is refused');
select throws_ok($$select public.admin_add_crawl_link('http://printer.local/x')$$, '22023', null, 'a .local name is refused');
select throws_ok($$select public.admin_add_crawl_link('http://intranet/x')$$, '22023', null, 'a name without a dot is refused');
select throws_ok($$select public.admin_add_crawl_link('https://user:pw@example.test/x')$$, '22023', null, 'credentials are refused');
select throws_ok($$select public.admin_add_crawl_link('https://example.test:8080/x')$$, '22023', null, 'a port is refused');
select throws_ok($$select public.admin_add_crawl_link('https://[::1]/x')$$, '22023', null, 'an IPv6 literal is refused');
select throws_ok($$select public.admin_add_crawl_link(null)$$, '22023', null, 'null is refused');
reset role;

select ok(not has_table_privilege('authenticated', 'public.crawl_link_requests', 'insert'), 'members cannot insert directly');
select ok(not has_table_privilege('anon', 'public.crawl_link_requests', 'select'), 'anonymous callers read nothing');

select * from finish();
rollback;
