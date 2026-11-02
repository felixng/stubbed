begin;
select plan(22);
insert into auth.users(id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000000','insight-a@example.com'),
 ('bbbbbbbb-0000-0000-0000-000000000000','insight-b@example.com');
insert into public.shows(id,title,type) values
 ('5a000000-0000-0000-0000-000000000001','Repeat musical','musical'),
 ('5a000000-0000-0000-0000-000000000002','A play','play');
insert into public.venues(id,name,country) values
 ('7e000000-0000-0000-0000-000000000001','Theatre A',' UK '),
 ('7e000000-0000-0000-0000-000000000002','Theatre B','United Kingdom');
insert into public.entries(user_id,show_id,venue_id,date,visibility,status) values
 ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','7e000000-0000-0000-0000-000000000001','2025-12-28','private','logged'),
 ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','7e000000-0000-0000-0000-000000000002','2026-01-04','public','logged'),
 ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001',null,'2026-01-05','private','logged'),
 ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000002',null,'2026-01-05','private','logged'),
 ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000002',null,'2026-01-07','public','planned');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000000","role":"authenticated"}',true);
select is(public.own_insights(null,'2026-01-06')->>'total','4','includes private and repeated visits, excludes planned');
select is(public.own_insights(2026,'2026-01-06')->>'total','3','filters by performance year');
select is(public.own_insights(null,'2026-01-06')->>'unique_shows','2','unique shows separate from performances');
select is(public.own_insights(null,'2026-01-06')->>'unlocated','2','missing venues still counted');
select is(public.own_insights(null,'2026-01-06')->'streaks'->>'current_daily','2','yesterday keeps daily streak alive; same date not doubled');
select is(public.own_insights(null,'2026-01-06')->'streaks'->>'longest_weekly','3','Monday weeks span year boundary');
select is(public.own_insights(null,'2026-01-12')->'streaks'->>'current_weekly','3','unfinished new week keeps streak');
select is(public.own_insights(null,'2026-01-19')->'streaks'->>'current_weekly','0','missing complete week ends streak');
select is(public.own_insights(2026,'2026-01-06')->'streaks'->>'longest_weekly','2','historical/selected year streak uses only selected visits');
select is(public.own_insights(null,'2026-01-06')->'countries'->0->>'count','2','country aliases merge');
select is(public.own_insights(null,'2026-01-06')->'countries'->0->>'country','GB','canonical country code');
select is((select count(*)::integer from public.own_insight_entries(selected_country=>'GB')),2,'country drill-down matches counts');
select is((select count(*)::integer from public.own_insight_entries(selected_day=>'2026-01-05')),2,'day drill-down includes both shows');
select is(public.own_insights(2026,'2026-01-06')->'days'->1->>'count','2','grid intensity counts both performances');
select is(public.own_insights(2026,'2026-01-06')->'types'->0->>'count','2','category totals count repeated visits');
select is((select count(*)::integer from public.own_insight_entries(page_offset=>1)),3,'drill-down offset supports pagination');
select is(public.own_insights(2024,'2026-01-06')->>'total','0','empty selected year returns zero');
select is(public.own_insights(2026,'2026-01-06')->'streaks'->>'current_weekly','3','current streak spans years even in current-year view');
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000000","role":"authenticated"}',true);
select is(public.own_insights(null,'2026-01-06')->>'total','0','other user sees only own empty history');
select is((select count(*)::integer from public.own_insight_entries()),0,'drill-down isolates caller');
reset role;
select ok(not has_function_privilege('anon','public.own_insights(integer,date)','execute'),'anon cannot read aggregates');
select ok(not has_function_privilege('anon','public.own_insight_entries(integer,date,text,text,integer,uuid)','execute'),'anon cannot drill down');
select * from finish();
rollback;
