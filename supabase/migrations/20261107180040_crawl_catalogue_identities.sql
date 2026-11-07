alter table public.venues
  add column catalogue_street text check (length(catalogue_street) <= 200),
  add column catalogue_postcode text check (length(catalogue_postcode) <= 40),
  add column catalogue_auditorium text check (length(catalogue_auditorium) <= 200),
  add column catalogue_granularity text check (catalogue_granularity in ('venue', 'auditorium'));

alter table public.show_candidates
  add column review_method text check (review_method in ('admin', 'crawler'));

alter table public.crawl_source_entities
  add column resolution_status text not null default 'pending'
    check (resolution_status in ('pending', 'linked', 'ambiguous', 'excluded')),
  add column resolution_reason text,
  add column override_locked boolean not null default false,
  add column evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  add column last_extraction_id uuid references public.crawl_extractions (id),
  add column candidate_id uuid references public.show_candidates (id) on delete set null;

create index crawl_source_entities_extraction on public.crawl_source_entities (last_extraction_id)
  where last_extraction_id is not null;
create index crawl_source_entities_candidate on public.crawl_source_entities (candidate_id)
  where candidate_id is not null;

alter table public.crawl_publication_queue
  add column identity_processed_at timestamptz,
  add column identity_available_at timestamptz not null default now(),
  add column identity_error text;

create index crawl_publication_identity_due on public.crawl_publication_queue (identity_available_at, queued_at)
  where identity_processed_at is null;

-- Share the reviewed-candidate publication path with the admin RPC. A crawler
-- approval is unverified and retains the validated source spelling.
create function public.approve_show_candidate(candidate_id uuid, by_crawler boolean)
returns uuid language plpgsql set search_path = '' as $$
declare
  candidate public.show_candidates%rowtype;
  target uuid;
begin
  select * into candidate from public.show_candidates c where c.id = candidate_id for update;
  if not found then
    raise exception 'No such candidate' using errcode = 'P0002';
  end if;
  if candidate.status <> 'pending' then
    raise exception 'This candidate has already been reviewed' using errcode = '22023';
  end if;
  if by_crawler and (candidate.source <> 'crawler' or candidate.type = 'other') then
    raise exception 'Crawler candidate lacks supported type' using errcode = '22023';
  end if;

  if candidate.source = 'wikidata' then
    select id into target from public.shows where wikidata_id = candidate.source_ref;
  end if;
  if target is not null then
    update public.show_candidates set status = 'same', show_id = target,
      reviewed_at = now(), updated_at = now(), review_method = 'admin' where id = candidate.id;
    return target;
  end if;

  insert into public.shows (title, type, wikidata_id, first_performed, aliases, verified, created_by)
  values (case when by_crawler then candidate.title else public.tidy_show_title(candidate.title) end,
    candidate.type, case when candidate.source = 'wikidata' then candidate.source_ref end,
    candidate.first_performed, candidate.aliases, not by_crawler, null)
  returning id into target;
  if by_crawler then
    -- The existing insert trigger tidies typed-in titles. Preserve this new
    -- source title inside the same transaction without changing that trigger.
    update public.shows set title = candidate.title where id = target and title <> candidate.title;
  end if;
  update public.show_candidates set status = 'added', show_id = target,
    reviewed_at = now(), updated_at = now(),
    review_method = case when by_crawler then 'crawler' else 'admin' end
  where id = candidate.id;
  return target;
end;
$$;

create or replace function public.admin_add_candidate(candidate_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return public.approve_show_candidate(candidate_id, false);
end;
$$;

create function public.crawl_country_key(value text)
returns text language sql immutable set search_path = '' as $$
  select case public.normalise_search_text(value)
    when 'united kingdom' then 'gb' when 'uk' then 'gb' when 'england' then 'gb'
    when 'united states' then 'us' when 'united states of america' then 'us' when 'usa' then 'us'
    else public.normalise_search_text(value)
  end;
$$;

create function public.crawl_match_venue(for_source uuid, observed jsonb, extraction uuid)
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
            or coalesce(case when source_lat is not null and v.lat is not null then
              2 * 6371000 * asin(least(1, sqrt(
                power(sin(radians(v.lat - source_lat) / 2), 2)
                + cos(radians(source_lat)) * cos(radians(v.lat)) * power(sin(radians(v.lng - source_lng) / 2), 2)
              ))) <= 100 end, false) as same_location,
          public.normalise_search_text(v.catalogue_auditorium) is not distinct from public.normalise_search_text(auditorium)
            as same_space
        from public.venues v
        where public.crawl_country_key(v.country) = country_key
          and public.normalise_search_text(public.canonical_city(v.city, country_key)) = city_key
      )
      select array_agg(id) filter (where same_name and same_location and same_space),
        count(*) filter (where same_name or same_location)
      into compatible, plausible from regional;
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

-- Return false while the referenced venue has yet to reach identity
-- publication. A resolved or actionable ambiguous observation returns true.
create function public.crawl_match_show(for_source uuid, source_key text, observed jsonb, extraction uuid)
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
    elsif kind is null or observed->>'event_kind' is distinct from 'show' then
      reason := 'unknown_supported_show_type';
    elsif venue_mapping.venue_id is null then
      reason := case when venue_key is not null and venue_mapping.external_key is null
        then 'awaiting_venue_detail' else 'venue_unresolved' end;
    else
      if stable_id ~ '^Q[1-9][0-9]*$' then
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
          select s.id into target from public.shows s where s.id = exact_ids[1] and s.type = kind
            and (stable_id is null or s.wikidata_id is null or s.wikidata_id = stable_id)
            and (work_year is null or s.first_performed is null or s.first_performed = work_year);
          if target is null then reason := 'conflicting_exact_show'; end if;
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
          target := public.approve_show_candidate(candidate.id, true);
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

create function public.publish_crawl_identities(for_source text, batch_size integer default 25)
returns jsonb language plpgsql set search_path = '' as $$
declare
  source uuid;
  item record;
  observed jsonb;
  complete boolean;
  processed integer := 0;
  deferred integer := 0;
  failed integer := 0;
begin
  -- Serialise automatic identity matching across sources. Other workers can
  -- continue fetching, and a process failure releases the transaction lock.
  if not pg_try_advisory_xact_lock(419, 423) then return jsonb_build_object('busy', true); end if;
  select id into source from public.crawl_sources
  where source_key = for_source and publication_enabled for share;
  if not found then return jsonb_build_object('inactive', true); end if;

  for item in
    select e.id, e.observations, e.parser_version, e.content_hash, t.id as task_id, t.stage, g.is_current
    from public.crawl_publication_queue q
    join public.crawl_extractions e on e.id = q.extraction_id
    join public.crawl_tasks t on t.id = e.task_id
    join public.crawl_generations g on g.id = t.generation_id
    where t.source_id = source and q.identity_processed_at is null and q.identity_available_at <= now()
    order by case t.stage when 'venue' then 0 when 'event' then 1 else 2 end, q.queued_at, e.id
    limit least(100, greatest(0, coalesce(batch_size, 25))) for update of q skip locked
  loop
    begin
      complete := true;
      perform 1 from public.crawl_tasks t where t.id = item.task_id
        and t.parser_version = item.parser_version and t.content_hash = item.content_hash for share;
      if item.is_current and found then
        for observed in select value from jsonb_array_elements(item.observations) loop
          if item.stage = 'venue' and observed->>'observation_kind' = 'venue' then
            perform public.crawl_match_venue(source, observed, item.id);
          elsif item.stage = 'event' and observed->>'observation_kind' = 'event' then
            if not public.crawl_match_show(source, for_source, observed, item.id) then complete := false; end if;
          end if;
        end loop;
      end if;
      if complete then
        update public.crawl_publication_queue set identity_processed_at = now(), identity_error = null
        where extraction_id = item.id;
        processed := processed + 1;
      else
        update public.crawl_publication_queue set identity_available_at = now() + interval '5 minutes',
          identity_error = 'awaiting_venue_detail' where extraction_id = item.id;
        deferred := deferred + 1;
      end if;
    exception when others then
      update public.crawl_publication_queue set identity_available_at = now() + interval '5 minutes',
        identity_error = 'identity_transaction:' || sqlstate where extraction_id = item.id;
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('processed', processed, 'deferred', deferred, 'failed', failed);
end;
$$;

revoke all on function public.approve_show_candidate(uuid, boolean), public.crawl_country_key(text),
  public.crawl_match_venue(uuid, jsonb, uuid), public.crawl_match_show(uuid, text, jsonb, uuid),
  public.publish_crawl_identities(text, integer) from public, anon, authenticated;
grant execute on function public.approve_show_candidate(uuid, boolean), public.crawl_country_key(text),
  public.crawl_match_venue(uuid, jsonb, uuid), public.crawl_match_show(uuid, text, jsonb, uuid),
  public.publish_crawl_identities(text, integer) to service_role;
