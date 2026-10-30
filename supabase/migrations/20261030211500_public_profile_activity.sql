-- Public year summaries use only public, logged entries allowed by RLS.
-- SECURITY INVOKER also protects private profiles and blocked relationships.
create or replace function public.public_profile_activity(
  profile_id uuid, selected_year integer, today date default current_date
) returns jsonb language sql stable security invoker set search_path = '' as $$
with visible as materialized (
  select e.date from public.entries e
  where e.user_id = profile_id and e.visibility = 'public' and e.status = 'logged'
), chosen as materialized (
  select date from visible where extract(year from date) = selected_year
), periods as (
  select distinct 'all' as scope, date_trunc('week', date)::date as period
  from visible where date <= today
  union all
  select distinct 'chosen', date_trunc('week', date)::date from chosen where date <= today
), numbered as (
  select *, period - row_number() over (partition by scope order by period)::integer * 7 as island
  from periods
), runs as (
  select scope, count(*)::integer as length, max(period) as last_period
  from numbered group by scope, island
)
select jsonb_build_object(
  'total', (select count(*) from chosen),
  'current_weekly', coalesce((select max(length) from runs where scope = 'all'
    and last_period >= date_trunc('week', today)::date - 7), 0),
  'longest_weekly', coalesce((select max(length) from runs where scope = 'chosen'), 0),
  'days', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'count', count) order by date)
    from (select date, count(*) as count from chosen group by date) d), '[]'::jsonb)
);
$$;
revoke execute on function public.public_profile_activity(uuid, integer, date) from public;
grant execute on function public.public_profile_activity(uuid, integer, date) to anon, authenticated;
