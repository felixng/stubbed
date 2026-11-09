begin;
select no_plan();
-- 20261109010000: venue aliases are stored, searched, and used by the crawler.

create function pg_temp.match(external text, label text, extra jsonb default '{}')
returns public.crawl_source_entities language plpgsql as $$
declare src uuid := (select id from public.crawl_sources where source_key = 'london_theatre');
declare row public.crawl_source_entities;
begin
  perform public.crawl_match_venue(src, jsonb_build_object('observation_kind', 'venue', 'external_key', external,
    'name', label, 'city', 'London', 'country', 'GB') || extra, null);
  select * into row from public.crawl_source_entities where source_id = src and entity_kind = 'venue' and external_key = external;
  return row;
end;
$$;
create function pg_temp.as_admin_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000447', 'a447@example.com'),
  ('dddddddd-0000-0000-0000-000000000447', 'd447@example.com');
insert into public.venues (id, name, city, country, osm_id, lat, lng) values
  ('a4470000-0000-0000-0000-000000000001', 'Alias Noel Theatre', 'London', 'GB', 'way/9001', 51.5100, -0.1270),
  ('a4470000-0000-0000-0000-000000000002', 'Alias Shaftesbury Theatre', 'London', 'GB', 'way/9002', 51.5150, -0.1300),
  ('a4470000-0000-0000-0000-000000000003', 'Alias Twin One', 'London', 'GB', 'way/9003', 51.5300, -0.1500),
  ('a4470000-0000-0000-0000-000000000004', 'Alias Twin Two', 'London', 'GB', 'way/9004', 51.5301, -0.1501),
  ('a4470000-0000-0000-0000-000000000005', 'Alias Merged Away', 'London', 'GB', 'way/9005', 51.4000, -0.3000),
  ('a4470000-0000-0000-0000-000000000006', 'Alias Survivor', 'London', 'GB', 'way/9006', 51.4001, -0.3001);
insert into public.venue_aliases (venue_id, alias, kind, source) values
  ('a4470000-0000-0000-0000-000000000001', 'Alias Albery Theatre', 'former', 'playbill');

-- Uniqueness and RLS
select throws_ok($$insert into public.venue_aliases (venue_id, alias, kind, source)
  values ('a4470000-0000-0000-0000-000000000001', 'ALIAS albery  theatre!', 'former', 'admin')$$, '23505', null,
  'the same alias twice, however capitalised or punctuated, is rejected');
select lives_ok($$insert into public.venue_aliases (venue_id, alias, kind, source)
  values ('a4470000-0000-0000-0000-000000000002', 'Alias Albery Theatre', 'former', 'admin')$$,
  'the same alias on another venue is fine');

set local role anon;
select is((select count(*) from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000001'), 1::bigint, 'everyone reads aliases');
select throws_ok($$insert into public.venue_aliases (venue_id, alias, kind, source)
  values ('a4470000-0000-0000-0000-000000000001', 'Anon Name', 'alternative', 'admin')$$, '42501', null, 'anon cannot write');
reset role;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000447', 'role', 'authenticated')::text, true);
select throws_ok($$insert into public.venue_aliases (venue_id, alias, kind, source)
  values ('a4470000-0000-0000-0000-000000000001', 'User Name', 'alternative', 'admin')$$, '42501', null, 'a signed-in user cannot write');
reset role;
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000447');
select lives_ok($$insert into public.venue_aliases (venue_id, alias, kind, source)
  values ('a4470000-0000-0000-0000-000000000001', 'Admin Name', 'alternative', 'admin')$$, 'an admin can write');
reset role;

-- Search
select is((select id from public.search_venues('Alias Albery') limit 1), 'a4470000-0000-0000-0000-000000000001'::uuid,
  'search finds a venue by a former name');
select is((select count(*) from public.search_venues('Alias Albery') where id = 'a4470000-0000-0000-0000-000000000001'), 1::bigint,
  'and returns it once');
select is((select name from public.search_venues('Alias Albery') where id = 'a4470000-0000-0000-0000-000000000001'),
  'Alias Noel Theatre', 'under its current name');

-- Matching
set local role service_role;
select is((pg_temp.match('src-spelling', 'Alias Noel',
  '{"lat":51.5101,"lng":-0.1271,"geocode":{"provider":"geocoded:postcodes.io"}}')).venue_id,
  'a4470000-0000-0000-0000-000000000001'::uuid, 'a loose source spelling links with location evidence');
reset role;
select is((select kind from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000001' and search_text = 'alias noel'),
  'source_spelling', 'and is recorded as a source spelling');
select is((select source from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000001' and search_text = 'alias noel'),
  'london_theatre', 'from its source');

set local role service_role;
select is((pg_temp.match('former', 'Alias Brand New',
  '{"former_names":["Alias Albery Theatre"],"lat":51.5101,"lng":-0.1271,"geocode":{"provider":"geocoded:postcodes.io"}}')).venue_id,
  'a4470000-0000-0000-0000-000000000001'::uuid, 'a former name that is an alias links with location evidence');
select is((pg_temp.match('former-far', 'Alias Elsewhere',
  '{"former_names":["Alias Albery Theatre"],"lat":51.7000,"lng":-0.6000,"geocode":{"provider":"geocoded:postcodes.io"}}')).resolution_status,
  'ambiguous', 'a former name far away never links');
reset role;
select is((select count(*) from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000001' and search_text = 'alias brand new'),
  1::bigint, 'a linked entity records the source name');
select is((select kind from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000001' and search_text = 'alias albery theatre'),
  'former', 'the former name stays a former name');

-- Rename in the same building: one candidate within 100 m links with a review item and creates no venue
set local role service_role;
select is((pg_temp.match('rename', 'Alias Judi Dench Theatre', '{"lat":51.51501,"lng":-0.13001}')).venue_id,
  'a4470000-0000-0000-0000-000000000002'::uuid, 'a rename links to the one venue in the building');
select is((select review_reason from public.crawl_source_entities where external_key = 'rename'), 'possible_rename', 'with a review item');
reset role;
select is((select count(*) from public.venues where name = 'Alias Judi Dench Theatre'), 0::bigint, 'and creates no venue');
select is((select count(*) from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000002' and search_text = 'alias judi dench theatre'),
  1::bigint, 'and keeps the name as an alias');

-- Two nearby candidates never auto-link
set local role service_role;
select isnt((pg_temp.match('twins', 'Alias Mystery Theatre', '{"lat":51.53005,"lng":-0.15005}')).resolution_status, 'linked',
  'two venues in range are not auto-linked');
select is((select count(*) from public.venues where name = 'Alias Mystery Theatre'), 0::bigint, 'and no venue is created');
reset role;

-- Merge
select public.merge_venues('a4470000-0000-0000-0000-000000000005', 'a4470000-0000-0000-0000-000000000006');
select is((select kind from public.venue_aliases where venue_id = 'a4470000-0000-0000-0000-000000000006' and search_text = 'alias merged away'),
  'alternative', 'a merge keeps the merged venue''s name as an alias');
select is((select id from public.search_venues('Alias Merged Away') limit 1), 'a4470000-0000-0000-0000-000000000006'::uuid,
  'and search finds the survivor by it');

select * from finish();
rollback;
