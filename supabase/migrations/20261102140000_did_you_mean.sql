-- "Did you mean…?" before adding a show or venue (#146).
--
-- Typed-in shows and venues stay visible to everyone, so duplicates are
-- caught before they're added: the apps offer close matches from
-- similar_shows / similar_venues, and saving reuses a match flagged `same`
-- instead of adding a row. New user-added show titles are tidied on insert.
-- With an empty catalogue every function simply finds nothing.

-- A typed or emailed title, tidied for display: no "(Broadway)", "- UK Tour",
-- ": The Musical" or ticket parts ("- Premium Orchestra"), single spaces, and
-- an all-caps title in normal case ("HAMILTON" → "Hamilton"; short ones like
-- "MJ" and "SIX" stay). Null when nothing is left.
create function public.tidy_show_title(title text)
returns text
language plpgsql immutable strict parallel safe
set search_path = ''
as $$
declare
  t text := regexp_replace(btrim(title), '\s+', ' ', 'g');
  before text;
  -- Words that mark a part as a ticket, seat or place, not the show.
  ticket constant text := '(broadway|off-broadway|west end|london|uk tour|us tour|national tour|tour|premium'
    || '|orchestra|stalls|circle|mezzanine|balcony|matinee|matinée|performance|tickets?|e-tickets?|seats?'
    || '|seating|vip|package|general admission|front row|day seats|rush|lottery)';
begin
  loop
    before := t;
    -- A last part after " - ", " | ", ", " or ": " that names one of those.
    t := regexp_replace(t, '(\s[-–—|]\s|,\s|:\s)[^–—|,:]*\m' || ticket || '\M[^–—|,:]*$', '', 'i');
    t := regexp_replace(t, '\s*\((broadway|off-broadway|west end|london|uk tour|us tour|tour|the musical|musical|play)\)$', '', 'i');
    t := regexp_replace(t, '\s*[-–—:]?\s*\mthe musical$', '', 'i');
    t := regexp_replace(t, '[\s|,:–—-]+$', '');
    exit when t = before;
  end loop;
  if t !~ '[[:lower:]]' and char_length(t) >= 5 then
    t := regexp_replace(initcap(t), '''S\M', '''s', 'g');
  end if;
  return nullif(t, '');
end;
$$;

-- Every new user-added show gets a tidy title, from any app or the import.
create function public.tidy_new_show_title()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.wikidata_id is null then
    new.title := coalesce(public.tidy_show_title(new.title), new.title);
  end if;
  return new;
end;
$$;

create trigger shows_tidy_title
  before insert on public.shows
  for each row execute function public.tidy_new_show_title();

-- Up to three existing shows close to a title someone is about to add,
-- best first. `same` means it's the same show (equal once tidied and
-- normalised, ignoring spaces and apostrophes, or one of its aliases), so
-- saving can reuse it without asking.
create function public.similar_shows(q text)
returns table (id uuid, title text, type public.show_type, same boolean)
language plpgsql stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  nq text := public.normalise_search_text(public.normalise_show_title(public.tidy_show_title(q)));
begin
  if nq is null or char_length(nq) < 2 then
    return;
  end if;
  return query
  with names as (
    select s.id as show_id, unnest(string_to_array(s.search_text, ' | ')) as name
    from public.shows s
    union all
    select a.show_id, a.search_text from public.show_aliases a
  ),
  scored as (
    select n.show_id,
           bool_or(replace(n.name, ' ', '') = replace(nq, ' ', '')) as same,
           max(greatest(similarity(nq, n.name), word_similarity(nq, n.name), word_similarity(n.name, nq))) as score
    from names n
    where replace(n.name, ' ', '') = replace(nq, ' ', '')
       or similarity(nq, n.name) >= 0.45
       or word_similarity(nq, n.name) >= 0.8
       or (char_length(n.name) >= 4 and word_similarity(n.name, nq) >= 0.8)
    group by n.show_id
  )
  select s.id, s.title, s.type, c.same
  from scored c
  join public.shows s on s.id = c.show_id
  order by c.same desc, c.score desc, (s.wikidata_id is not null) desc, s.verified desc, s.title, s.id
  limit 3;
end;
$$;

-- The same for venues: close names within 50 km of the photo (or anywhere,
-- for venues without a location). `same` needs an equal name (ignoring
-- spaces, apostrophes and theatre/theater) and either under 2 km away or,
-- without locations, the same city.
create function public.similar_venues(
  q text,
  near_lat double precision default null,
  near_lng double precision default null,
  in_city text default null
)
returns table (
  id          uuid,
  name        text,
  city        text,
  country     text,
  lat         double precision,
  lng         double precision,
  osm_id      text,
  distance_km double precision,
  same        boolean
)
language plpgsql stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  nq text := public.normalise_search_text(q);
  key text := replace(replace(public.normalise_search_text(q), 'theater', 'theatre'), ' ', '');
begin
  if nq is null or char_length(nq) < 2 then
    return;
  end if;
  return query
  with candidates as (
    select v.*,
           replace(replace(v.search_text, 'theater', 'theatre'), ' ', '') = key as same_name,
           greatest(similarity(nq, v.search_text), word_similarity(nq, v.search_text),
                    word_similarity(v.search_text, nq)) as score,
           case when near_lat is not null and near_lng is not null and v.lat is not null then
             2 * 6371 * asin(sqrt(
               power(sin(radians(v.lat - near_lat) / 2), 2)
               + cos(radians(near_lat)) * cos(radians(v.lat))
                 * power(sin(radians(v.lng - near_lng) / 2), 2)
             ))
           end as dist
    from public.venues v
    where replace(replace(v.search_text, 'theater', 'theatre'), ' ', '') = key
       or similarity(nq, v.search_text) >= 0.45
       or word_similarity(nq, v.search_text) >= 0.8
       or (char_length(v.search_text) >= 4 and word_similarity(v.search_text, nq) >= 0.8)
  )
  select c.id, c.name, c.city, c.country, c.lat, c.lng, c.osm_id, c.dist,
         c.same_name and (c.dist < 2 or (c.dist is null and lower(btrim(c.city)) = lower(btrim(in_city)))) is true
  from candidates c
  where c.dist is null or c.dist <= 50
  order by 9 desc, c.score desc, c.dist nulls last, c.verified desc, c.name
  limit 3;
end;
$$;

revoke execute on function public.similar_shows(text) from public;
revoke execute on function public.similar_venues(text, double precision, double precision, text) from public;
grant execute on function public.similar_shows(text) to anon, authenticated;
grant execute on function public.similar_venues(text, double precision, double precision, text) to anon, authenticated;
