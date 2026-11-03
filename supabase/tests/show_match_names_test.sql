-- Every name a show goes by, for matching printed text (#333).
begin;
select no_plan();

insert into public.shows (id, title, type, aliases) values
  ('5a000333-0000-0000-0000-000000000101', 'Zorblatt Revelations', 'musical', array['Zorbs']),
  ('5a000333-0000-0000-0000-000000000102', 'Quindle', 'play', '{}');
insert into public.show_aliases (show_id, alias) values
  ('5a000333-0000-0000-0000-000000000101', 'Glorpo');

select is(
  (select array_agg(name order by name) from public.show_match_names(array['5a000333-0000-0000-0000-000000000101']::uuid[])),
  array['Glorpo', 'Zorblatt Revelations', 'Zorbs'],
  'a show returns its title, its Wikidata alias and a taught nickname');

select is(
  (select array_agg(name) from public.show_match_names(array['5a000333-0000-0000-0000-000000000102']::uuid[])),
  array['Quindle'],
  'a show with no aliases returns just its title');

select is(
  (select count(*)::int from public.show_match_names(array['5a000333-0000-0000-0000-000000000101', '5a000333-0000-0000-0000-000000000102']::uuid[])),
  4, 'several shows return all their names');

select is((select count(*)::int from public.show_match_names('{}'::uuid[])), 0, 'no ids, no names');

select * from finish();
rollback;
