-- Candidate show names, reviewed before they join the show list (#366).
-- Wikidata has far more stage works than the 3,322 we hold, but pulling them
-- straight into `shows` would put unchecked names in everyone's search. They
-- land here instead: admin read only, never in search_shows, and added by an
-- admin one at a time or in bulk after a sample scores well.

create table public.show_candidates (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  type            public.show_type not null default 'other',
  first_performed smallint check (first_performed between 1 and 2200),
  aliases         text[] not null default '{}',
  source          text not null default 'wikidata' check (source in ('wikidata', 'crawler')),
  source_ref      text not null check (char_length(source_ref) <= 200),
  source_url      text check (char_length(source_url) <= 500),
  seen_count      integer not null default 1 check (seen_count >= 1),
  status          text not null default 'pending' check (status in ('pending', 'added', 'same', 'rejected')),
  show_id         uuid references public.shows (id) on delete set null,
  sample_id       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  unique (source, source_ref)
);

create index show_candidates_status on public.show_candidates (status, seen_count desc);
create index show_candidates_sample on public.show_candidates (sample_id) where sample_id is not null;
create index show_candidates_show on public.show_candidates (show_id);

alter table public.show_candidates enable row level security;
revoke all on public.show_candidates from anon, authenticated;
grant select on public.show_candidates to authenticated;
create policy "Admins read show candidates"
  on public.show_candidates for select
  to authenticated
  using (public.is_admin());

-- The pull (sync-wikidata.mjs --candidates): service role only. Never writes
-- to shows. A name already in the catalogue by Wikidata id is skipped; one
-- seen before only has its counter raised, and its details refreshed while it
-- is still pending, so a decision already made is never undone.
create function public.load_show_candidates(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  skipped bigint;
  inserted bigint;
  seen_again bigint;
begin
  drop table if exists _cand_in;
  create temp table _cand_in on commit drop as
    select x.wikidata_id, x.title, x.type, x.first_performed, coalesce(x.aliases, '{}') as aliases
    from jsonb_to_recordset(rows) as x(wikidata_id text, title text, type public.show_type, first_performed smallint, aliases text[]);

  select count(*) into skipped from _cand_in i
  where exists (select 1 from public.shows s where s.wikidata_id = i.wikidata_id);

  update public.show_candidates c
  set seen_count = c.seen_count + 1, updated_at = now(),
      title = case when c.status = 'pending' then i.title else c.title end,
      type = case when c.status = 'pending' then i.type else c.type end,
      first_performed = case when c.status = 'pending' then i.first_performed else c.first_performed end,
      aliases = case when c.status = 'pending' then i.aliases else c.aliases end
  from _cand_in i
  where c.source = 'wikidata' and c.source_ref = i.wikidata_id;
  get diagnostics seen_again = row_count;

  insert into public.show_candidates (title, type, first_performed, aliases, source, source_ref, source_url)
  select i.title, i.type, i.first_performed, i.aliases, 'wikidata', i.wikidata_id, 'https://www.wikidata.org/wiki/' || i.wikidata_id
  from _cand_in i
  where not exists (select 1 from public.shows s where s.wikidata_id = i.wikidata_id)
    and not exists (select 1 from public.show_candidates c where c.source = 'wikidata' and c.source_ref = i.wikidata_id);
  get diagnostics inserted = row_count;

  return jsonb_build_object('inserted', inserted, 'seen_again', seen_again, 'already_in_catalogue', skipped);
end;
$$;

-- Candidates matching the filters, each with its closest existing show (from
-- similar_shows; `match_same` = it reads as the same show). The match is
-- looked up for the page only, because similar_shows is the slow part.
create function public.admin_list_candidates(
  q           text    default null,
  in_type     text    default null,
  in_status   text    default 'pending',
  in_sample   uuid    default null,
  page_size   integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid, title text, type public.show_type, first_performed smallint, aliases text[],
  source_ref text, source_url text, seen_count integer, status text, show_id uuid, sample_id uuid,
  match_id uuid, match_title text, match_type public.show_type, match_same boolean
)
language plpgsql stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  nq text := public.normalise_search_text(q);
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  with page as (
    select c.* from public.show_candidates c
    where (nq is null or nq = '' or public.normalise_search_text(c.title) like '%' || nq || '%')
      and (in_type is null or c.type::text = in_type)
      and (in_status is null or c.status = in_status)
      and (in_sample is null or c.sample_id = in_sample)
    order by c.seen_count desc, c.first_performed desc nulls last, c.title, c.id
    limit least(greatest(page_size, 1), 100) offset greatest(page_offset, 0)
  )
  select p.id, p.title, p.type, p.first_performed, p.aliases, p.source_ref, p.source_url, p.seen_count,
         p.status, p.show_id, p.sample_id, m.id, m.title, m.type, m.same
  from page p
  left join lateral (select x.id, x.title, x.type, x.same from public.similar_shows(p.title) x limit 1) m on true
  order by p.seen_count desc, p.first_performed desc nulls last, p.title, p.id;
end;
$$;

create function public.admin_candidate_totals(
  q text default null, in_type text default null, in_sample uuid default null
)
returns table (candidates bigint, pending bigint, added bigint, same bigint, rejected bigint)
language plpgsql stable
security definer
set search_path = public, extensions
as $$
declare
  nq text := public.normalise_search_text(q);
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  select count(*), count(*) filter (where c.status = 'pending'), count(*) filter (where c.status = 'added'),
         count(*) filter (where c.status = 'same'), count(*) filter (where c.status = 'rejected')
  from public.show_candidates c
  where (nq is null or nq = '' or public.normalise_search_text(c.title) like '%' || nq || '%')
    and (in_type is null or c.type::text = in_type)
    and (in_sample is null or c.sample_id = in_sample);
end;
$$;

-- Add one candidate as a show: the title is tidied as for a typed-in show,
-- the Wikidata id is kept, and it counts as verified. If the id is already a
-- show, the candidate is linked to it instead.
create function public.admin_add_candidate(candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.show_candidates;
  existing uuid;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select * into c from public.show_candidates x where x.id = candidate_id for update;
  if c.id is null then
    raise exception 'No such candidate' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'This candidate has already been reviewed' using errcode = '22023';
  end if;
  select s.id into existing from public.shows s where c.source = 'wikidata' and s.wikidata_id = c.source_ref;
  if existing is not null then
    update public.show_candidates x set status = 'same', show_id = existing, reviewed_at = now(), updated_at = now() where x.id = c.id;
    return existing;
  end if;
  insert into public.shows (title, type, wikidata_id, first_performed, aliases, verified, created_by)
  values (public.tidy_show_title(c.title), c.type, case when c.source = 'wikidata' then c.source_ref end, c.first_performed, c.aliases, true, null)
  returning id into new_id;
  update public.show_candidates x set status = 'added', show_id = new_id, reviewed_at = now(), updated_at = now() where x.id = c.id;
  return new_id;
end;
$$;

-- The candidate is an existing show under another name: link it, and save the
-- candidate's name as a nickname so searching it finds that show.
create function public.admin_candidate_same_as(candidate_id uuid, as_show uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.show_candidates;
  existing_title text;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select * into c from public.show_candidates x where x.id = candidate_id for update;
  if c.id is null then
    raise exception 'No such candidate' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'This candidate has already been reviewed' using errcode = '22023';
  end if;
  select s.title into existing_title from public.shows s where s.id = as_show;
  if existing_title is null then
    raise exception 'No such show' using errcode = 'P0002';
  end if;
  if public.normalise_show_title(c.title) is distinct from public.normalise_show_title(existing_title)
     and char_length(btrim(c.title)) between 2 and 100 then
    insert into public.show_aliases (show_id, alias) values (as_show, btrim(c.title))
    on conflict (show_id, search_text) do nothing;
  end if;
  update public.show_candidates x set status = 'same', show_id = as_show, reviewed_at = now(), updated_at = now() where x.id = c.id;
end;
$$;

create function public.admin_reject_candidate(candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.show_candidates x set status = 'rejected', reviewed_at = now(), updated_at = now()
  where x.id = candidate_id and x.status = 'pending';
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'No pending candidate with that id' using errcode = 'P0002';
  end if;
end;
$$;

-- A random sample of pending candidates in a group, to check before adding
-- the rest. Reviewing them (add, same as, not a show) is the score.
create function public.admin_start_candidate_sample(q text default null, in_type text default null, sample_size integer default 50)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  nq text := public.normalise_search_text(q);
  sid uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.show_candidates c set sample_id = sid
  where c.id in (
    select x.id from public.show_candidates x
    where x.status = 'pending'
      and (nq is null or nq = '' or public.normalise_search_text(x.title) like '%' || nq || '%')
      and (in_type is null or x.type::text = in_type)
    order by random() limit least(greatest(sample_size, 1), 200));
  if not found then
    raise exception 'No pending candidates match' using errcode = 'P0002';
  end if;
  return sid;
end;
$$;

-- Share right = (added + same as) / (added + same as + not a show), over the
-- sample members reviewed so far.
create function public.admin_candidate_sample_score(sample uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select count(*) as size,
         count(*) filter (where c.status <> 'pending') as reviewed,
         count(*) filter (where c.status in ('added', 'same')) as good,
         count(*) filter (where c.status = 'rejected') as bad
  into r from public.show_candidates c where c.sample_id = sample;
  return jsonb_build_object('size', r.size, 'reviewed', r.reviewed, 'good', r.good, 'bad', r.bad,
    'share', case when r.reviewed = 0 then null else round(r.good::numeric / r.reviewed, 4) end);
end;
$$;

-- Add the rest of a group after its sample scored well enough: at least 20
-- reviewed and a share of min_share or more. A candidate whose name already
-- reads as an existing show (same normalised title) is linked to that show
-- instead of being added twice, and so are repeats within the batch. Only
-- Wikidata candidates, at most max_rows a call; run again for the remainder.
create function public.admin_add_candidates_bulk(
  q text, in_type text, sample uuid, min_share numeric default 0.95, max_rows integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  nq text := public.normalise_search_text(q);
  score jsonb := public.admin_candidate_sample_score(sample);
  n_added bigint;
  n_linked bigint;
  n_left bigint;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if (score->>'reviewed')::int < 20 then
    raise exception 'Review at least 20 candidates from the sample first (reviewed % so far)', score->>'reviewed' using errcode = '22023';
  end if;
  if (score->>'share')::numeric < min_share then
    raise exception 'The sample scored %, below the % needed', round((score->>'share')::numeric * 100), round(min_share * 100) using errcode = '22023';
  end if;
  lock table public.shows in share row exclusive mode;

  drop table if exists _picked, _existing, _plan, _new;
  create temp table _picked on commit drop as
    select c.id, c.title, c.type, c.first_performed, c.aliases, c.source_ref,
           public.normalise_search_text(public.normalise_show_title(c.title)) as k
    from public.show_candidates c
    where c.status = 'pending' and c.source = 'wikidata'
      and (nq is null or nq = '' or public.normalise_search_text(c.title) like '%' || nq || '%')
      and (in_type is null or c.type::text = in_type)
    order by c.seen_count desc, c.first_performed desc nulls last, c.id
    limit least(greatest(max_rows, 1), 5000);

  create temp table _existing on commit drop as
    select distinct on (k) k, id from (
      select public.normalise_search_text(public.normalise_show_title(s.title)) as k, s.id, s.wikidata_id, s.verified
      from public.shows s) e
    order by k, (wikidata_id is null), verified desc, id;

  create temp table _plan on commit drop as
    select p.*, coalesce(w.id, e.id) as existing_id,
           row_number() over (partition by p.k order by p.id) as rn
    from _picked p
    left join public.shows w on w.wikidata_id = p.source_ref
    left join _existing e on e.k = p.k;

  create temp table _new on commit drop as
    with ins as (
      insert into public.shows (title, type, wikidata_id, first_performed, aliases, verified, created_by)
      select public.tidy_show_title(p.title), p.type, p.source_ref, p.first_performed, p.aliases, true, null
      from _plan p where p.existing_id is null and p.rn = 1
      returning id, wikidata_id)
    select ins.id, ins.wikidata_id from ins;

  update public.show_candidates c
  set status = case when p.existing_id is null and p.rn = 1 then 'added' else 'same' end,
      show_id = coalesce(p.existing_id, n.id, ln.id),
      reviewed_at = now(), updated_at = now()
  from _plan p
  left join _new n on n.wikidata_id = p.source_ref
  left join _plan lp on lp.k = p.k and lp.rn = 1 and p.rn > 1
  left join _new ln on ln.wikidata_id = lp.source_ref
  where c.id = p.id;

  select count(*) filter (where existing_id is null and rn = 1), count(*) filter (where existing_id is not null or rn > 1)
  into n_added, n_linked from _plan;
  select count(*) into n_left from public.show_candidates c
  where c.status = 'pending' and c.source = 'wikidata'
    and (nq is null or nq = '' or public.normalise_search_text(c.title) like '%' || nq || '%')
    and (in_type is null or c.type::text = in_type);
  return jsonb_build_object('added', n_added, 'linked', n_linked, 'remaining', n_left);
end;
$$;

revoke execute on function public.load_show_candidates(jsonb) from public, anon, authenticated;
grant execute on function public.load_show_candidates(jsonb) to service_role;
revoke execute on function public.admin_list_candidates(text, text, text, uuid, integer, integer) from public, anon;
grant execute on function public.admin_list_candidates(text, text, text, uuid, integer, integer) to authenticated;
revoke execute on function public.admin_candidate_totals(text, text, uuid) from public, anon;
grant execute on function public.admin_candidate_totals(text, text, uuid) to authenticated;
revoke execute on function public.admin_add_candidate(uuid) from public, anon;
grant execute on function public.admin_add_candidate(uuid) to authenticated;
revoke execute on function public.admin_candidate_same_as(uuid, uuid) from public, anon;
grant execute on function public.admin_candidate_same_as(uuid, uuid) to authenticated;
revoke execute on function public.admin_reject_candidate(uuid) from public, anon;
grant execute on function public.admin_reject_candidate(uuid) to authenticated;
revoke execute on function public.admin_start_candidate_sample(text, text, integer) from public, anon;
grant execute on function public.admin_start_candidate_sample(text, text, integer) to authenticated;
revoke execute on function public.admin_candidate_sample_score(uuid) from public, anon;
grant execute on function public.admin_candidate_sample_score(uuid) to authenticated;
revoke execute on function public.admin_add_candidates_bulk(text, text, uuid, numeric, integer) from public, anon;
grant execute on function public.admin_add_candidates_bulk(text, text, uuid, numeric, integer) to authenticated;
