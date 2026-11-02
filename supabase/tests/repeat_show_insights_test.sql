begin;
select plan(22);

insert into auth.users(id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000000','repeat-a@example.com'),
 ('bbbbbbbb-0000-0000-0000-000000000000','repeat-b@example.com');
insert into public.shows(id,title,type) values
 ('5a000000-0000-0000-0000-000000000001','Most seen','musical'),
 ('5a000000-0000-0000-0000-000000000002','Same title','play'),
 ('5a000000-0000-0000-0000-000000000003','Same title','play'),
 ('5a000000-0000-0000-0000-000000000004','Once only','play');
-- All visits deliberately have no venue. Private entries count for their owner.
insert into public.entries(user_id,show_id,date,visibility,status)
select 'aaaaaaaa-0000-0000-0000-000000000000', show_id::uuid, day::date,
       'private'::public.visibility, status::public.entry_status
from (values
 ('5a000000-0000-0000-0000-000000000001','2025-12-28','logged'),
 ('5a000000-0000-0000-0000-000000000001','2026-01-04','logged'),
 ('5a000000-0000-0000-0000-000000000001','2026-01-05','logged'),
 ('5a000000-0000-0000-0000-000000000001','2026-01-05','logged'),
 ('5a000000-0000-0000-0000-000000000002','2026-01-03','logged'),
 ('5a000000-0000-0000-0000-000000000002','2026-01-04','logged'),
 ('5a000000-0000-0000-0000-000000000003','2025-12-28','logged'),
 ('5a000000-0000-0000-0000-000000000003','2026-01-04','logged'),
 ('5a000000-0000-0000-0000-000000000004','2026-01-04','logged'),
 ('5a000000-0000-0000-0000-000000000004','2026-12-01','planned')
) fixture(show_id, day, status);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000000","role":"authenticated"}',true);
select is(jsonb_array_length(public.own_insights()->'repeated_shows'),3,'only shows with multiple logged visits appear');
select is(public.own_insights()->'repeated_shows'->0->>'title','Most seen','most visits first');
select is(public.own_insights()->'repeated_shows'->0->>'count','4','counts private, unlocated and same-day visits');
select is(public.own_insights()->'repeated_shows'->0->>'rank','1','leader has rank one');
select is(public.own_insights()->'repeated_shows'->1->>'rank','2','runner-up rank');
select is(public.own_insights()->'repeated_shows'->2->>'rank','2','equal counts share rank');
select is(public.own_insights()->'repeated_shows'->1->>'id','5a000000-0000-0000-0000-000000000002','ties sort deterministically by title and ID');
select is(public.own_insights()->'repeated_shows'->2->>'id','5a000000-0000-0000-0000-000000000003','same-title catalogue shows stay distinct');
select is(jsonb_array_length(public.own_insights(2026)->'repeated_shows'),2,'selected year excludes repeats from other years');
select is(public.own_insights(2026)->'repeated_shows'->0->>'count','3','selected year counts only its visits');
select is(public.own_insights(2024)->'repeated_shows','[]'::jsonb,'empty period returns empty leaderboard');
select is(public.own_insights(2025)->'repeated_shows','[]'::jsonb,'single visits do not become repeats');
select is((select count(*)::integer from public.own_insight_entries(selected_show=>'5a000000-0000-0000-0000-000000000001')),4,'show drill-down matches all-time count');
select is((select count(*)::integer from public.own_insight_entries(selected_year=>2026,selected_show=>'5a000000-0000-0000-0000-000000000001')),3,'show drill-down preserves selected year');
select is((select count(*)::integer from public.own_insight_entries(selected_show=>'5a000000-0000-0000-0000-000000000004')),1,'show drill-down excludes planned visits');
select is((select count(*)::integer from public.own_insight_entries(selected_show=>'5a000000-0000-0000-0000-000000000001',page_offset=>2)),2,'show drill-down supports pagination');
select is((select count(*)::integer from public.own_insight_entries()),9,'existing calls without show filter still work');
select is((select count(*)::integer from public.own_insight_entries(selected_day=>'2026-01-05',selected_show=>'5a000000-0000-0000-0000-000000000001')),2,'show and day filters combine');

select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000000","role":"authenticated"}',true);
select is(public.own_insights()->'repeated_shows','[]'::jsonb,'another user cannot see private repeat counts');
select is((select count(*)::integer from public.own_insight_entries(selected_show=>'5a000000-0000-0000-0000-000000000001')),0,'another user cannot drill into private visits');
reset role;
select ok(not has_function_privilege('anon','public.own_insights(integer,date)','execute'),'anonymous callers cannot read leaderboard');
select ok(not has_function_privilege('anon','public.own_insight_entries(integer,date,text,text,integer,uuid)','execute'),'anonymous callers cannot read show visits');
select * from finish();
rollback;
