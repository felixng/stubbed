-- Merge duplicate shows and venues, and one city per venue (#274).
--
-- Admin only: service role. Each call is one transaction. Take locks before
-- planning so a concurrent import cannot add references between moving
-- entries and deleting the duplicate (same approach as merge_into_catalogue()).

create function public.merge_shows(from_id uuid, into_id uuid, force boolean default false)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  src public.shows;
  dst public.shows;
  moved_entries bigint;
  moved_aliases bigint;
begin
  if from_id is null or into_id is null or from_id = into_id then
    raise exception 'merge_shows needs two different shows';
  end if;
  lock table public.shows in share row exclusive mode;
  lock table public.entries in share row exclusive mode;
  lock table public.show_aliases in share row exclusive mode;
  select * into src from public.shows s where s.id = from_id;
  select * into dst from public.shows s where s.id = into_id;
  if src.id is null or dst.id is null then
    raise exception 'merge_shows: show not found';
  end if;
  if src.type is distinct from dst.type and not force then
    raise exception 'merge_shows: types differ (% vs %); pass force to merge anyway', src.type, dst.type;
  end if;

  update public.entries e set show_id = into_id where e.show_id = from_id;
  get diagnostics moved_entries = row_count;
  -- #276 adds productions and runs here
  insert into public.show_aliases (show_id, alias, created_by, created_at)
  select into_id, a.alias, a.created_by, a.created_at
  from public.show_aliases a where a.show_id = from_id
  on conflict (show_id, search_text) do nothing;
  get diagnostics moved_aliases = row_count;
  -- The deleted show's own aliases cascade.
  delete from public.shows s where s.id = from_id;
  return jsonb_build_object('entries', moved_entries, 'aliases', moved_aliases);
end;
$$;

create function public.merge_venues(from_id uuid, into_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  src public.venues;
  dst public.venues;
  moved_entries bigint;
begin
  if from_id is null or into_id is null or from_id = into_id then
    raise exception 'merge_venues needs two different venues';
  end if;
  lock table public.venues in share row exclusive mode;
  lock table public.entries in share row exclusive mode;
  select * into src from public.venues v where v.id = from_id;
  select * into dst from public.venues v where v.id = into_id;
  if src.id is null or dst.id is null then
    raise exception 'merge_venues: venue not found';
  end if;

  update public.entries e set venue_id = into_id where e.venue_id = from_id;
  get diagnostics moved_entries = row_count;
  -- #276 adds productions and runs here
  -- Keep what the surviving venue lacks.
  update public.venues v set
    lat = coalesce(v.lat, src.lat), lng = coalesce(v.lng, src.lng),
    city = coalesce(v.city, src.city), country = coalesce(v.country, src.country)
  where v.id = into_id;
  delete from public.venues v where v.id = from_id;
  return jsonb_build_object('entries', moved_entries);
end;
$$;

revoke all on function public.merge_shows(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.merge_venues(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_shows(uuid, uuid, boolean) to service_role;
grant execute on function public.merge_venues(uuid, uuid) to service_role;

-- One city per venue. OpenStreetMap gives administrative areas ("Greater
-- London", "City of Westminster", "Brooklyn"); people think "London" and
-- "New York". Venues get country as an ISO alpha-2 code.
create function public.canonical_city(city text, country text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(city), '') is null then null
    when upper(btrim(country)) in ('GB', 'UK') and (
      lower(btrim(city)) in (
        'greater london', 'city of westminster', 'city of london', 'westminster',
        'barking and dagenham', 'barnet', 'bexley', 'brent', 'bromley', 'camden',
        'croydon', 'ealing', 'enfield', 'greenwich', 'hackney', 'hammersmith and fulham',
        'haringey', 'harrow', 'havering', 'hillingdon', 'hounslow', 'islington',
        'kensington and chelsea', 'kingston upon thames', 'lambeth', 'lewisham',
        'merton', 'newham', 'redbridge', 'richmond upon thames', 'southwark', 'sutton',
        'tower hamlets', 'waltham forest', 'wandsworth')
      or lower(btrim(city)) like 'london borough of %'
      or lower(btrim(city)) like 'royal borough of %')
      then 'London'
    when upper(btrim(country)) = 'US' and lower(btrim(city)) in (
      'manhattan', 'brooklyn', 'queens', 'the bronx', 'bronx', 'staten island',
      'new york county', 'kings county', 'queens county', 'bronx county',
      'richmond county', 'new york city')
      then 'New York'
    else btrim(city)
  end;
$$;

create function public.venues_canonical_city()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.city := public.canonical_city(new.city, new.country);
  return new;
end;
$$;

create trigger venues_canonical_city
  before insert or update of city, country on public.venues
  for each row execute function public.venues_canonical_city();

update public.venues set city = city;
