-- Show search: a show whose whole name is what was typed comes first (#368).
-- "Six" now puts Six: The Musical ahead of Six Characters in Search of an
-- Author; normalise_show_title already drops ": The Musical" and similar
-- suffixes, so the comparison is on the main name (or an alias). Among
-- equal matches, shows people have logged come first, then the most recently
-- first performed, so the two rows of "Hamilton" are no longer a coin toss.
-- Signature and result columns are unchanged (first_performed is already in
-- shows), so shipped iOS builds keep decoding results.

create or replace function public.search_shows(q text)
returns setof public.shows
language plpgsql stable
set search_path = public, extensions
as $$
declare
  nq text := public.normalise_search_text(public.normalise_show_title(q));
begin
  if nq is null or nq = '' then
    return;
  end if;
  return query
  with hits as (
    select s.id as show_id, s.search_text as t
    from public.shows s
    where s.search_text like '%' || nq || '%' or nq <% s.search_text
    union all
    select a.show_id, a.search_text
    from public.show_aliases a
    where a.search_text like '%' || nq || '%' or nq <% a.search_text
  ),
  best as (
    select h.show_id,
           min(case
                 when strpos(' | ' || h.t || ' | ', ' | ' || nq || ' | ') > 0 then -1
                 when starts_with(h.t, nq) or strpos(h.t, '| ' || nq) > 0 then 0
                 when strpos(' ' || h.t, ' ' || nq) > 0 then 1
                 when strpos(h.t, nq) > 0 then 3
                 else 2
               end) as tier,
           max(word_similarity(nq, h.t)) as score
    from hits h
    group by h.show_id
  )
  select s.*
  from best b
  join public.shows s on s.id = b.show_id
  order by b.tier, b.score desc,
           exists (select 1 from public.entries e where e.show_id = s.id) desc,
           (s.wikidata_id is not null) desc, s.verified desc,
           s.first_performed desc nulls last, s.title, s.id
  limit 20;
end;
$$;
