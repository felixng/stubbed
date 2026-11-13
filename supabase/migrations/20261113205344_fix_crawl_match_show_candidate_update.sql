-- Fix the candidate update in crawl_match_show (#537, epic #536).
-- `title` is a local variable, and PL/pgSQL only lets a function name qualify parameters, so
-- `crawl_match_show.title` failed with 42P01 whenever a pending crawler candidate's cleaned
-- title, type, year or aliases had changed. The body below is the previous definition
-- (20261108230000_crawl_show_type_suggestions.sql) with a `<<fn>>` block label and `fn.title`.
create or replace function public.crawl_match_show(for_source uuid, source_key text, observed jsonb, extraction uuid)
returns boolean language plpgsql set search_path = '' as $$
<<fn>>
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
  suggestion public.crawl_show_type_suggestions%rowtype;
  match_source text := source_key;
  match_title text := title_key;
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
      update public.show_candidates c set title = fn.title, type = coalesce(kind, 'other'),
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
            -- Another event of this title at this venue was typed by a live suggestion (#450).
            or exists (select 1 from public.show_candidates c
              join public.crawl_show_type_suggestions s on s.id = c.type_suggestion_id
              where c.show_id = target and s.reverted_at is null and s.source_key = match_source
                and s.title_key = match_title and s.venue_id = venue_mapping.venue_id)
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
          -- No deterministic type. A confident stored suggestion (#450) may type a new show;
          -- otherwise it is held for review rather than published as an unverified Other.
          suggestion := public.crawl_show_type_suggestion(source_key, title_key, venue_mapping.venue_id);
          if suggestion.id is null then
            reason := 'unknown_show_type';
          else
            update public.show_candidates c set type = suggestion.suggested_type,
              type_suggestion_id = suggestion.id, updated_at = now() where c.id = candidate.id;
            target := public.approve_show_candidate(candidate.id, true, true);
          end if;
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
