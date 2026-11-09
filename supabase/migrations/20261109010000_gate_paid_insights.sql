-- Lock paid stats in own_insights and its drill-downs (#465, slice of epic #219).
-- Contract: docs/PAYWALL.md sections 2-4. Nothing changes while `paywall_gates_enabled` is
-- not 'true': every feature is then allowed, `access.locked` is empty and every other field
-- is what it was before. Locked fields are never computed: their source rows are filtered out
-- before aggregating, so the real value cannot reach the output.

-- Analytics names for the paywall (props: source, platform; see docs/ANALYTICS.md).
alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'entry_logged', 'card_shared', 'paywall_viewed', 'purchase_completed'));

-- The computation. Internal: it trusts its flags and its `today`, so clients can't call it
-- (revoked below); own_insights decides both. A false flag filters the source rows out before
-- aggregating, so a locked value is never computed.
create function public.own_insights_core(
  selected_year integer, today_ date, period_ok boolean, years_ok boolean, types_ok boolean)
returns jsonb language sql stable set search_path = '' as $$
with all_entries as materialized (
  select e.id, e.date, e.show_id, s.title, s.type::text as type,
         public.insight_country(v.country) as country
  from public.entries e join public.shows s on s.id = e.show_id
  left join public.venues v on v.id = e.venue_id
  where e.user_id = (select auth.uid()) and e.status = 'logged'
), chosen as materialized (
  select * from all_entries
  where period_ok and (selected_year is null or extract(year from date) = selected_year)
), periods as (
  select distinct 'chosen' as scope, 'day' as kind, date as period from chosen where date <= today_
  union all
  select distinct 'chosen', 'week', date_trunc('week', date)::date from chosen where date <= today_
  union all
  select distinct 'all', 'day', date from all_entries where date <= today_
  union all
  select distinct 'all', 'week', date_trunc('week', date)::date from all_entries where date <= today_
), numbered as (
  select *, period - (row_number() over (partition by scope, kind order by period))::integer *
    case kind when 'week' then 7 else 1 end as island from periods
), runs as (
  select scope, kind, count(*)::integer as length, max(period) as last_period
  from numbered group by scope, kind, island
), streaks as (
  select jsonb_build_object(
    'current_daily', coalesce(max(length) filter (where scope = 'all' and kind = 'day' and last_period >= today_ - 1), 0),
    'longest_daily', coalesce(max(length) filter (where scope = 'chosen' and kind = 'day'), 0),
    'current_weekly', coalesce(max(length) filter (where scope = 'all' and kind = 'week' and last_period >= date_trunc('week', today_)::date - 7), 0),
    'longest_weekly', coalesce(max(length) filter (where scope = 'chosen' and kind = 'week'), 0)) as value from runs
)
select jsonb_build_object(
  'total', (select count(*) from chosen),
  'unique_shows', (select count(distinct show_id) from chosen),
  'repeated_shows', coalesce((select jsonb_agg(
    jsonb_build_object('id', show_id, 'title', title, 'count', count, 'rank', rank)
    order by count desc, title, show_id)
    from (
      select show_id, title, count(*) as count, rank() over (order by count(*) desc) as rank
      from chosen group by show_id, title having count(*) > 1
    ) repeated), '[]'::jsonb),
  'unlocated', (select count(*) from chosen where country is null),
  'streaks', (select value from streaks),
  'years', coalesce((select jsonb_agg(jsonb_build_object('year', year, 'count', count) order by year desc)
    from (select extract(year from date)::integer as year, count(*) as count
          from all_entries where years_ok group by 1) y), '[]'::jsonb),
  'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'count', count) order by month)
    from (select to_char(date, 'YYYY-MM') as month, count(*) as count from chosen group by 1) m), '[]'::jsonb),
  'days', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'count', count) order by date)
    from (select date, count(*) as count from chosen group by 1) d), '[]'::jsonb),
  'types', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'count', count) order by count desc, type)
    from (select type, count(*) as count from chosen where types_ok group by 1) t), '[]'::jsonb),
  'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'count', count) order by count desc, country)
    from (select country, count(*) as count from chosen where country is not null group by 1) c), '[]'::jsonb)
);
$$;
revoke execute on function public.own_insights_core(integer, date, boolean, boolean, boolean) from public, anon, authenticated;

create or replace function public.own_insights(selected_year integer default null, today date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  -- The device's date drives streaks in the user's time zone, but it can only be a day either side
  -- of the server's, so a client can't turn an earlier year into "this year".
  today_ date := greatest(current_date - 1, least(current_date + 1, coalesce(today, current_date)));
  period_kind text;
  period_ok boolean;
  years_ok boolean;
  types_ok boolean;
  locked jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  period_kind := case when selected_year is null then 'all'
                      when selected_year = extract(year from today_) then 'current' else 'past' end;
  period_ok := public.has_feature(case period_kind when 'current' then 'insights.current_year'
                                                   when 'past' then 'insights.past_years'
                                                   else 'insights.all_time' end);
  years_ok := period_ok and (period_kind <> 'current' or public.has_feature('insights.past_years'));
  types_ok := period_ok and public.has_feature('insights.show_mix');

  locked := case when not period_ok then
      '["total","unique_shows","repeated_shows","unlocated","streaks.longest_daily","streaks.longest_weekly","years","months","days","types","countries"]'::jsonb
    else (select coalesce(jsonb_agg(f), '[]'::jsonb) from (
      select 'years' as f where not years_ok union all select 'types' where not types_ok) l)
  end;

  return public.own_insights_core(selected_year, today_, period_ok, years_ok, types_ok)
    || jsonb_build_object('access', jsonb_build_object(
         'tier', public.my_membership() ->> 'tier', 'period', period_kind, 'locked', locked));
end;
$$;
revoke execute on function public.own_insights(integer, date) from public, anon;
grant execute on function public.own_insights(integer, date) to authenticated;

-- Aggregate drill-down: same filters and ownership rule, plus the same locks. A locked filter
-- raises 42501 `upgrade_required:<feature>` so clients can tell "locked" from "no results".
-- There is no `today` here, so the current year is the server year, or the neighbouring one for
-- the day either side of New Year (covering every time zone).
create or replace function public.own_insight_entries(
  selected_year integer default null, selected_day date default null,
  selected_country text default null, selected_type text default null,
  page_offset integer default 0, selected_show uuid default null)
returns table(id uuid, date date, title text, venue text, rating numeric)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  feature text;
begin
  feature := case
    when selected_year is null then 'insights.all_time'
    when selected_year between extract(year from current_date - 1) and extract(year from current_date + 1)
      then 'insights.current_year'
    else 'insights.past_years' end;
  if not public.has_feature(feature) then
    raise exception 'upgrade_required:%', feature using errcode = '42501';
  end if;
  if selected_type is not null and not public.has_feature('insights.show_mix') then
    raise exception 'upgrade_required:insights.show_mix' using errcode = '42501';
  end if;
  return query
  select e.id, e.date, s.title, v.name, e.rating
  from public.entries e join public.shows s on s.id = e.show_id
  left join public.venues v on v.id = e.venue_id
  where e.user_id = (select auth.uid()) and e.status = 'logged'
    and (selected_year is null or extract(year from e.date) = selected_year)
    and (selected_day is null or e.date = selected_day)
    and (selected_country is null or public.insight_country(v.country) = selected_country)
    and (selected_type is null or s.type::text = selected_type)
    and (selected_show is null or e.show_id = selected_show)
  order by e.date desc, e.id limit 100 offset greatest(0, page_offset);
end;
$$;
