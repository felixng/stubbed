-- Every name a show goes by (#333): its title, its Wikidata aliases and the
-- nicknames people taught (#35). search_shows finds a show by any of them but
-- returns only the show, so the photo reader (iOS) uses this to see which name
-- the printed text matched. Read-only, and exposes nothing search_shows
-- doesn't already.

create function public.show_match_names(show_ids uuid[])
returns table (show_id uuid, name text)
language sql stable
set search_path = public, extensions
as $$
  select s.id, s.title
    from public.shows s
   where s.id = any (show_ids)
  union
  select s.id, alias
    from public.shows s, unnest(s.aliases) as alias
   where s.id = any (show_ids)
  union
  select a.show_id, a.alias
    from public.show_aliases a
   where a.show_id = any (show_ids);
$$;

grant execute on function public.show_match_names(uuid[]) to anon, authenticated;
