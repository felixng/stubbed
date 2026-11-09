-- Paid stats are locked in own_insights and its drill-downs (#465). Run with `supabase test db`.
begin;
select plan(28);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'free@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'pro@example.com');
insert into public.shows (id, title, type) values
  ('5b000000-0000-0000-0000-000000000001', 'Alpha Musical', 'musical'),
  ('5b000000-0000-0000-0000-000000000002', 'Beta Play', 'play'),
  ('5b000000-0000-0000-0000-000000000003', 'Gamma Opera', 'opera');

-- Three years of entries for both users: this year, last year, two years back.
insert into public.entries (user_id, show_id, date, visibility, status)
select u::uuid, s::uuid, d::date, 'private'::public.visibility, 'logged'::public.entry_status
from (values ('aaaaaaaa-0000-0000-0000-000000000000'), ('bbbbbbbb-0000-0000-0000-000000000000')) users(u),
     (values
       ('5b000000-0000-0000-0000-000000000001', date_trunc('year', current_date)::date + 1),
       ('5b000000-0000-0000-0000-000000000001', date_trunc('year', current_date)::date + 2),
       ('5b000000-0000-0000-0000-000000000002', (date_trunc('year', current_date) - interval '1 year')::date + 5),
       ('5b000000-0000-0000-0000-000000000003', (date_trunc('year', current_date) - interval '2 years')::date + 9)
     ) f(s, d);

insert into public.subscriptions (user_id, provider, product_id, store_transaction_id, environment, status, will_renew, period_end)
values ('bbbbbbbb-0000-0000-0000-000000000000', 'app_store', 'pro_monthly', 'tx-pro', 'sandbox', 'active', true, now() + interval '10 days');

create function pg_temp.yr(offset_years int) returns int language sql as $$
  select extract(year from current_date)::int - offset_years $$;

-- Gates off: everything open, `access` is the only addition.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(public.own_insights() -> 'access' -> 'locked', '[]'::jsonb, 'gates off: nothing locked for Free (all time)');
select is(jsonb_array_length(public.own_insights() -> 'types'), 3, 'gates off: Free sees Show mix');
select is((public.own_insights(pg_temp.yr(1)) ->> 'total')::int, 1, 'gates off: Free sees last year');
select is(public.own_insights() -> 'access' ->> 'tier', 'free', 'tier reports the real membership');
select lives_ok($$select * from public.own_insight_entries(null, null, null, 'musical')$$, 'gates off: type drill-down allowed');

select pg_temp.as_admin();
update public.app_config set value = 'true' where key = 'paywall_gates_enabled';

-- Free, gates on.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
create temp table free_cur on commit drop as select public.own_insights(pg_temp.yr(0)) j;
grant all on free_cur to authenticated;
select is((select j -> 'access' -> 'locked' from free_cur), '["years","types"]'::jsonb, 'Free current year: years and types locked');
select is((select j ->> 'total' from free_cur), '2', 'Free current year: total is real');
select is((select j -> 'types' from free_cur), '[]'::jsonb, 'Free current year: types empty');
select is((select j -> 'years' from free_cur), '[]'::jsonb, 'Free current year: years empty');
select is((select j -> 'months' from free_cur) <> '[]'::jsonb, true, 'Free current year: months present');
select ok((select j::text from free_cur) !~ (pg_temp.yr(1)::text || '|' || pg_temp.yr(2)::text || '|"(musical|play|opera)"'),
  'Free current year: no earlier year or type name anywhere');

select is(public.own_insights(pg_temp.yr(1)) -> 'access' ->> 'period', 'past', 'previous year is the past period');
select is((public.own_insights(pg_temp.yr(1)) ->> 'total'), '0', 'Free past year: total emptied');
select is(jsonb_array_length(public.own_insights(pg_temp.yr(1)) -> 'access' -> 'locked'), 11, 'Free past year: every field locked');
select is(public.own_insights(pg_temp.yr(1)) #>> '{streaks,longest_daily}', '0', 'Free past year: longest streak emptied');
select ok(public.own_insights(pg_temp.yr(1)) ->> 'months' = '[]', 'Free past year: months empty');
select is(public.own_insights() -> 'access' ->> 'period', 'all', 'null year is All time');
select is(public.own_insights() ->> 'total', '0', 'Free All time: total emptied');

-- The clamp: claiming a date two years back doesn't make that year current.
select is(public.own_insights(pg_temp.yr(2), (current_date - interval '2 years')::date) ->> 'total', '0',
  'sending an old today does not unlock that year');
select is(public.own_insights(pg_temp.yr(2), (current_date - interval '2 years')::date) -> 'access' ->> 'period', 'past',
  'the period stays past');

-- Drill-downs.
select lives_ok($$select * from public.own_insight_entries(extract(year from current_date)::int)$$, 'Free: this-year drill-down is allowed');
select throws_ok($$select * from public.own_insight_entries(extract(year from current_date)::int - 1)$$, '42501',
  'upgrade_required:insights.past_years', 'Free: past year drill-down raises');
select throws_ok($$select * from public.own_insight_entries(null)$$, '42501',
  'upgrade_required:insights.all_time', 'Free: All time drill-down raises');
select throws_ok($$select * from public.own_insight_entries(extract(year from current_date)::int, null, null, 'musical')$$, '42501',
  'upgrade_required:insights.show_mix', 'Free: type drill-down raises');

-- Pro, gates on: everything as before.
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is(public.own_insights() -> 'access', '{"tier":"pro","period":"all","locked":[]}'::jsonb, 'Pro: nothing locked');
select is(jsonb_array_length(public.own_insights(pg_temp.yr(0)) -> 'types'), 1, 'Pro: Show mix present');

-- One policy: show_mix moved to free unlocks both the field and the drill-down.
select pg_temp.as_admin();
update public.feature_access set tier = 'free' where feature = 'insights.show_mix';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(jsonb_array_length(public.own_insights(pg_temp.yr(0)) -> 'types'), 1, 'show_mix free: types unlocked');
select lives_ok($$select * from public.own_insight_entries(extract(year from current_date)::int, null, null, 'musical')$$,
  'show_mix free: type drill-down unlocked');

select * from finish();
rollback;
