create function public.queue_crawl_titles(for_run uuid, automatic boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  n_considered bigint;
  n_known bigint;
  n_new bigint := 0;
  n_again bigint := 0;
  n_repeat bigint := 0;
begin
  -- Serialize automatic and manual sends for a run so a finding is counted once.
  perform 1 from public.crawl_runs c where c.id = for_run for no key update;
  if not found then
    raise exception 'No such run' using errcode = 'P0002';
  end if;

  drop table if exists pg_temp._f, pg_temp._keys, pg_temp._known, pg_temp._groups;
  create temp table pg_temp._f on commit drop as
    select f.id, f.created_at, f.venue_id, f.raw_title, f.source_url,
           public.normalise_search_text(public.normalise_show_title(f.raw_title)) as k
    from public.crawl_findings f
    where f.run_id = for_run and f.kind = 'show'
      and case when automatic then
        f.page_checked and f.method <> 'stub' and f.review is distinct from 'wrong'
      else f.review = 'right' end
      and f.sent_to_review_at is null and btrim(f.raw_title) <> '';
  select count(*) into n_considered from pg_temp._f;

  if n_considered = 0 then
    return jsonb_build_object('considered', 0, 'already_shows', 0, 'new_candidates', 0, 'seen_again', 0);
  end if;

  -- Titles that already read as a show or a nickname.
  create temp table pg_temp._keys on commit drop as
    select distinct public.normalise_search_text(public.normalise_show_title(s.title)) as k from public.shows s
    union
    select a.search_text from public.show_aliases a;
  create temp table pg_temp._known on commit drop as
    select distinct f.k from pg_temp._f f where f.k in (select k from pg_temp._keys);
  -- The rest: a close match that reads as the same show also counts.
  for r in select distinct on (f.k) f.k, f.raw_title from pg_temp._f f where f.k not in (select k from pg_temp._known) order by f.k, f.id loop
    if exists (select 1 from public.similar_shows(r.raw_title) x where x.same) then
      insert into pg_temp._known values (r.k);
    end if;
  end loop;
  select count(*) into n_known from pg_temp._f f where f.k in (select k from pg_temp._known);

  create temp table pg_temp._groups on commit drop as
    select g.k, (array_agg(g.raw_title order by g.created_at, g.id))[1] as title, (array_agg(g.venue_id order by g.created_at, g.id))[1] as venue_id,
           (array_agg(g.source_url order by g.created_at, g.id))[1] as url, count(*) as n
    from pg_temp._f g where g.k not in (select k from pg_temp._known) and g.k <> '' group by g.k;

  -- A name also pulled from Wikidata: raise that candidate's count.
  with hit as (
    update public.show_candidates c set seen_count = c.seen_count + g.n, updated_at = now()
    from pg_temp._groups g
    where c.source = 'wikidata' and public.normalise_search_text(public.normalise_show_title(c.title)) = g.k
    returning g.k, g.n)
  select count(*) into n_again from hit;
  delete from pg_temp._groups g using public.show_candidates c
  where c.source = 'wikidata' and public.normalise_search_text(public.normalise_show_title(c.title)) = g.k;

  -- The stored reference is capped at 200 characters, so collapse identical
  -- stored keys before the upsert.
  with candidates as (
    select distinct on (left(g.k, 200)) left(g.k, 200) as source_ref,
           g.title, g.url, g.venue_id,
           sum(g.n) over (partition by left(g.k, 200))::integer as sightings
    from pg_temp._groups g
    order by left(g.k, 200), g.k
  ), up as (
    insert into public.show_candidates (title, type, source, source_ref, source_url, venue_id, seen_count)
    select left(btrim(c.title), 200), 'other', 'crawler', c.source_ref, c.url, c.venue_id, c.sightings
    from candidates c order by c.source_ref
    on conflict (source, source_ref) do update
      set seen_count = public.show_candidates.seen_count + excluded.seen_count, updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into n_new, n_repeat from up;

  update public.crawl_findings f set sent_to_review_at = now() where f.id in (select id from pg_temp._f);
  return jsonb_build_object('considered', n_considered, 'already_shows', n_known, 'new_candidates', n_new, 'seen_again', n_again + n_repeat);
end;
$$;

revoke execute on function public.queue_crawl_titles(uuid, boolean) from public, anon, authenticated;

create or replace function public.admin_send_findings_to_review(for_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return public.queue_crawl_titles(for_run, false);
end;
$$;

create function public.queue_titles_after_crawl()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_crawl_titles(new.id, true);
  return new;
end;
$$;
revoke execute on function public.queue_titles_after_crawl() from public, anon, authenticated;

create trigger queue_titles_after_crawl
after update of status on public.crawl_runs
for each row when (new.status in ('done', 'failed'))
execute function public.queue_titles_after_crawl();

-- Existing completed crawls may have cached their pages, so queue their
-- eligible findings without requiring another crawl.
do $$
declare
  run_id uuid;
begin
  for run_id in
    select c.id from public.crawl_runs c
    where c.status in ('done', 'failed')
      and exists (
        select 1 from public.crawl_findings f
        where f.run_id = c.id and f.sent_to_review_at is null
          and f.page_checked and f.kind = 'show' and f.method <> 'stub'
          and f.review is distinct from 'wrong'
      )
    order by c.id
  loop
    perform public.queue_crawl_titles(run_id, true);
  end loop;
end;
$$;
