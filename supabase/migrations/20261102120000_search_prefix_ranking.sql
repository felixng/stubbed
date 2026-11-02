-- Search ranks prefix matches first (#35, part 1).
--
-- Typing "Two" listed "Between Two Worlds" above "Two Strangers", and
-- "Network" matched mid-word. Each match now gets a tier, compared on
-- normalised text (lowercase, no accents, no leading "The", punctuation as
-- spaces), then the old score order breaks ties within a tier:
--   0  the name (or an alias) starts with the search ("Two" → Two Strangers, The Two Gentlemen)
--   1  a word in it starts with the search ("Two" → Between Two Worlds)
--   2  fuzzy or typo matches ("hamiltn" → Hamilton)
--   3  the search appears inside a word ("two" → Network): always last
-- Signatures and result columns are unchanged, so the apps need no change.

-- Lowercase, accents removed, a leading "the" dropped, anything that isn't a
-- letter or digit turned into single spaces.
create function public.normalise_search_text(t text)
returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      lower(regexp_replace(pg_catalog.normalize(btrim(t), 'NFKD'), U&'[\0300-\036f]', '', 'g')),
      '^the\s+', ''),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

-- A show's title and aliases, normalised and joined with " | ". Normalised
-- text never contains "|", so "| x" marks the start of an alias.
create function public.show_search_text(title text, aliases text[])
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select concat_ws(' | ',
    public.normalise_search_text(public.normalise_show_title(title)),
    (select string_agg(public.normalise_search_text(public.normalise_show_title(a)), ' | ')
     from unnest(aliases) as a));
$$;

-- Stored, so search does no per-row work, with one trigram index each.
alter table public.shows
  add column search_text text generated always as (public.show_search_text(title, aliases)) stored;
alter table public.venues
  add column search_text text generated always as (public.normalise_search_text(name)) stored;
create index shows_search_text_trgm on public.shows using gin (search_text extensions.gin_trgm_ops);
create index venues_search_text_trgm on public.venues using gin (search_text extensions.gin_trgm_ops);

-- plpgsql so the normalised query is computed once, not once per row.
create or replace function public.search_shows(q text)
returns setof public.shows
language plpgsql stable
set search_path = public, extensions
as $$
declare
  nq text := public.normalise_search_text(public.normalise_show_title(q));
begin
  if nq is null or nq = '' then
    return;
  end if;
  return query
  select s.*
  from public.shows s
  where s.search_text like '%' || nq || '%' or nq <% s.search_text
  order by
    case
      when starts_with(s.search_text, nq) or strpos(s.search_text, '| ' || nq) > 0 then 0
      when strpos(' ' || s.search_text, ' ' || nq) > 0 then 1
      when strpos(s.search_text, nq) > 0 then 3
      else 2
    end,
    word_similarity(nq, s.search_text) desc,
    (s.wikidata_id is not null) desc,
    s.verified desc,
    s.title,
    s.id
  limit 20;
end;
$$;

create or replace function public.search_venues(
  q text,
  near_lat double precision default null,
  near_lng double precision default null
)
returns table (
  id          uuid,
  name        text,
  city        text,
  country     text,
  lat         double precision,
  lng         double precision,
  osm_id      text,
  verified    boolean,
  distance_km double precision
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  nq text := public.normalise_search_text(q);
begin
  if nq is null or nq = '' then
    return;
  end if;
  return query
  with matches as (
    select v.*,
           case
             when starts_with(v.search_text, nq) then 0
             when strpos(' ' || v.search_text, ' ' || nq) > 0 then 1
             when strpos(v.search_text, nq) > 0 then 3
             else 2
           end as tier,
           word_similarity(nq, v.search_text) as score,
           case when near_lat is not null and near_lng is not null and v.lat is not null then
             2 * 6371 * asin(sqrt(
               power(sin(radians(v.lat - near_lat) / 2), 2)
               + cos(radians(near_lat)) * cos(radians(v.lat))
                 * power(sin(radians(v.lng - near_lng) / 2), 2)
             ))
           end as dist
    from public.venues v
    where v.search_text like '%' || nq || '%' or nq <% v.search_text
  )
  -- A theatre next to the photo (under 2 km) still comes first unless it only
  -- matches mid-word; within a tier, nearer venues get the old boost.
  select m.id, m.name, m.city, m.country, m.lat, m.lng, m.osm_id, m.verified, m.dist
  from matches m
  order by (m.dist < 2 and m.tier < 3) is true desc,
           m.tier,
           m.score
           + case when m.dist < 2 then 0.5
                  when m.dist < 50 then 0.25
                  else 0 end desc,
           m.verified desc,
           m.name
  limit 20;
end;
$$;
