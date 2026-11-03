-- Saved venues near a point, nearest first (#343). Both apps call this before
-- asking OpenStreetMap, so a theatre we already know answers a photo in
-- milliseconds and the rule lives in one place.

-- The bounding box below. Also created by the venue catalogue import (#290),
-- whichever lands first.
create index if not exists venues_lat_lng_idx on public.venues (lat, lng);

create function public.nearby_venues(lat double precision, lng double precision, radius_m double precision)
returns table (
  id          uuid,
  name        text,
  city        text,
  country     text,
  lat         double precision,
  lng         double precision,
  osm_id      text,
  distance_m  integer
)
language sql
stable
set search_path = public, extensions
as $$
  with box as (
    -- A square a little larger than the circle, so the index does the cutting.
    select radius_m / 111320.0 as d_lat,
           radius_m / 111320.0 / greatest(0.2, cos(radians(nearby_venues.lat))) as d_lng
  ),
  found as (
    select v.id, v.name, v.city, v.country, v.lat, v.lng, v.osm_id,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(v.lat - nearby_venues.lat) / 2), 2)
             + cos(radians(nearby_venues.lat)) * cos(radians(v.lat))
               * power(sin(radians(v.lng - nearby_venues.lng) / 2), 2)
           )) as dist
    from public.venues v, box
    where v.lat is not null and v.lng is not null
      and v.lat between nearby_venues.lat - box.d_lat and nearby_venues.lat + box.d_lat
      and v.lng between nearby_venues.lng - box.d_lng and nearby_venues.lng + box.d_lng
  )
  select f.id, f.name, f.city, f.country, f.lat, f.lng, f.osm_id, round(f.dist)::integer
  from found f
  where f.dist <= radius_m
  order by f.dist, f.name
  limit 20;
$$;

grant execute on function public.nearby_venues(double precision, double precision, double precision) to anon, authenticated;
