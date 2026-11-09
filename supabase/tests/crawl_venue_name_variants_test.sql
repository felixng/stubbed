begin;
select no_plan();
-- 20261109002000: venue name variants and former names link only with location evidence.

create function pg_temp.match(external text, label text, extra jsonb default '{}')
returns public.crawl_source_entities language plpgsql as $$
declare src uuid := (select id from public.crawl_sources where source_key = 'playbill');
declare row public.crawl_source_entities;
begin
  perform public.crawl_match_venue(src, jsonb_build_object('observation_kind', 'venue', 'external_key', external,
    'name', label, 'city', 'London', 'country', 'GB') || extra, null);
  select * into row from public.crawl_source_entities where source_id = src and entity_kind = 'venue' and external_key = external;
  return row;
end;
$$;

insert into public.venues (id, name, city, country, osm_id, lat, lng) values
  ('a4480000-0000-0000-0000-000000000001', 'Fixture Garrick', 'London', 'GB', 'way/1', 51.5100, -0.1270),
  ('a4480000-0000-0000-0000-000000000002', '@fixtureplace', 'London', 'GB', 'node/2', 51.5150, -0.1300),
  ('a4480000-0000-0000-0000-000000000003', 'Oldname Theatre', 'London', 'GB', 'way/3', 51.5200, -0.1400),
  ('a4480000-0000-0000-0000-000000000004', 'Fixture Lyric', 'London', 'GB', 'way/4', 51.5300, -0.1500),
  ('a4480000-0000-0000-0000-000000000005', 'Faraway', 'London', 'GB', 'way/5', 51.4000, -0.3000);

set local role service_role;
select is(public.crawl_venue_name_key('Wyndham''s Theatre'), public.crawl_venue_name_key('Wyndham''s'), 'a trailing Theatre is ignored');
select is(public.crawl_venue_name_key('Soho Place'), public.crawl_venue_name_key('@sohoplace'), 'a leading @ and spacing are ignored');
select is(public.crawl_venue_name_key('The Bridge Theatre'), 'bridge', 'a leading The is ignored');
select isnt(public.crawl_venue_name_key('Lyric Hammersmith'), public.crawl_venue_name_key('Lyric Theatre'), 'a different word is a different name');

select is((pg_temp.match('garrick', 'Fixture Garrick Theatre',
  '{"lat":51.5101,"lng":-0.1271,"geocode":{"provider":"geocoded:postcodes.io"}}')).venue_id,
  'a4480000-0000-0000-0000-000000000001'::uuid, '"X Theatre" links to "X" when the point is within range');
select is((pg_temp.match('soho', 'Fixture Place', '{"lat":51.5151,"lng":-0.1301,"geocode":{"provider":"geocoded:nominatim"}}')).venue_id,
  'a4480000-0000-0000-0000-000000000002'::uuid, '"Fixture Place" links to "@fixtureplace" when the point is within range');
select is((pg_temp.match('renamed', 'Newname Theatre',
  '{"former_names":["Oldname Theatre"],"lat":51.5201,"lng":-0.1401,"geocode":{"provider":"geocoded:postcodes.io"}}')).venue_id,
  'a4480000-0000-0000-0000-000000000003'::uuid, 'a former name links to the existing venue when the point is within range');
select is((pg_temp.match('far', 'Faraway Theatre', '{"lat":51.6000,"lng":-0.5000,"geocode":{"provider":"geocoded:postcodes.io"}}')).resolution_status,
  'ambiguous', 'a matching name far away is held, not linked');
select is((select count(*) from public.venues where name = 'Faraway Theatre'), 0::bigint, 'and no duplicate venue is created for it');
select is((pg_temp.match('nameonly', 'Fixture Lyric Theatre')).resolution_status, 'ambiguous', 'a name variant with no location never links');
select is((pg_temp.match('hammersmith', 'Fixture Lyric Hammersmith',
  '{"lat":51.5301,"lng":-0.1501,"geocode":{"provider":"geocoded:postcodes.io"}}')).resolution_status,
  'linked', 'a different name at the same spot is a rename candidate (#447): linked, flagged, not duplicated');
select is((select review_reason from public.crawl_source_entities where external_key = 'hammersmith'), 'possible_rename',
  'and flagged for review');

select * from finish();
rollback;
