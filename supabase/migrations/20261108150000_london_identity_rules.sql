-- #444: London identity rules. (1) Venue pages give a name and postcode but no coordinates, so the crawler
-- geocodes them (free postcodes.io / Nominatim, worker only, cached below) and the venue matcher accepts a
-- geocoded point within 250 m, an exact OSM id, or a postcode / street match, only for exactly one same-name
-- venue. (2) Shows whose source gives no deterministic type link to an existing show only on one exact,
-- corroborated title, else publish as an unverified show of type 'other'; existing types are never changed.

create table public.crawl_geocodes (
  provider text not null check (provider in ('postcodes.io', 'nominatim')),
  query_key text not null check (length(query_key) between 1 and 300),
  found boolean not null,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  fetched_at timestamptz not null default now(),
  primary key (provider, query_key),
  check (found = (lat is not null and lng is not null))
);
alter table public.crawl_geocodes enable row level security;
revoke all on public.crawl_geocodes from public, anon, authenticated;

create function public.get_crawl_geocode(for_provider text, for_query text)
returns table (found boolean, lat double precision, lng double precision, fetched_at timestamptz)
language sql stable set search_path = '' as $$
  select g.found, g.lat, g.lng, g.fetched_at from public.crawl_geocodes g
  where g.provider = for_provider and g.query_key = for_query;
$$;

create function public.put_crawl_geocode(for_provider text, for_query text, new_lat double precision, new_lng double precision)
returns boolean language sql set search_path = '' as $$
  insert into public.crawl_geocodes (provider, query_key, found, lat, lng)
  values (for_provider, for_query, new_lat is not null and new_lng is not null, new_lat, new_lng)
  on conflict (provider, query_key) do update set found = excluded.found, lat = excluded.lat,
    lng = excluded.lng, fetched_at = now()
  returning true;
$$;

-- Fill coordinates on a crawler-created venue that has none. Never moves an existing point.
create function public.backfill_crawler_venue_geo(venue uuid, new_lat double precision, new_lng double precision)
returns boolean language sql set search_path = '' as $$
  with updated as (
    update public.venues v set lat = new_lat, lng = new_lng
    where v.id = venue and v.source = 'crawler' and v.lat is null and v.lng is null
      and new_lat between -90 and 90 and new_lng between -180 and 180
    returning 1)
  select exists (select 1 from updated);
$$;

-- Unverified 'other' show for a crawler candidate whose source gave no deterministic type.
create function public.crawl_approve_other_candidate(candidate_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  candidate public.show_candidates%rowtype;
  target uuid;
begin
  select * into candidate from public.show_candidates c where c.id = candidate_id for update;
  if not found or candidate.status <> 'pending' or candidate.source <> 'crawler' or candidate.type <> 'other' then
    raise exception 'Not a pending crawler candidate of unknown type' using errcode = '22023';
  end if;
  insert into public.shows (title, type, first_performed, aliases, verified, created_by)
  values (candidate.title, 'other', candidate.first_performed, candidate.aliases, false, null)
  returning id into target;
  update public.shows set title = candidate.title where id = target and title <> candidate.title;
  update public.show_candidates set status = 'added', show_id = target, reviewed_at = now(), updated_at = now(),
    review_method = 'crawler' where id = candidate.id;
  return target;
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
          (public.normalise_search_text(v.name) = venue_key or exists (
            select 1 from public.crawl_source_entities prior where prior.entity_kind = 'venue'
              and prior.venue_id = v.id and prior.resolution_status = 'linked'
              and public.normalise_search_text(prior.evidence->>'name') = venue_key
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

create or replace function public.crawl_match_show(for_source uuid, source_key text, observed jsonb, extraction uuid)
returns boolean language plpgsql set search_path = '' as $$
declare
  external text := observed->>'external_key';
  title text := nullif(btrim(observed->>'raw_title'), '');
  title_key text := public.normalise_search_text(title);
  kind public.show_type;
  stable_id text := observed->>'wikidata_work_id';
  author text := nullif(public.normalise_search_text(observed->>'work_author'), '');
  work_year smallint;
  venue_key text := observed#>>'{venue,external_key}';
  venue_mapping public.crawl_source_entities%rowtype;
  mapping public.crawl_source_entities%rowtype;
  candidate public.show_candidates%rowtype;
  candidate_ref text;
  source_aliases text[];
  exact_ids uuid[];
  target uuid;
  reason text;
  excluded boolean;
begin
  if external is null or length(external) not between 1 and 500 then return true; end if;
  insert into public.crawl_source_entities (source_id, entity_kind, external_key)
  values (for_source, 'event', external) on conflict do nothing;
  select * into mapping from public.crawl_source_entities m
  where m.source_id = for_source and m.entity_kind = 'event' and m.external_key = external for update;
  if mapping.override_locked or mapping.resolution_status = 'linked' then return true; end if;

  if observed->>'show_type' in ('musical','play','opera','dance','comedy','standup') then
    kind := (observed->>'show_type')::public.show_type;
  end if;
  if observed->>'first_performed' ~ '^[1-9][0-9]{0,3}$'
     and (observed->>'first_performed')::integer <= 2200 then
    work_year := (observed->>'first_performed')::smallint;
  end if;

  excluded := coalesce(observed->>'event_kind' in ('class','workshop','building_tour','other','concert'), false)
    or title is null or length(title) > 200 or title_key ~ '^(tickets?|buy tickets|book now|gift cards?|more info|learn more)$';
  if excluded then
    reason := 'excluded_or_invalid_event';
  else
    candidate_ref := 'venue-first:' || source_key || ':' || external;
    if length(candidate_ref) > 200 then candidate_ref := 'venue-first:' || encode(extensions.digest(candidate_ref, 'sha256'), 'hex'); end if;
    source_aliases := array(
      select distinct btrim(value) from jsonb_array_elements_text(
        case when jsonb_typeof(observed->'aliases') = 'array' then observed->'aliases' else '[]'::jsonb end
      ) a(value) where length(btrim(value)) between 2 and 100 and btrim(value) <> title order by btrim(value) limit 10
    );
    insert into public.show_candidates (title, type, first_performed, aliases, source, source_ref, source_url)
    values (title, coalesce(kind, 'other'), work_year, source_aliases, 'crawler', candidate_ref, left(observed->>'source_url', 500))
    on conflict (source, source_ref) do nothing;

    select * into candidate from public.show_candidates c
    where c.source = 'crawler' and c.source_ref = candidate_ref for update;
    if candidate.status = 'pending' and (candidate.title, candidate.type, candidate.first_performed, candidate.aliases)
        is distinct from (title, coalesce(kind, 'other'), work_year, source_aliases) then
      update public.show_candidates c set title = crawl_match_show.title, type = coalesce(kind, 'other'),
        first_performed = work_year, aliases = source_aliases, updated_at = now() where c.id = candidate.id;
    end if;
    select * into venue_mapping from public.crawl_source_entities m
    where m.source_id = for_source and m.entity_kind = 'venue' and m.external_key = venue_key;

    if candidate.status = 'rejected' then
      excluded := true;
      reason := 'review_rejected';
    elsif candidate.status in ('same','added') and candidate.show_id is not null then
      target := candidate.show_id;
    elsif observed->>'event_kind' is null or observed->>'event_kind' not in ('show', 'unknown') then
      reason := 'unknown_supported_show_type';
    elsif venue_mapping.venue_id is null then
      reason := case when venue_key is not null and venue_mapping.external_key is null
        then 'awaiting_venue_detail' else 'venue_unresolved' end;
    else
      if kind is not null and stable_id ~ '^Q[1-9][0-9]*$' then
        select s.id into target from public.shows s
        where s.wikidata_id = stable_id and s.type = kind
          and (work_year is null or s.first_performed is null or s.first_performed = work_year);
        if target is null and exists (select 1 from public.shows where wikidata_id = stable_id) then
          reason := 'conflicting_stable_work';
        end if;
      end if;

      if target is null and reason is null then
        select array_agg(s.id) into exact_ids from public.shows s
        where public.normalise_search_text(s.title) = title_key
          or exists (select 1 from unnest(s.aliases) a where public.normalise_search_text(a) = title_key)
          or exists (select 1 from public.show_aliases a where a.show_id = s.id
            and public.normalise_search_text(a.alias) = title_key);
        if cardinality(exact_ids) = 1 then
          select s.id into target from public.shows s where s.id = exact_ids[1] and (kind is null or s.type = kind)
            and (stable_id is null or s.wikidata_id is null or s.wikidata_id = stable_id)
            and (work_year is null or s.first_performed is null or s.first_performed = work_year);
          if target is null then
            reason := 'conflicting_exact_show';
          elsif kind is null and not (
            -- Unknown type: link only when the resolved venue or earlier run evidence corroborates this exact title.
            exists (select 1 from public.runs r where r.show_id = target and r.venue_id = venue_mapping.venue_id)
            or exists (select 1 from public.crawl_run_evidence e where e.show_id = target
              and e.venue_id = venue_mapping.venue_id and e.withdrawn_at is null)
          ) then
            target := null;
            reason := 'uncorroborated_exact_show';
          end if;
        elsif cardinality(exact_ids) > 1 then
          reason := 'multiple_exact_shows';
        end if;
      end if;

      if target is not null and exists (
        select 1 from public.crawl_source_entities other where other.show_id = target
          and ((author is not null and other.evidence->>'work_author' is not null
                and public.normalise_search_text(other.evidence->>'work_author') <> author)
            or (stable_id is not null and other.evidence->>'wikidata_work_id' is not null
                and other.evidence->>'wikidata_work_id' <> stable_id))
      ) then
        target := null;
        reason := 'conflicting_work_evidence';
      end if;

      if target is not null then
        update public.show_candidates set status = 'same', show_id = target, review_method = 'crawler',
          reviewed_at = now(), updated_at = now() where id = candidate.id;
      elsif reason is null then
        if exists (select 1 from public.similar_shows(title)) then
          reason := 'plausible_show_requires_resolution';
        elsif observed->>'date_status' is distinct from 'supported' or not exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(observed->'dates') = 'array'
            then observed->'dates' else '[]'::jsonb end) d
          where d->>'kind' in ('start','preview','opening','performance')
            and d->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(d->>'date', 'date')
        ) then
          reason := 'missing_supported_date';
        else
          target := case when kind is null then public.crawl_approve_other_candidate(candidate.id)
            else public.approve_show_candidate(candidate.id, true) end;
        end if;
      end if;
    end if;
  end if;

  update public.crawl_source_entities m set show_id = target, venue_id = venue_mapping.venue_id,
    candidate_id = candidate.id, evidence = observed, last_extraction_id = extraction,
    resolution_status = case
      when target is not null then 'linked' when excluded then 'excluded'
      when reason = 'awaiting_venue_detail' then 'pending' else 'ambiguous' end,
    resolution_reason = reason
  where m.source_id = for_source and m.entity_kind = 'event' and m.external_key = external;
  return reason is distinct from 'awaiting_venue_detail';
end;
$$;

revoke all on function public.get_crawl_geocode(text, text), public.put_crawl_geocode(text, text, double precision, double precision),
  public.backfill_crawler_venue_geo(uuid, double precision, double precision), public.crawl_approve_other_candidate(uuid)
  from public, anon, authenticated;
grant execute on function public.get_crawl_geocode(text, text), public.put_crawl_geocode(text, text, double precision, double precision),
  public.backfill_crawler_venue_geo(uuid, double precision, double precision), public.crawl_approve_other_candidate(uuid)
  to service_role;

-- Multi-category type parsing changes the London parser output.
update public.crawl_sources set adapter_version = 'london-theatre-v3' where source_key = 'london_theatre';
