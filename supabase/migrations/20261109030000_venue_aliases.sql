-- Venue aliases (#447; owner decisions 2026-11-08). A theatre has several names: a spelling per source and old names
-- after a rename. They are stored, searched, and treated as the same name by the crawler (location evidence is still
-- required, and exactly one candidate must pass). Modelled on show_aliases.

create table public.venue_aliases (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues (id) on delete cascade,
  alias       text not null check (char_length(btrim(alias)) between 2 and 200),
  search_text text generated always as (public.normalise_search_text(alias)) stored,
  kind        text not null check (kind in ('former', 'alternative', 'source_spelling')),
  valid_from  date,
  valid_to    date check (valid_to is null or valid_from is null or valid_to >= valid_from),
  source      text not null check (source in ('osm', 'official', 'london_theatre', 'playbill', 'admin', 'merge')),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index venue_aliases_unique on public.venue_aliases (venue_id, search_text);
create index venue_aliases_search_text_trgm on public.venue_aliases using gin (search_text extensions.gin_trgm_ops);
create index venue_aliases_created_by on public.venue_aliases (created_by);

alter table public.venue_aliases enable row level security;
revoke all on public.venue_aliases from anon, authenticated;
grant select on public.venue_aliases to anon, authenticated;
grant insert (venue_id, alias, kind, valid_from, valid_to, source), update (alias, kind, valid_from, valid_to),
  delete on public.venue_aliases to authenticated;

create policy "Venue aliases are public" on public.venue_aliases for select to anon, authenticated using (true);
create policy "Admins add venue aliases" on public.venue_aliases for insert to authenticated
  with check (public.is_admin() and source = 'admin');
create policy "Admins edit venue aliases" on public.venue_aliases for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete venue aliases" on public.venue_aliases for delete to authenticated
  using (public.is_admin());

-- Records a name for a venue unless it is already the venue's name or alias.
create function public.record_venue_alias(for_venue uuid, label text, alias_kind text, alias_source text)
returns void language plpgsql set search_path = '' as $$
declare
  trimmed text := left(nullif(btrim(label), ''), 200);
begin
  if trimmed is null or char_length(trimmed) < 2 then return; end if;
  if exists (select 1 from public.venues v where v.id = for_venue
    and public.normalise_search_text(v.name) = public.normalise_search_text(trimmed)) then return; end if;
  insert into public.venue_aliases (venue_id, alias, kind, source, created_by)
  values (for_venue, trimmed, alias_kind,
    case when alias_source in ('osm', 'official', 'london_theatre', 'playbill', 'admin', 'merge') then alias_source else 'admin' end,
    null)
  on conflict (venue_id, search_text) do nothing;
end;
$$;
revoke all on function public.record_venue_alias(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_venue_alias(uuid, text, text, text) to service_role;

-- Review queue: linked entities whose name matched nothing but the building.
alter table public.crawl_source_entities add column review_reason text;
create index crawl_source_entities_review on public.crawl_source_entities (review_reason) where review_reason is not null;

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
  with hits as (
    select v.id as venue_id, v.search_text as t from public.venues v
    where v.search_text like '%' || nq || '%' or nq <% v.search_text
    union all
    select a.venue_id, a.search_text from public.venue_aliases a
    where a.search_text like '%' || nq || '%' or nq <% a.search_text
  ),
  best as (
    select h.venue_id,
           min(case
                 when starts_with(h.t, nq) then 0
                 when strpos(' ' || h.t, ' ' || nq) > 0 then 1
                 when strpos(h.t, nq) > 0 then 3
                 else 2
               end) as tier,
           max(word_similarity(nq, h.t)) as score
    from hits h
    group by h.venue_id
  ),
  matches as (
    select v.*, b.tier, b.score,
           case when near_lat is not null and near_lng is not null and v.lat is not null then
             2 * 6371 * asin(sqrt(
               power(sin(radians(v.lat - near_lat) / 2), 2)
               + cos(radians(near_lat)) * cos(radians(v.lat))
                 * power(sin(radians(v.lng - near_lng) / 2), 2)
             ))
           end as dist
    from best b
    join public.venues v on v.id = b.venue_id
  )
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

-- Merging keeps the merged venue's name and aliases on the survivor.
create or replace function public.merge_venues(from_id uuid, into_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  src public.venues;
  dst public.venues;
  moved_entries bigint;
  moved_runs bigint;
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
  lock table public.runs in share row exclusive mode;
  insert into public.runs(venue_id,title,show_id,start_date,end_date,source,source_url,confidence,last_seen_at)
  select into_id,title,show_id,start_date,end_date,source,source_url,confidence,last_seen_at from public.runs where venue_id = from_id
  on conflict(venue_id,title_key,start_date) do update set show_id = coalesce(runs.show_id,excluded.show_id), last_seen_at = greatest(runs.last_seen_at,excluded.last_seen_at);
  get diagnostics moved_runs = row_count;
  delete from public.runs where venue_id = from_id;
  -- Keep what the surviving venue lacks.
  update public.venues v set
    lat = coalesce(v.lat, src.lat), lng = coalesce(v.lng, src.lng),
    city = coalesce(v.city, src.city), country = coalesce(v.country, src.country)
  where v.id = into_id;
  insert into public.venue_aliases (venue_id, alias, kind, source)
  select into_id, left(src.name, 200), 'alternative', 'merge'
  where char_length(btrim(src.name)) >= 2
    and public.normalise_search_text(src.name) <> public.normalise_search_text(dst.name)
  on conflict (venue_id, search_text) do nothing;
  insert into public.venue_aliases (venue_id, alias, kind, valid_from, valid_to, source, created_by, created_at)
  select into_id, a.alias, a.kind, a.valid_from, a.valid_to, a.source, a.created_by, a.created_at
  from public.venue_aliases a where a.venue_id = from_id
    and a.search_text <> public.normalise_search_text(dst.name)
  on conflict (venue_id, search_text) do nothing;
  delete from public.venues v where v.id = from_id;
  return jsonb_build_object('entries', moved_entries);
end;
$$;

create or replace function public.crawl_match_venue(for_source uuid, observed jsonb, extraction uuid)
returns void language plpgsql set search_path = '' as $$
declare
  external text := observed->>'external_key';
  venue_name text := nullif(btrim(observed->>'name'), '');
  city_name text := nullif(btrim(observed->>'city'), '');
  country_name text := nullif(btrim(observed->>'country'), '');
  street text := nullif(btrim(observed->>'street'), '');
  postcode text := nullif(btrim(observed->>'postcode'), '');
  auditorium text := nullif(btrim(observed->>'auditorium'), '');
  granularity text := case when auditorium is null then 'venue' else 'auditorium' end;
  country_key text := public.crawl_country_key(country_name);
  city_key text := public.normalise_search_text(public.canonical_city(city_name, country_key));
  venue_key text := public.normalise_search_text(venue_name);
  -- Loose key: "Wyndham's Theatre" = "Wyndham's", "Soho Place" = "@sohoplace". Only ever used with location evidence.
  name_key text := public.crawl_venue_name_key(venue_name);
  former_keys text[] := array(select public.crawl_venue_name_key(value) from jsonb_array_elements_text(
    case when jsonb_typeof(observed->'former_names') = 'array' then observed->'former_names' else '[]'::jsonb end) f(value)
    where public.crawl_venue_name_key(value) <> '');
  source_lat double precision := (observed->>'lat')::double precision;
  source_lng double precision := (observed->>'lng')::double precision;
  external_id text := observed->>'wikidata_id';
  source_osm text := nullif(btrim(observed->>'osm_id'), '');
  -- A postcode centroid is less precise than a published point: widen the radius only for a trusted geocode.
  radius numeric := case when observed#>>'{geocode,provider}' in ('geocoded:postcodes.io', 'geocoded:nominatim') then 250 else 100 end;
  mapping public.crawl_source_entities%rowtype;
  compatible uuid[];
  plausible integer;
  target uuid;
  renamed uuid[];
  rename_review boolean := false;
  source_name text;
  reason text;
begin
  if length(external) not between 1 and 500 or external is null then return; end if;
  insert into public.crawl_source_entities (source_id, entity_kind, external_key)
  values (for_source, 'venue', external) on conflict do nothing;
  select * into mapping from public.crawl_source_entities m
  where m.source_id = for_source and m.entity_kind = 'venue' and m.external_key = external for update;

  if mapping.override_locked or mapping.resolution_status = 'linked' then return; end if;
  if not coalesce(source_lat between -90 and 90 and source_lng between -180 and 180, false) then
    source_lat := null;
    source_lng := null;
  end if;

  if observed->>'resolution_reason' = 'multiple_auditoria' or observed->>'granularity' = 'building' then
    reason := 'multiple_auditoria_or_building';
  elsif venue_name is null or city_name is null or country_name is null then
    reason := 'missing_explicit_venue_identity';
  else
    -- Only use a cross-source ID if both sides attest to the same granularity.
    if observed->>'id_granularity' = granularity then
      select v.id into target from public.venues v
      where v.wikidata_id = external_id and v.catalogue_granularity = granularity
        and public.normalise_search_text(v.catalogue_auditorium) is not distinct from public.normalise_search_text(auditorium);
    end if;
    if target is null then
      with regional as (
        select v.*,
          (public.normalise_search_text(v.name) = venue_key
            or (name_key <> '' and public.crawl_venue_name_key(v.name) = name_key)
            or public.crawl_venue_name_key(v.name) = any(former_keys)
            or exists (
              select 1 from public.venue_aliases al where al.venue_id = v.id
                and (al.search_text = venue_key
                  or (name_key <> '' and public.crawl_venue_name_key(al.alias) = name_key)
                  or public.crawl_venue_name_key(al.alias) = any(former_keys)))
            or exists (
            select 1 from public.crawl_source_entities prior where prior.entity_kind = 'venue'
              and prior.venue_id = v.id and prior.resolution_status = 'linked'
              and (public.normalise_search_text(prior.evidence->>'name') = venue_key
                or (name_key <> '' and public.crawl_venue_name_key(prior.evidence->>'name') = name_key))
          )) as same_name,
          coalesce(public.normalise_search_text(v.catalogue_postcode) = public.normalise_search_text(postcode), false)
            or coalesce(public.normalise_search_text(v.catalogue_street) = public.normalise_search_text(street), false)
            or coalesce(source_osm is not null and v.osm_id = source_osm, false)
            or coalesce(case when source_lat is not null and v.lat is not null then
              2 * 6371000 * asin(least(1, sqrt(
                power(sin(radians(v.lat - source_lat) / 2), 2)
                + cos(radians(source_lat)) * cos(radians(v.lat)) * power(sin(radians(v.lng - source_lng) / 2), 2)
              ))) <= radius end, false) as same_location,
          public.normalise_search_text(v.catalogue_auditorium) is not distinct from public.normalise_search_text(auditorium)
            as same_space,
          -- Rename evidence is stricter than the geocode radius: 100 m from a point, or the same postcode and street.
          (coalesce(case when source_lat is not null and v.lat is not null then
              2 * 6371000 * asin(least(1, sqrt(
                power(sin(radians(v.lat - source_lat) / 2), 2)
                + cos(radians(source_lat)) * cos(radians(v.lat)) * power(sin(radians(v.lng - source_lng) / 2), 2)
              ))) <= 100 end, false)
            or coalesce(postcode is not null and street is not null
              and public.normalise_search_text(v.catalogue_postcode) = public.normalise_search_text(postcode)
              and public.normalise_search_text(v.catalogue_street) = public.normalise_search_text(street), false))
            and not exists (
              select 1 from public.crawl_source_entities other where other.entity_kind = 'venue'
                and other.source_id = for_source and other.venue_id = v.id and other.resolution_status = 'linked'
                and other.external_key <> external)
            as rename_candidate
        from public.venues v
        where public.crawl_country_key(v.country) = country_key
          and public.normalise_search_text(public.canonical_city(v.city, country_key)) = city_key
      )
      select array_agg(id) filter (where same_name and same_location and same_space),
        count(*) filter (where same_name or same_location),
        case when count(*) filter (where same_name) = 0
          then array_agg(id) filter (where rename_candidate and same_space) end
      into compatible, plausible, renamed from regional;
      -- Exactly one same-name venue may pass a location check; two passing candidates stay held.
      if cardinality(compatible) = 1 then
        target := compatible[1];
      -- A new name in the same building: no venue or alias has it, and exactly one venue sits there. Link it, keep
      -- the name as an alias and flag it for review. Two qualifying venues are never auto-linked.
      elsif cardinality(renamed) = 1 and coalesce(plausible, 0) = 1 then
        target := renamed[1];
        rename_review := true;
      elsif coalesce(plausible, 0) > 0 or exists (select 1 from public.venues where wikidata_id = external_id) then
        reason := 'ambiguous_or_uncorroborated_venue';
      elsif street is null and postcode is null and source_lat is null then
        reason := 'missing_location_evidence';
      else
        insert into public.venues (name, city, country, lat, lng, source, verified, created_by,
          catalogue_street, catalogue_postcode, catalogue_auditorium, catalogue_granularity)
        values (left(venue_name, 200), left(city_name, 100), left(country_key, 100), source_lat, source_lng, 'crawler', false, null,
          left(street, 200), left(postcode, 40), left(auditorium, 200), granularity)
        returning id into target;
      end if;
    end if;
  end if;

  update public.crawl_source_entities m set venue_id = target,
    resolution_status = case when target is not null then 'linked' else 'ambiguous' end,
    resolution_reason = reason, evidence = observed, last_extraction_id = extraction,
    review_reason = case when rename_review then 'possible_rename' else m.review_reason end
  where m.source_id = for_source and m.entity_kind = 'venue' and m.external_key = external;

  if target is not null then
    source_name := (select s.source_key from public.crawl_sources s where s.id = for_source);
    perform public.record_venue_alias(target, venue_name, 'source_spelling', source_name);
    perform public.record_venue_alias(target, f.value, 'former', source_name)
    from jsonb_array_elements_text(
      case when jsonb_typeof(observed->'former_names') = 'array' then observed->'former_names' else '[]'::jsonb end) f(value);
  end if;
end;
$$;


-- Backfill: source names and Playbill former names already collected on linked entities.
insert into public.venue_aliases (venue_id, alias, kind, source)
select distinct on (e.venue_id, public.normalise_search_text(e.evidence->>'name'))
  e.venue_id, left(btrim(e.evidence->>'name'), 200), 'source_spelling',
  case when s.source_key in ('london_theatre', 'playbill', 'official') then s.source_key else 'admin' end
from public.crawl_source_entities e
join public.crawl_sources s on s.id = e.source_id
join public.venues v on v.id = e.venue_id
where e.entity_kind = 'venue' and e.resolution_status = 'linked'
  and char_length(btrim(coalesce(e.evidence->>'name', ''))) >= 2
  and public.normalise_search_text(e.evidence->>'name') <> public.normalise_search_text(v.name)
on conflict (venue_id, search_text) do nothing;

insert into public.venue_aliases (venue_id, alias, kind, source)
select e.venue_id, left(btrim(f.value), 200), 'former',
  case when s.source_key in ('london_theatre', 'playbill', 'official') then s.source_key else 'admin' end
from public.crawl_source_entities e
join public.crawl_sources s on s.id = e.source_id
join public.venues v on v.id = e.venue_id
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(e.evidence->'former_names') = 'array' then e.evidence->'former_names' else '[]'::jsonb end) f(value)
where e.entity_kind = 'venue' and e.resolution_status = 'linked'
  and char_length(btrim(f.value)) >= 2
  and public.normalise_search_text(f.value) <> public.normalise_search_text(v.name)
on conflict (venue_id, search_text) do update set kind = 'former';

-- The six names merged by hand into OSM rows (their entities may not carry the name). Each goes to the one London
-- venue that matches loosely; nothing is added when zero or several match.
with merged(label, hint, kind) as (values
  ('Judi Dench Theatre', 'shaftesbury', 'former'), ('Garrick Theatre', 'garrick', 'alternative'),
  ('Ambassadors Theatre', 'ambassadors', 'alternative'), ('Wyndham''s Theatre', 'wyndhams', 'alternative'),
  ('Criterion Theatre', 'criterion', 'alternative'), ('Soho Place', 'sohoplace', 'alternative')),
target as (
  select m.label, m.kind, (array_agg(v.id))[1] as venue_id, count(*) as n
  from merged m join public.venues v on public.crawl_venue_name_key(v.name) = m.hint
    and public.crawl_country_key(v.country) = public.crawl_country_key('GB')
    and public.normalise_search_text(v.city) = 'london'
  group by m.label, m.kind)
insert into public.venue_aliases (venue_id, alias, kind, source)
select t.venue_id, t.label, t.kind, 'merge' from target t
where t.n = 1 and public.normalise_search_text(t.label) <> public.normalise_search_text(
  (select name from public.venues where id = t.venue_id))
on conflict (venue_id, search_text) do nothing;
