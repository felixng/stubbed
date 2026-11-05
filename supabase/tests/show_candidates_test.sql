-- Show candidates (#366): the pull never touches shows, admins review, a
-- sample's score gates the bulk add, and added names become searchable.
begin;
select no_plan();

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'admin@example.com');

-- One show we already hold.
insert into public.shows (id, title, type, wikidata_id, verified) values
  ('5a000000-0000-0000-0000-000000000001', 'Zorbo Held Musical', 'musical', 'Q9400001', true);

-- The pull: three new names, one already in the catalogue, one repeated name.
select pg_temp.as_postgres();
select is((select public.load_show_candidates('[
  {"wikidata_id":"Q9400010","title":"Zorbo Alpha","type":"play","first_performed":1999,"aliases":["ZA"]},
  {"wikidata_id":"Q9400011","title":"Zorbo Beta","type":"musical","first_performed":2001,"aliases":[]},
  {"wikidata_id":"Q9400012","title":"ZORBO GAMMA: THE MUSICAL","type":"musical","first_performed":null,"aliases":[]},
  {"wikidata_id":"Q9400001","title":"Zorbo Held Musical","type":"musical","first_performed":1990,"aliases":[]}
]'::jsonb)), '{"inserted": 3, "seen_again": 0, "already_in_catalogue": 1}'::jsonb, 'the pull adds new names and skips held ones');
select is((select count(*) from public.shows where title like 'Zorbo %'), 1::bigint, 'the pull did not touch shows');
select is((select count(*) from public.search_shows('Zorbo Alpha')), 0::bigint, 'candidates are not in show search');
select is((select public.load_show_candidates('[{"wikidata_id":"Q9400010","title":"Zorbo Alpha Renamed","type":"play","first_performed":1999,"aliases":[]}]'::jsonb)),
  '{"inserted": 0, "seen_again": 1, "already_in_catalogue": 0}'::jsonb, 'a second pull counts it again');
select is((select seen_count || ':' || title from public.show_candidates where source_ref = 'Q9400010'), '2:Zorbo Alpha Renamed', 'and refreshes a pending one');
select ok(not has_function_privilege('authenticated', 'public.load_show_candidates(jsonb)', 'execute'), 'users cannot run the pull');
select ok(has_function_privilege('service_role', 'public.load_show_candidates(jsonb)', 'execute'), 'the service role can');

-- Non-admins.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is((select count(*) from public.show_candidates), 0::bigint, 'a user sees no candidates');
select throws_ok($$select * from public.admin_list_candidates()$$, '42501', null, 'a user cannot list');
select throws_ok($$select * from public.admin_candidate_totals()$$, '42501', null, 'or total');
select throws_ok($$select public.admin_add_candidate(gen_random_uuid())$$, '42501', null, 'or add');
select throws_ok($$select public.admin_candidate_same_as(gen_random_uuid(), '5a000000-0000-0000-0000-000000000001')$$, '42501', null, 'or link');
select throws_ok($$select public.admin_reject_candidate(gen_random_uuid())$$, '42501', null, 'or reject');
select throws_ok($$select public.admin_start_candidate_sample()$$, '42501', null, 'or sample');
select throws_ok($$select public.admin_add_candidates_bulk(null, null, gen_random_uuid())$$, '42501', null, 'or bulk add');

-- Admin review.
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select row(candidates, pending, added, same, rejected)::text from public.admin_candidate_totals('zorbo')), '(3,3,0,0,0)', 'totals');
select is((select count(*) from public.admin_list_candidates('zorbo gamma')), 1::bigint, 'search by name');
select is((select count(*) from public.admin_list_candidates('zorbo', 'play')), 1::bigint, 'filter by type');
select is((select match_title from public.admin_list_candidates('zorbo beta')), null, 'no close match for a new name');

-- Add one: tidied, Wikidata id kept, searchable.
select lives_ok($$select public.admin_add_candidate((select id from public.show_candidates where source_ref = 'Q9400012'))$$, 'add a candidate');
select pg_temp.as_postgres();
select is((select (title, type::text, verified, wikidata_id)::text from public.shows where wikidata_id = 'Q9400012'),
  '("Zorbo Gamma",musical,t,Q9400012)', 'it is tidied like a typed-in show and keeps its Wikidata id');
select is((select count(*) from public.search_shows('Zorbo Gamma')), 1::bigint, 'and is findable by search');
select is((select status from public.show_candidates where source_ref = 'Q9400012'), 'added', 'marked added');
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_add_candidate((select id from public.show_candidates where source_ref = 'Q9400012'))$$, '22023', null, 'not twice');

-- Same as: linked, with the name saved as a nickname.
select lives_ok($$select public.admin_candidate_same_as((select id from public.show_candidates where source_ref = 'Q9400011'), '5a000000-0000-0000-0000-000000000001')$$, 'link as the same show');
select pg_temp.as_postgres();
select ok(exists (select 1 from public.show_aliases where show_id = '5a000000-0000-0000-0000-000000000001' and alias = 'Zorbo Beta'), 'its name is now a nickname');
select is((select count(*) from public.search_shows('Zorbo Beta')), 1::bigint, 'searching it finds the held show');
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_candidate_same_as((select id from public.show_candidates where source_ref = 'Q9400010'), gen_random_uuid())$$, 'P0002', null, 'an unknown show');

-- Reject.
select lives_ok($$select public.admin_reject_candidate((select id from public.show_candidates where source_ref = 'Q9400010'))$$, 'reject one');
select throws_ok($$select public.admin_reject_candidate((select id from public.show_candidates where source_ref = 'Q9400010'))$$, 'P0002', null, 'only pending ones');
select is((select row(pending, added, same, rejected)::text from public.admin_candidate_totals('zorbo')), '(0,1,1,1)', 'totals follow the decisions');

-- Sample and bulk: 60 more candidates, plus a repeat of a held title and a pair of twins.
select pg_temp.as_postgres();
select public.load_show_candidates((select jsonb_agg(jsonb_build_object('wikidata_id', 'Q95' || lpad(i::text, 5, '0'), 'title', 'Plink Sample ' || i, 'type', 'play', 'first_performed', 2000, 'aliases', '[]'::jsonb)) from generate_series(1, 60) i));
select public.load_show_candidates('[
  {"wikidata_id":"Q9500101","title":"The Zorbo Held Musical","type":"musical","first_performed":1990,"aliases":[]},
  {"wikidata_id":"Q9500102","title":"Plink Twin","type":"play","first_performed":2000,"aliases":[]},
  {"wikidata_id":"Q9500103","title":"Plink Twin (play)","type":"play","first_performed":2000,"aliases":[]}]'::jsonb);
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select throws_ok($$select public.admin_start_candidate_sample('nothing matches this', null, 10)$$, 'P0002', null, 'no sample from an empty group');
create temp table _s as select public.admin_start_candidate_sample('plink sample', null, 25) as id;
grant all on _s to authenticated;
select is((public.admin_candidate_sample_score((select id from _s)))->>'size', '25', 'a sample of 25');
select throws_ok($$select public.admin_add_candidates_bulk('plink sample', null, (select id from _s))$$, '22023', null, 'bulk needs the sample reviewed first');

-- Review it: 21 real shows, 4 not shows (84%).
do $$
declare r record; i int := 0;
begin
  for r in select id from public.show_candidates where sample_id = (select id from _s) order by id loop
    i := i + 1;
    if i <= 21 then perform public.admin_add_candidate(r.id); else perform public.admin_reject_candidate(r.id); end if;
  end loop;
end $$;
select is((public.admin_candidate_sample_score((select id from _s)))->>'share', '0.8400', 'the score is the share right');
select throws_ok($$select public.admin_add_candidates_bulk('plink sample', null, (select id from _s))$$, '22023', null, '84% is below the 95% bar');
select lives_ok($$select public.admin_add_candidates_bulk('plink sample', null, (select id from _s), 0.80, 2000)$$, 'a lower bar can be asked for explicitly');
select pg_temp.as_postgres();
select is((select count(*) from public.shows where title like 'Plink Sample %'), 56::bigint, 'it added the 35 still pending beside the 21 already added');
select is((select count(*) from public.show_candidates where title like 'Plink Sample %' and status = 'rejected'), 4::bigint, 'and left the rejected ones alone');
select is((select count(*) from public.show_candidates where title like 'Plink Sample %' and status = 'pending'), 0::bigint, 'nothing is left pending');

-- Names that already read as a show are linked, not added twice; repeats in one batch too.
-- (sample 1 holds the reviewed share; it gates these two groups with an explicit lower bar)
select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select public.admin_add_candidates_bulk('held musical', null, (select id from _s), 0.80)->>'linked'), '1', 'a repeat of a held title is linked');
select is((select public.admin_add_candidates_bulk('plink twin', null, (select id from _s), 0.80)::text), '{"added": 1, "linked": 1, "remaining": 0}', 'twins: one show added, the other linked to it');
select pg_temp.as_postgres();
select is((select count(*) from public.shows where title like 'Plink Twin%'), 1::bigint, 'only one twin became a show');
select is((select count(*) from public.shows where title ilike '%zorbo held musical%'), 1::bigint, 'and no second copy of the held show');
select is((select s.id from public.show_candidates c join public.shows s on s.id = c.show_id where c.source_ref = 'Q9500103'), (select id from public.shows where title = 'Plink Twin'), 'the second twin points at the first');

select * from finish();
rollback;
