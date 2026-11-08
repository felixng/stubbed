-- London Theatre publication rules after the 2026-11-08 dry run (#444).
--
-- 1. Titles lose source decoration before matching or creating a show: ticket-event prefixes,
--    company suffixes ("- Royal Ballet and Opera") and a trailing "(<venue>)". The raw title is
--    kept as an alias on the candidate.
-- 2. Show type comes from the first category that names a type ("Musicals, Romance, Comedy" is a
--    musical; owner: pick the first matching category), then the parser's type, then cues in the
--    title ("in Concert", "The Musical", "English National Opera", "Ballet").
-- 3. Concerts are a show type (20261108200000), no longer excluded.
-- 4. A new show whose type is still unknown is held as a pending candidate ('unknown_show_type')
--    instead of being published as an unverified Other. Links to existing shows are unchanged.
--
-- These read stored evidence, so they apply on the next identity pass without refetching pages.

create or replace function public.crawl_clean_title(source_key text, raw text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(raw);
begin
  if t is null or t = '' then return null; end if;
  if source_key = 'london_theatre' then
    t := regexp_replace(t, '^(?:(?:spring|summer|autumn|winter)\s+)?ticket\s+event\s*[-–—:]\s*', '', 'i');
    t := regexp_replace(t,
      '\s+[-–—]\s+(?:royal ballet and opera|english national opera|english national ballet|london)\s*$', '', 'i');
    t := regexp_replace(t, '\s*\([^()]*\m(?:theatre|playhouse|hall|church|opera house)\M[^()]*\)\s*$', '', 'i');
    t := btrim(t);
  end if;
  return case when length(t) >= 2 then t else btrim(raw) end;
end;
$$;

create or replace function public.crawl_event_show_type(source_key text, observed jsonb)
returns public.show_type language plpgsql immutable set search_path = '' as $$
declare
  raw text := coalesce(observed->>'raw_title', '');
  title text := coalesce(public.crawl_clean_title(source_key, raw), '');
  category text;
  generic boolean := false;
begin
  for category in
    select lower(btrim(part))
    from jsonb_array_elements(case when jsonb_typeof(observed#>'{evidence,categories}') = 'array'
           then observed#>'{evidence,categories}' else '[]'::jsonb end) with ordinality a(item, item_order),
         lateral regexp_split_to_table(coalesce(a.item->>'text', ''), '[,/|]') with ordinality p(part, part_order)
    where btrim(part) <> ''
    order by item_order, part_order
  loop
    case
      when category in ('musicals', 'musical') then return 'musical';
      when category in ('plays', 'play') then return 'play';
      when category = 'opera' then return 'opera';
      when category in ('ballet', 'dance') then return 'dance';
      when category in ('comedy', 'comedy shows') then return 'comedy';
      when category in ('stand up', 'stand-up', 'stand-up comedy') then return 'standup';
      when category in ('concerts', 'concert') then return 'concert';
      when category in ('drama', 'plays & drama') then generic := true;
      else null;
    end case;
  end loop;
  if generic then return 'play'; end if;

  if observed->>'show_type' in ('musical', 'play', 'opera', 'dance', 'comedy', 'standup', 'concert') then
    return (observed->>'show_type')::public.show_type;
  end if;
  if observed->>'event_kind' = 'concert' then return 'concert'; end if;

  if title ~* '(\min concert\M|\mconcerts?\M|by candlelight|\mgala\M|symphon|\morchestra|sing-?a-?long|\mlive in (london|concert)\M)' then
    return 'concert';
  elsif title ~* '(\mthe musical\M|\ma new musical\M|\mmusical$)' then
    return 'musical';
  elsif raw ~* 'english national opera' or title ~* '\mopera\M' then
    return 'opera';
  elsif raw ~* 'english national ballet' or title ~* '(\mballet\M|\mdance\M|\mtap\M|flamenco)' then
    return 'dance';
  end if;
  return null;
end;
$$;

create or replace function public.crawl_match_show(for_source uuid, source_key text, observed jsonb, extraction uuid)
returns boolean language plpgsql set search_path = '' as $$
declare
  external text := observed->>'external_key';
  raw_title text := nullif(btrim(observed->>'raw_title'), '');
  title text := public.crawl_clean_title(source_key, observed->>'raw_title');
  title_key text := public.normalise_search_text(title);
  kind public.show_type := public.crawl_event_show_type(source_key, observed);
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

  if observed->>'first_performed' ~ '^[1-9][0-9]{0,3}$'
     and (observed->>'first_performed')::integer <= 2200 then
    work_year := (observed->>'first_performed')::smallint;
  end if;

  excluded := coalesce(observed->>'event_kind' in ('class','workshop','building_tour','other'), false)
    or title is null or length(title) > 200 or title_key ~ '^(tickets?|buy tickets|book now|gift cards?|more info|learn more)$';
  if excluded then
    reason := 'excluded_or_invalid_event';
  else
    candidate_ref := 'venue-first:' || source_key || ':' || external;
    if length(candidate_ref) > 200 then candidate_ref := 'venue-first:' || encode(extensions.digest(candidate_ref, 'sha256'), 'hex'); end if;
    source_aliases := array(
      select distinct btrim(value) from jsonb_array_elements_text(
        case when jsonb_typeof(observed->'aliases') = 'array' then observed->'aliases' else '[]'::jsonb end
        || case when raw_title is distinct from title then jsonb_build_array(raw_title) else '[]'::jsonb end
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
    elsif observed->>'event_kind' is null or observed->>'event_kind' not in ('show', 'unknown', 'concert') then
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
          -- An existing Other is an under-typed show, not a conflicting one.
          select s.id into target from public.shows s
          where s.id = exact_ids[1] and (kind is null or s.type = kind or s.type = 'other')
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
        elsif kind is null then
          -- Held for review (or a later typing step) rather than published as an unverified Other.
          reason := 'unknown_show_type';
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

revoke all on function public.crawl_clean_title(text, text), public.crawl_event_show_type(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.crawl_clean_title(text, text), public.crawl_event_show_type(text, jsonb)
  to service_role;

-- First-category typing and concert types change the London parser output.
update public.crawl_sources set adapter_version = 'london-theatre-v4' where source_key = 'london_theatre';
