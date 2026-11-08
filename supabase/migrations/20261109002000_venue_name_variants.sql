-- Venue name variants (#444, #447; owner 2026-11-08). London Theatre's first pass created five venues 6-34 m from
-- the OSM venue they duplicate ("Garrick Theatre" / "Garrick", "Soho Place" / "@sohoplace") because names had to
-- match exactly. Those five were merged by hand. Matching now also compares a loose name key (no leading "The" or
-- "@", no trailing "Theatre"/"Theater", no spaces or punctuation) and a source's former names
-- ("Noël Coward Theatre (formerly Albery)"). A name still never links on its own: exactly one candidate must
-- also share the postcode or street, the OSM id, or sit within the geocode radius.

create or replace function public.crawl_venue_name_key(raw text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(public.normalise_search_text(regexp_replace(coalesce(raw, ''), '^\s*@', '')), '^the\s+', ''),
      '\s+(theatre|theater)$', ''),
    '[^[:alnum:]]', '', 'g');
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
            as same_space
        from public.venues v
        where public.crawl_country_key(v.country) = country_key
          and public.normalise_search_text(public.canonical_city(v.city, country_key)) = city_key
      )
      select array_agg(id) filter (where same_name and same_location and same_space),
        count(*) filter (where same_name or same_location)
      into compatible, plausible from regional;
      -- Exactly one same-name venue may pass a location check; two passing candidates stay held.
      if cardinality(compatible) = 1 then
        target := compatible[1];
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
    resolution_reason = reason, evidence = observed, last_extraction_id = extraction
  where m.source_id = for_source and m.entity_kind = 'venue' and m.external_key = external;
end;
$$;

revoke all on function public.crawl_venue_name_key(text) from public, anon, authenticated;
grant execute on function public.crawl_venue_name_key(text) to service_role;

-- The worker's new theatre-name geocode fallback only runs when a venue page is fetched again: re-queue the
-- aggregate venue pages (about 145).
update public.crawl_tasks t set status = 'pending', available_at = clock_timestamp(),
  etag = null, last_modified = null, consecutive_failures = 0,
  lease_owner = null, lease_token = null, lease_expires_at = null
from public.crawl_sources s
where s.id = t.source_id and s.source_key in ('playbill', 'london_theatre') and t.stage = 'venue' and t.status = 'succeeded';
