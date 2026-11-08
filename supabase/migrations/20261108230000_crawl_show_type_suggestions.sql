-- Model-assisted show types for crawled shows that have none (#450, owner 2026-11-08: 1b 2a 3a).
--
-- London Theatre pages for past shows usually carry no category, so new shows from them are held
-- as 'unknown_show_type' (20261108200100). The crawler may now ask a model for a type, sending
-- only the cleaned title, the venue name and the run dates: never page HTML or text.
--
-- * Every answer is stored here with its provenance ('ai:<model>' or 'ai:<model>+web_search'),
--   the exact input sent and the token usage, so it can be audited and reverted.
-- * Deterministic evidence (categories, parser type, title cues) always wins: a suggestion is read
--   only where crawl_match_show would otherwise hold a new show as 'unknown_show_type'. It never
--   types a link to an existing show.
-- * Only the latest unreverted answer for a title at a venue counts, and only when it names a type
--   with confidence >= 0.80. 'unsure' and low confidence keep the hold.
-- * A confident 'other' publishes as Other (owner: 3a), so approve_show_candidate gains an
--   allow_other flag. The two-argument form is unchanged.
-- * crawl_revert_show_type_suggestions() withdraws answers by provenance. Shows they created that
--   no diary entry or run uses go back to held; any others are listed for admin review, unchanged.

create table public.crawl_show_type_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (source_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  title_key text not null check (length(title_key) between 1 and 300),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- The exact model input.
  title text not null check (length(title) between 1 and 200),
  venue_name text not null check (length(venue_name) between 1 and 200),
  first_date date,
  last_date date,
  verdict text not null check (verdict in ('type', 'unsure')),
  suggested_type public.show_type,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  provenance text not null check (provenance ~ '^ai:[a-z0-9.-]{1,60}(\+web_search)?$'),
  prompt_version integer not null check (prompt_version between 1 and 1000),
  usage jsonb not null default '{}'::jsonb,
  -- clock_timestamp: answers written in one transaction still order.
  created_at timestamptz not null default clock_timestamp(),
  reverted_at timestamptz,
  check ((verdict = 'type') = (suggested_type is not null)),
  unique (source_key, title_key, venue_id, provenance, prompt_version)
);
create index crawl_show_type_suggestions_lookup
  on public.crawl_show_type_suggestions (source_key, title_key, venue_id, created_at desc)
  where reverted_at is null;

alter table public.crawl_show_type_suggestions enable row level security;
revoke all on public.crawl_show_type_suggestions from public, anon, authenticated;
grant select, insert, update on public.crawl_show_type_suggestions to service_role;
create policy "Admins read show type suggestions" on public.crawl_show_type_suggestions
  for select to authenticated using ((select public.is_admin()));
grant select on public.crawl_show_type_suggestions to authenticated;

alter table public.show_candidates
  add column type_suggestion_id uuid references public.crawl_show_type_suggestions (id) on delete set null;
create index show_candidates_type_suggestion on public.show_candidates (type_suggestion_id)
  where type_suggestion_id is not null;

create function public.crawl_show_type_min_confidence()
returns numeric language sql immutable set search_path = '' as $$ select 0.80::numeric $$;

-- The latest unreverted answer for a title at a venue, when it is confident; otherwise no row.
create function public.crawl_show_type_suggestion(for_source text, for_title_key text, for_venue uuid)
returns public.crawl_show_type_suggestions language sql stable set search_path = '' as $$
  select latest.* from (
    select s.* from public.crawl_show_type_suggestions s
    where s.source_key = for_source and s.title_key = for_title_key and s.venue_id = for_venue
      and s.reverted_at is null
    order by s.created_at desc, s.id desc limit 1
  ) latest
  where latest.verdict = 'type' and latest.confidence >= public.crawl_show_type_min_confidence();
$$;

-- approve_show_candidate with an opt-in for a crawler candidate typed Other (a confident 'other'
-- suggestion). Same body otherwise; the two-argument form keeps refusing Other.
create function public.approve_show_candidate(candidate_id uuid, by_crawler boolean, allow_other boolean)
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
  if by_crawler and (candidate.source <> 'crawler'
      or (candidate.type = 'other' and not (coalesce(allow_other, false) and candidate.type_suggestion_id is not null))) then
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
    update public.shows set title = candidate.title where id = target and title <> candidate.title;
  end if;
  update public.show_candidates set status = 'added', show_id = target,
    reviewed_at = now(), updated_at = now(),
    review_method = case when by_crawler then 'crawler' else 'admin' end
  where id = candidate.id;
  return target;
end;
$$;

create or replace function public.approve_show_candidate(candidate_id uuid, by_crawler boolean)
returns uuid language sql set search_path = '' as $$
  select public.approve_show_candidate(candidate_id, by_crawler, false);
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

-- Held new shows that still need an answer for this provenance and prompt version, one row per
-- title at a venue, with exactly the fields the worker may send. With only_unconfident, just the
-- ones whose latest answer is unsure or below the threshold (the web-search pass).
create function public.crawl_show_types_to_suggest(for_source text, for_provenance text,
  for_prompt_version integer, only_unconfident boolean default false, max_rows integer default 50)
returns jsonb language sql stable set search_path = '' as $$
  with held as (
    select public.normalise_search_text(c.title) as title_key, m.venue_id,
      min(c.title) as title, min(v.name) as venue_name,
      min(d.value::date) as first_date, max(d.value::date) as last_date
    from public.crawl_source_entities m
    join public.crawl_sources s on s.id = m.source_id and s.source_key = for_source
    join public.show_candidates c on c.id = m.candidate_id and c.status = 'pending'
    join public.venues v on v.id = m.venue_id
    left join lateral (
      select x->>'date' as value from jsonb_array_elements(case when jsonb_typeof(m.evidence->'dates') = 'array'
        then m.evidence->'dates' else '[]'::jsonb end) x
      where x->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(x->>'date', 'date')
    ) d on true
    where m.entity_kind = 'event' and m.resolution_reason = 'unknown_show_type' and m.venue_id is not null
    group by 1, 2
  )
  select coalesce(jsonb_agg(to_jsonb(h) order by h.title_key, h.venue_id), '[]'::jsonb) from (
    select held.* from held
    where not exists (select 1 from public.crawl_show_type_suggestions s
        where s.source_key = for_source and s.title_key = held.title_key and s.venue_id = held.venue_id
          and s.provenance = for_provenance and s.prompt_version = for_prompt_version)
      and (not only_unconfident or (
        exists (select 1 from public.crawl_show_type_suggestions s
          where s.source_key = for_source and s.title_key = held.title_key and s.venue_id = held.venue_id
            and s.reverted_at is null)
        and (public.crawl_show_type_suggestion(for_source, held.title_key, held.venue_id)).id is null))
    order by held.title_key, held.venue_id
    limit least(500, greatest(0, coalesce(max_rows, 50)))
  ) h;
$$;

-- Stores one answer and re-queues identity for the held events it covers. Returns the new id, or
-- null when an answer for this provenance and prompt version already exists.
create function public.record_crawl_show_type_suggestion(for_source text, answer jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  key text := answer->>'title_key';
  venue uuid := (answer->>'venue_id')::uuid;
begin
  insert into public.crawl_show_type_suggestions (source_key, title_key, venue_id, title, venue_name,
    first_date, last_date, verdict, suggested_type, confidence, provenance, prompt_version, usage)
  values (for_source, key, venue, answer->>'title', answer->>'venue_name',
    (answer->>'first_date')::date, (answer->>'last_date')::date, answer->>'verdict',
    (answer->>'suggested_type')::public.show_type, (answer->>'confidence')::numeric,
    answer->>'provenance', (answer->>'prompt_version')::integer,
    case when jsonb_typeof(answer->'usage') = 'object' then answer->'usage' else '{}'::jsonb end)
  on conflict (source_key, title_key, venue_id, provenance, prompt_version) do nothing
  returning id into saved;
  if saved is null then return null; end if;

  update public.crawl_publication_queue q set identity_processed_at = null, identity_available_at = now(),
    identity_error = null
  from public.crawl_source_entities m
  join public.crawl_sources s on s.id = m.source_id and s.source_key = for_source
  join public.show_candidates c on c.id = m.candidate_id
  where q.extraction_id = m.last_extraction_id and m.entity_kind = 'event'
    and m.resolution_reason = 'unknown_show_type' and m.venue_id = venue
    and public.normalise_search_text(c.title) = key;
  return saved;
end;
$$;

-- Withdraws suggestions by provenance (optionally only those created since a time). A show they
-- created goes back to a held pending candidate when no diary entry or run uses it; otherwise it is
-- left as it is and returned for admin review. Diary entries are never changed.
create function public.crawl_revert_show_type_suggestions(for_provenance text, since timestamptz default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  reverted integer;
  reheld integer := 0;
  item record;
  review jsonb := '[]'::jsonb;
begin
  update public.crawl_show_type_suggestions set reverted_at = now()
  where provenance = for_provenance and reverted_at is null and (since is null or created_at >= since);
  get diagnostics reverted = row_count;

  for item in
    select c.id as candidate_id, c.show_id, sh.title, sh.type
    from public.show_candidates c
    join public.crawl_show_type_suggestions s on s.id = c.type_suggestion_id
    left join public.shows sh on sh.id = c.show_id
    where s.reverted_at is not null and c.status in ('added', 'pending')
    for update of c
  loop
    if item.show_id is not null and (
      exists (select 1 from public.entries e where e.show_id = item.show_id)
      or exists (select 1 from public.runs r where r.show_id = item.show_id)
    ) then
      review := review || jsonb_build_object('show_id', item.show_id, 'title', item.title, 'type', item.type);
      continue;
    end if;
    update public.crawl_source_entities set show_id = null, resolution_status = 'ambiguous',
      resolution_reason = 'unknown_show_type'
    where candidate_id = item.candidate_id or (item.show_id is not null and show_id = item.show_id);
    update public.show_candidates set status = 'pending', show_id = null, type = 'other',
      type_suggestion_id = null, review_method = null, reviewed_at = null, updated_at = now()
    where id = item.candidate_id;
    if item.show_id is not null then
      update public.crawl_run_evidence set show_id = null where show_id = item.show_id;
      delete from public.shows where id = item.show_id;
    end if;
    reheld := reheld + 1;
  end loop;
  return jsonb_build_object('reverted', reverted, 'reheld', reheld, 'needs_review', review);
end;
$$;

revoke all on function public.crawl_show_type_min_confidence(), public.crawl_show_type_suggestion(text, text, uuid),
  public.approve_show_candidate(uuid, boolean, boolean),
  public.crawl_show_types_to_suggest(text, text, integer, boolean, integer),
  public.record_crawl_show_type_suggestion(text, jsonb),
  public.crawl_revert_show_type_suggestions(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.crawl_show_type_min_confidence(), public.crawl_show_type_suggestion(text, text, uuid),
  public.approve_show_candidate(uuid, boolean, boolean),
  public.crawl_show_types_to_suggest(text, text, integer, boolean, integer),
  public.record_crawl_show_type_suggestion(text, jsonb),
  public.crawl_revert_show_type_suggestions(text, timestamptz)
  to service_role;
