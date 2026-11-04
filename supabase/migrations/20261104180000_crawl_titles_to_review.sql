-- Crawl titles with no matching show go to show review (#367). A finding the
-- reviewer marked right, of kind "show", whose title doesn't already read as a
-- show becomes a candidate (source 'crawler') with its source page and theatre.
-- Nothing enters show search until an admin adds it.

-- Which findings have been sent, so sending a run twice counts nothing twice.
alter table public.crawl_findings add column sent_to_review_at timestamptz;

-- The theatre a crawler candidate was first seen at.
alter table public.show_candidates
  add column venue_id uuid references public.venues (id) on delete set null;
create index show_candidates_venue on public.show_candidates (venue_id);

-- The candidate list also returns the theatre. A function's result columns
-- can't change with create or replace, so it is dropped and made again.
drop function public.admin_list_candidates(text, text, text, uuid, integer, integer);
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
  source text, source_ref text, source_url text, seen_count integer, status text, show_id uuid, sample_id uuid,
  venue_name text,
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
  select p.id, p.title, p.type, p.first_performed, p.aliases, p.source, p.source_ref, p.source_url, p.seen_count,
         p.status, p.show_id, p.sample_id, v.name, m.id, m.title, m.type, m.same
  from page p
  left join public.venues v on v.id = p.venue_id
  left join lateral (select x.id, x.title, x.type, x.same from public.similar_shows(p.title) x limit 1) m on true
  order by p.seen_count desc, p.first_performed desc nulls last, p.title, p.id;
end;
$$;
revoke execute on function public.admin_list_candidates(text, text, text, uuid, integer, integer) from public, anon;
grant execute on function public.admin_list_candidates(text, text, text, uuid, integer, integer) to authenticated;

-- Send a run's right findings to review. Returns how many findings were
-- looked at, how many already read as a show (or are not shows), how many
-- candidates were new, and how many raised the count of one already there.
-- A title also pulled from Wikidata raises that candidate's count instead of
-- making a second one. Sent findings are marked, so a second call does nothing.
create function public.admin_send_findings_to_review(for_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  n_considered bigint;
  n_known bigint;
  n_new bigint := 0;
  n_again bigint := 0;
  n_repeat bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crawl_runs c where c.id = for_run) then
    raise exception 'No such run' using errcode = 'P0002';
  end if;

  drop table if exists _f, _keys, _known, _groups;
  create temp table _f on commit drop as
    select f.id, f.created_at, f.venue_id, f.raw_title, f.source_url,
           public.normalise_search_text(public.normalise_show_title(f.raw_title)) as k
    from public.crawl_findings f
    where f.run_id = for_run and f.review = 'right' and f.kind = 'show'
      and f.sent_to_review_at is null and btrim(f.raw_title) <> '';
  select count(*) into n_considered from _f;

  -- Titles that already read as a show or a nickname.
  create temp table _keys on commit drop as
    select distinct public.normalise_search_text(public.normalise_show_title(s.title)) as k from public.shows s
    union
    select a.search_text from public.show_aliases a;
  create temp table _known on commit drop as
    select distinct f.k from _f f where f.k in (select k from _keys);
  -- The rest: a close match that reads as the same show also counts.
  for r in select distinct on (f.k) f.k, f.raw_title from _f f where f.k not in (select k from _known) order by f.k, f.id loop
    if exists (select 1 from public.similar_shows(r.raw_title) x where x.same) then
      insert into _known values (r.k);
    end if;
  end loop;
  select count(*) into n_known from _f f where f.k in (select k from _known);

  create temp table _groups on commit drop as
    select g.k, (array_agg(g.raw_title order by g.created_at, g.id))[1] as title, (array_agg(g.venue_id order by g.created_at, g.id))[1] as venue_id,
           (array_agg(g.source_url order by g.created_at, g.id))[1] as url, count(*) as n
    from _f g where g.k not in (select k from _known) and g.k <> '' group by g.k;

  -- A name also pulled from Wikidata: raise that candidate's count.
  with hit as (
    update public.show_candidates c set seen_count = c.seen_count + g.n, updated_at = now()
    from _groups g
    where c.source = 'wikidata' and public.normalise_search_text(public.normalise_show_title(c.title)) = g.k
    returning g.k, g.n)
  select count(*) into n_again from hit;
  delete from _groups g using public.show_candidates c
  where c.source = 'wikidata' and public.normalise_search_text(public.normalise_show_title(c.title)) = g.k;

  with up as (
    insert into public.show_candidates (title, type, source, source_ref, source_url, venue_id, seen_count)
    select left(btrim(g.title), 200), 'other', 'crawler', left(g.k, 200), g.url, g.venue_id, g.n::integer from _groups g
    on conflict (source, source_ref) do update
      set seen_count = public.show_candidates.seen_count + excluded.seen_count, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_new, n_repeat from up;

  update public.crawl_findings f set sent_to_review_at = now() where f.id in (select id from _f);
  return jsonb_build_object('considered', n_considered, 'already_shows', n_known, 'new_candidates', n_new, 'seen_again', n_again + n_repeat);
end;
$$;

revoke execute on function public.admin_send_findings_to_review(uuid) from public, anon;
grant execute on function public.admin_send_findings_to_review(uuid) to authenticated;
