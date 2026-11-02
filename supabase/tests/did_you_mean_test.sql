-- "Did you mean…?" before adding a show or venue (#146).
begin;
select no_plan();

-- Tidy rules.
select is(public.tidy_show_title('  HAMILTON - Broadway Premium Orchestra '), 'Hamilton', 'ticket part and caps removed');
select is(public.tidy_show_title('The Phantom of the Opera (Broadway)'), 'The Phantom of the Opera', '"(Broadway)" removed');
select is(public.tidy_show_title('Mamma Mia! - UK Tour'), 'Mamma Mia!', 'tour part removed');
select is(public.tidy_show_title('Back to the Future: The Musical'), 'Back to the Future', '": The Musical" removed');
select is(public.tidy_show_title('Hadestown | Matinee'), 'Hadestown', 'matinee part removed');
select is(public.tidy_show_title('Wicked, Stalls Row F'), 'Wicked', 'seat part removed');
select is(public.tidy_show_title('Hamilton: An American Musical'), 'Hamilton: An American Musical', 'a real subtitle stays');
select is(public.tidy_show_title('Harry Potter and the Cursed Child - Parts One and Two'),
  'Harry Potter and the Cursed Child - Parts One and Two', 'a part that isn''t a ticket stays');
select is(public.tidy_show_title('MJ'), 'MJ', 'short all-caps titles stay');
select is(public.tidy_show_title('SIX'), 'SIX', 'SIX stays');
select is(public.tidy_show_title('WHAT''S NEW PUSSYCAT'), 'What''s New Pussycat', 'caps fixed without "What''S"');
select is(public.tidy_show_title('Les   Misérables'), 'Les Misérables', 'spaces collapsed, accents kept');
select is(public.tidy_show_title(' - '), null, 'nothing left is null');

-- An empty catalogue finds nothing and nothing breaks.
select is((select count(*)::int from public.similar_shows('Zzqx Nothing Here')), 0, 'no match, no rows');
select is((select count(*)::int from public.similar_shows('a')), 0, 'too short to compare');

insert into public.shows (id, title, type) values
  ('5a000146-0000-0000-0000-000000000001', 'Les Misérables', 'musical'),
  ('5a000146-0000-0000-0000-000000000002', 'Operation Quillmeat', 'musical'),
  ('5a000146-0000-0000-0000-000000000003', 'Quillmeat Unrelated Extravaganza Revue', 'play');
select is((select title from public.shows where id = '5a000146-0000-0000-0000-000000000001'), 'Les Misérables',
  'a tidy title is unchanged on insert');
insert into public.shows (id, title, type) values ('5a000146-0000-0000-0000-000000000004', 'GLORBNIK - Premium Stalls', 'play');
select is((select title from public.shows where id = '5a000146-0000-0000-0000-000000000004'), 'Glorbnik',
  'user-added titles are tidied on insert');
insert into public.shows (id, title, type, wikidata_id) values ('5a000146-0000-0000-0000-000000000005', 'KEEP ME (Broadway)', 'play', 'Q146005');
select is((select title from public.shows where id = '5a000146-0000-0000-0000-000000000005'), 'KEEP ME (Broadway)',
  'catalogue titles are left as Wikidata has them');

select is((select id from public.similar_shows('Les Miserables (Broadway)') limit 1),
  '5a000146-0000-0000-0000-000000000001'::uuid, 'a suffixed, unaccented title finds the show');
select ok((select same from public.similar_shows('LES MISERABLES - Dress Circle') limit 1),
  'a ticket title is the same show');
select is((select id from public.similar_shows('Les Miserbles') limit 1),
  '5a000146-0000-0000-0000-000000000001'::uuid, 'a typo finds the show');
select ok(not (select same from public.similar_shows('Les Miserbles') limit 1), 'a typo is offered, not assumed');
select is((select id from public.similar_shows('Quillmeat') limit 1),
  '5a000146-0000-0000-0000-000000000002'::uuid, 'a short name finds the full title');
select ok((select count(*) from public.similar_shows('Quillmeat')) <= 3, 'at most three');

insert into public.show_aliases (show_id, alias) values ('5a000146-0000-0000-0000-000000000001', 'Lez Miz');
select ok((select same from public.similar_shows('lez miz') where id = '5a000146-0000-0000-0000-000000000001'),
  'a nickname counts as the same show');

-- Venues.
insert into public.venues (id, name, city, country, lat, lng) values
  ('5b000146-0000-0000-0000-000000000001', 'Wyndham''s Theatre', 'London', 'GB', 51.5115, -0.1281),
  ('5b000146-0000-0000-0000-000000000002', 'Palace Theatre', 'Manchester', 'GB', 53.4740, -2.2420),
  ('5b000146-0000-0000-0000-000000000003', 'Little Grebe Hall', 'Leeds', 'GB', null, null);

select ok((select same from public.similar_venues('Wyndhams Theater', 51.5116, -0.1282) limit 1),
  'a respelt name next door is the same venue');
select is((select count(*)::int from public.similar_venues('Palace Theatre', 51.5130, -0.1300)), 0,
  'a namesake 260 km away is not offered');
select is((select count(*)::int from public.similar_venues('Palace Theatre')), 1,
  'without a location it is offered');
select ok(not (select same from public.similar_venues('Palace Theatre') limit 1),
  'without a location or city it is not assumed');
select ok((select same from public.similar_venues('Little Grebe Hall', null, null, 'leeds') limit 1),
  'without locations, the same name in the same city is the same venue');
select ok((select not same from public.similar_venues('Wyndham', 51.5116, -0.1282) limit 1),
  'a shorter name nearby is offered, not assumed');

select * from finish();
rollback;
