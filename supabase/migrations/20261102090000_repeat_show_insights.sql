-- Repeat-visit leaderboard uses the same selected period as the overview.
-- Caller-owned, RLS-respecting aggregates. No user-id parameter or definer rights.
-- today is a calendar date on the phone, used solely for current-period streaks.
create or replace function public.own_insights(selected_year integer default null, today date default current_date)
returns jsonb language sql stable set search_path = '' as $$
with all_entries as materialized (
  select e.id, e.date, e.show_id, s.title, s.type::text as type,
         public.insight_country(v.country) as country
  from public.entries e join public.shows s on s.id = e.show_id
  left join public.venues v on v.id = e.venue_id
  where e.user_id = (select auth.uid()) and e.status = 'logged'
), chosen as materialized (
  select * from all_entries where selected_year is null or extract(year from date) = selected_year
), periods as (
  select distinct 'chosen' as scope, 'day' as kind, date as period from chosen where date <= today
  union all
  select distinct 'chosen', 'week', date_trunc('week', date)::date from chosen where date <= today
  union all
  select distinct 'all', 'day', date from all_entries where date <= today
  union all
  select distinct 'all', 'week', date_trunc('week', date)::date from all_entries where date <= today
), numbered as (
  select *, period - (row_number() over (partition by scope, kind order by period))::integer *
    case kind when 'week' then 7 else 1 end as island from periods
), runs as (
  select scope, kind, count(*)::integer as length, max(period) as last_period
  from numbered group by scope, kind, island
), streaks as (
  select jsonb_build_object(
    'current_daily', coalesce(max(length) filter (where scope = 'all' and kind = 'day' and last_period >= today - 1), 0),
    'longest_daily', coalesce(max(length) filter (where scope = 'chosen' and kind = 'day'), 0),
    'current_weekly', coalesce(max(length) filter (where scope = 'all' and kind = 'week' and last_period >= date_trunc('week', today)::date - 7), 0),
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
    from (select extract(year from date)::integer as year, count(*) as count from all_entries group by 1) y), '[]'::jsonb),
  'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'count', count) order by month)
    from (select to_char(date, 'YYYY-MM') as month, count(*) as count from chosen group by 1) m), '[]'::jsonb),
  'days', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'count', count) order by date)
    from (select date, count(*) as count from chosen group by 1) d), '[]'::jsonb),
  'types', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'count', count) order by count desc, type)
    from (select type, count(*) as count from chosen group by 1) t), '[]'::jsonb),
  'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'count', count) order by count desc, country)
    from (select country, count(*) as count from chosen where country is not null group by 1) c), '[]'::jsonb)
);
$$;
revoke execute on function public.own_insights(integer, date) from public, anon;
grant execute on function public.own_insights(integer, date) to authenticated;

-- Replace the signature so existing callers can omit the new optional show filter.
-- Keeping both signatures with defaults would make PostgREST calls ambiguous.
drop function public.own_insight_entries(integer, date, text, text, integer);

-- Aggregate drill-down has the same filters and ownership rule, with pagination.
create or replace function public.own_insight_entries(
  selected_year integer default null, selected_day date default null,
  selected_country text default null, selected_type text default null,
  page_offset integer default 0, selected_show uuid default null)
returns table(id uuid, date date, title text, venue text, rating numeric)
language sql stable set search_path = '' as $$
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
$$;
revoke execute on function public.own_insight_entries(integer, date, text, text, integer, uuid) from public, anon;
grant execute on function public.own_insight_entries(integer, date, text, text, integer, uuid) to authenticated;
