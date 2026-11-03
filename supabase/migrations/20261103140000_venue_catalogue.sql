-- Theatres from OpenStreetMap (#290): enough saved venues that photo
-- detection (#343) answers almost every photo from Postgres, with West End
-- and Broadway houses labelled. The import rules live in load_osm_venues so
-- they can be tested; supabase/scripts/sync-osm-venues.mjs only fetches and
-- calls it.

create type public.venue_circuit as enum
  ('west_end', 'off_west_end', 'pub', 'broadway', 'off_broadway', 'regional_uk', 'regional_us');

alter table public.venues
  add column circuit     public.venue_circuit,
  add column website     text check (char_length(website) <= 500),
  add column wikidata_id text unique check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  add column source      text not null default 'user' check (source in ('user', 'osm', 'crawler'));

-- Shared with #343, which may land first.
create index if not exists venues_lat_lng_idx on public.venues (lat, lng);

-- similar_venues scanned every venue; with thousands of theatres loaded it
-- needs indexes. Same results, same signature and grants.
create index venues_search_key on public.venues
  ((replace(replace(search_text, 'theater', 'theatre'), ' ', '')));

create or replace function public.similar_venues(
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
    -- The first condition lets the trigram and key indexes cut the table
    -- down (each operator accepts everything its exact test below accepts);
    -- the second is the exact rule, unchanged.
    where (replace(replace(v.search_text, 'theater', 'theatre'), ' ', '') = key
           or v.search_text % nq or nq <% v.search_text or v.search_text %> nq)
      and (replace(replace(v.search_text, 'theater', 'theatre'), ' ', '') = key
           or similarity(nq, v.search_text) >= 0.45
           or word_similarity(nq, v.search_text) >= 0.8
           or (char_length(v.search_text) >= 4 and word_similarity(v.search_text, nq) >= 0.8))
  )
  select c.id, c.name, c.city, c.country, c.lat, c.lng, c.osm_id, c.dist,
         c.same_name and (c.dist < 2 or (c.dist is null and lower(btrim(c.city)) = lower(btrim(in_city)))) is true
  from candidates c
  where c.dist is null or c.dist <= 50
  order by 9 desc, c.score desc, c.dist nulls last, c.verified desc, c.name
  limit 3;
end;
$$;

-- rows: a JSON array of objects with keys osm_id, name, city, country, lat,
-- lng, wikidata_id, website, circuit (null, 'west_end' or 'broadway').
create function public.load_osm_venues(rows jsonb)
returns table (inserted int, filled int, attached int, west_end int, broadway int)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  drop table if exists pg_temp._osm_in;
  create temp table _osm_in on commit drop as
    select distinct on (r.osm_id)
           r.osm_id,
           btrim(r.name) as name,
           nullif(btrim(r.city), '') as city,
           nullif(btrim(r.country), '') as country,
           case when r.lat between -90 and 90 and r.lng between -180 and 180 then r.lat end as lat,
           case when r.lat between -90 and 90 and r.lng between -180 and 180 then r.lng end as lng,
           case when r.wikidata_id ~ '^Q[1-9][0-9]*$' then r.wikidata_id end as wikidata_id,
           case when r.website ~* '^https?://' and char_length(r.website) <= 500 then r.website end as website,
           case when r.circuit in ('west_end', 'broadway') then r.circuit end as circuit,
           replace(replace(public.normalise_search_text(r.name), 'theater', 'theatre'), ' ', '') as key
    from jsonb_to_recordset(rows) as r(
      osm_id text, name text, city text, country text, lat double precision, lng double precision,
      wikidata_id text, website text, circuit text)
    where r.osm_id ~ '^(node|way|relation)/[0-9]+$'
      and btrim(r.name) <> '' and char_length(btrim(r.name)) <= 200
    order by r.osm_id;

  -- 1. Attach: a venue people added by hand, with no osm_id, gets the id of
  -- the same-named OpenStreetMap theatre under 200 m away (nearest wins; an
  -- id already on another venue is skipped).
  with pairs as (
    select v.id as venue_id, i.osm_id, d.dist,
           row_number() over (partition by v.id order by d.dist, i.osm_id) as per_venue
    from public.venues v
    join _osm_in i
      on i.key = replace(replace(public.normalise_search_text(v.name), 'theater', 'theatre'), ' ', '')
    cross join lateral (
      select 2 * 6371000 * asin(sqrt(
               power(sin(radians(i.lat - v.lat) / 2), 2)
               + cos(radians(v.lat)) * cos(radians(i.lat)) * power(sin(radians(i.lng - v.lng) / 2), 2)
             )) as dist
    ) d
    where v.osm_id is null and v.lat is not null and v.lng is not null and i.lat is not null
      and d.dist < 200
      and not exists (select 1 from public.venues o where o.osm_id = i.osm_id)
  ), best as (
    select venue_id, osm_id,
           row_number() over (partition by osm_id order by dist, venue_id) as per_osm
    from pairs where per_venue = 1
  )
  update public.venues v set osm_id = b.osm_id
  from best b
  where v.id = b.venue_id and b.per_osm = 1;
  get diagnostics attached = row_count;

  -- 2. Insert the rest.
  insert into public.venues (name, city, country, lat, lng, osm_id, website, source, created_by, verified)
  select i.name, i.city, i.country, i.lat, i.lng, i.osm_id, i.website, 'osm', null, i.circuit is not null
  from _osm_in i
  on conflict (osm_id) do nothing;
  get diagnostics inserted = row_count;

  -- 3. Fill blanks on venues that already existed; never change a name.
  update public.venues v set
    city = coalesce(v.city, i.city),
    country = coalesce(v.country, i.country),
    lat = coalesce(v.lat, i.lat),
    lng = coalesce(v.lng, i.lng),
    website = coalesce(v.website, i.website)
  from _osm_in i
  where v.osm_id = i.osm_id
    and ((v.city is null and i.city is not null)
      or (v.country is null and i.country is not null)
      or (v.lat is null and i.lat is not null)
      or (v.website is null and i.website is not null));
  get diagnostics filled = row_count;

  -- 4. Wikidata ids, where free (one venue per id).
  with w as (
    select distinct on (i.wikidata_id) v.id as venue_id, i.wikidata_id
    from _osm_in i
    join public.venues v on v.osm_id = i.osm_id
    where i.wikidata_id is not null and v.wikidata_id is null
      and not exists (select 1 from public.venues o where o.wikidata_id = i.wikidata_id)
    order by i.wikidata_id, (i.circuit is not null) desc, v.osm_id
  )
  update public.venues v set wikidata_id = w.wikidata_id
  from w
  where v.id = w.venue_id;

  -- 5. Circuits from the reviewed lists.
  with c as (
    update public.venues v set circuit = i.circuit::public.venue_circuit, verified = true
    from _osm_in i
    where v.osm_id = i.osm_id and i.circuit is not null and v.circuit is null
    returning i.circuit as which
  )
  select count(*) filter (where which = 'west_end')::int, count(*) filter (where which = 'broadway')::int
    into west_end, broadway
  from c;

  drop table if exists pg_temp._osm_in;
  return next;
end;
$$;

revoke execute on function public.load_osm_venues(jsonb) from public, anon, authenticated;
grant execute on function public.load_osm_venues(jsonb) to service_role;
