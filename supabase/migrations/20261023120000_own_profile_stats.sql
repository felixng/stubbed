-- The Profile tab's numbers: the signed-in user's own shows, theatres and
-- cities, private entries included, plus how many of those shows are public
-- (so the tab can say how many the public profile leaves out).
-- Counted like public_profile_stats: logged entries only, a show seen twice
-- counts twice, entries without a venue still count, cities ignore case and
-- blanks. Always the caller's own entries (auth.uid()), so it can't read
-- anyone else's private shows. Signed-in users only.
create or replace function public.own_profile_stats()
returns table (shows integer, venues integer, cities integer, public_shows integer)
language sql
stable
set search_path = ''
as $$
  select count(*)::integer,
         count(distinct e.venue_id)::integer,
         count(distinct lower(btrim(v.city)))
           filter (where nullif(btrim(v.city), '') is not null)::integer,
         (count(*) filter (where e.visibility = 'public'))::integer
  from public.entries e
  left join public.venues v on v.id = e.venue_id
  where e.user_id = (select auth.uid())
    and e.status = 'logged';
$$;

revoke execute on function public.own_profile_stats() from public, anon;
grant execute on function public.own_profile_stats() to authenticated;
