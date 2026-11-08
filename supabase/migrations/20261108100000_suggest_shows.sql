-- Optional show suggestions for the log form and photo import (#360, epic #419).
-- Crawler-independent: only entries we already hold. Returns ids and a score,
-- never who logged a show. #278 extends this shape with source = 'run'.
--
--   community: shows other people logged publicly at those venues within 14
--              days of the date, ranked by how many different people.
--   yours:     shows the caller has logged at those venues before.
--
-- Public means logged + public + not a private profile + no block between the
-- caller and the other person, matching the entries RLS and profile_is_visible.
-- The same show at the same venue appears once (yours wins over community).
-- At most 3 rows per source. Empty when signed out, no venues or no data.
create function public.suggest_shows(venue_ids uuid[], on_date date)
returns table (show_id uuid, title text, venue_id uuid, source text, score numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  venues_in as (
    select distinct v from unnest(coalesce(venue_ids, '{}'::uuid[])) v
    where (select id from me) is not null
    limit 10
  ),
  yours as (
    select e.show_id, e.venue_id, count(*)::numeric as score,
           row_number() over (order by count(*) desc, max(e.date) desc, e.show_id) as rn
    from public.entries e, me
    where e.user_id = me.id and e.status = 'logged'
      and e.venue_id in (select v from venues_in)
    group by e.show_id, e.venue_id
  ),
  community as (
    select e.show_id, e.venue_id, count(distinct e.user_id)::numeric as score,
           row_number() over (order by count(distinct e.user_id) desc, max(e.date) desc, e.show_id) as rn
    from public.entries e, me
    where on_date is not null
      and e.status = 'logged' and e.visibility = 'public'
      and e.user_id <> me.id
      and e.venue_id in (select v from venues_in)
      and e.date between on_date - 14 and on_date + 14
      and not exists (select 1 from public.profiles p where p.id = e.user_id and p.is_private)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = e.user_id and b.blocked_id = me.id)
           or (b.blocker_id = me.id and b.blocked_id = e.user_id)
      )
    group by e.show_id, e.venue_id
  ),
  picked as (
    select y.show_id, y.venue_id, 'yours'::text as source, y.score, y.rn from yours y where y.rn <= 3
    union all
    select c.show_id, c.venue_id, 'community', c.score, c.rn from community c
    where c.rn <= 3
      and not exists (select 1 from yours y where y.show_id = c.show_id and y.venue_id = c.venue_id and y.rn <= 3)
  )
  select p.show_id, s.title, p.venue_id, p.source, p.score
  from picked p join public.shows s on s.id = p.show_id
  order by (p.source = 'yours') desc, p.score desc, p.rn;
$$;

revoke execute on function public.suggest_shows(uuid[], date) from public, anon;
grant execute on function public.suggest_shows(uuid[], date) to authenticated;
