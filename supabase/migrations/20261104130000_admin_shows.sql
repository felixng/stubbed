-- Admin: see what's in the show list and check names against it (#364).
-- Counts only: nothing here says who logged what.

-- Every show matching the filters, with its entry count and, when there is
-- one, a likely problem: another show with the same normalised title, or (for
-- a typed-in show) a close match by similar_shows. Not callable by clients;
-- the admin functions below wrap it.
create function public.admin_shows_filtered(
  q            text,
  in_type      text,
  in_source    text,   -- 'wikidata' | 'typed'
  in_entries   text,   -- 'has' | 'none'
  only_problems boolean
)
returns table (
  id          uuid,
  title       text,
  type        public.show_type,
  wikidata_id text,
  first_performed smallint,
  entry_count bigint,
  problem     text,
  other_id    uuid,
  other_title text
)
language plpgsql stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  nq text := public.normalise_search_text(q);
begin
  return query
  with counts as (
    select e.show_id, count(*) as n from public.entries e group by e.show_id
  ),
  base as materialized (
    select s.id, s.title, s.type, s.wikidata_id, s.first_performed, s.search_text,
           public.normalise_search_text(public.normalise_show_title(s.title)) as key,
           coalesce(c.n, 0)::bigint as entry_count
    from public.shows s
    left join counts c on c.show_id = s.id
  ),
  -- The filters that don't need the problem check, applied first so the
  -- close-match lookup (the slow part) only runs for rows that can be shown.
  keyed as materialized (
    select b.* from base b
    where (nq is null or nq = '' or b.search_text like '%' || nq || '%')
      and (in_type is null or b.type::text = in_type)
      and (in_source is null or (in_source = 'wikidata') = (b.wikidata_id is not null))
      and (in_entries is null or (in_entries = 'has') = (b.entry_count > 0))
  ),
  dupes as materialized (
    select k.id, (array_agg(o.id order by o.wikidata_id is null, o.title, o.id))[1] as other_id
    from keyed k
    join base o on o.key = k.key and o.id <> k.id
    group by k.id
  ),
  close as materialized (
    select k.id, sim.id as other_id
    from keyed k
    cross join lateral (
      select x.id from public.similar_shows(k.title) x where x.id <> k.id limit 1
    ) sim
    where k.wikidata_id is null
  ),
  rated as (
    select k.*,
           coalesce(d.other_id, cl.other_id) as other_id,
           case when d.other_id is not null then 'Same title as another show'
                when cl.other_id is not null then 'Close to another show' end as problem
    from keyed k
    left join dupes d on d.id = k.id
    left join close cl on cl.id = k.id
  )
  select r.id, r.title, r.type, r.wikidata_id, r.first_performed, r.entry_count, r.problem,
         r.other_id, o.title
  from rated r
  left join public.shows o on o.id = r.other_id
  where not coalesce(only_problems, false) or r.problem is not null;
end;
$$;

revoke execute on function public.admin_shows_filtered(text, text, text, text, boolean) from public, anon, authenticated;

create function public.admin_list_shows(
  q             text    default null,
  in_type       text    default null,
  in_source     text    default null,
  in_entries    text    default null,
  only_problems boolean default false,
  page_size     integer default 50,
  page_offset   integer default 0
)
returns table (
  id          uuid,
  title       text,
  type        public.show_type,
  wikidata_id text,
  first_performed smallint,
  entry_count bigint,
  problem     text,
  other_id    uuid,
  other_title text
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  select * from public.admin_shows_filtered(q, in_type, in_source, in_entries, only_problems) f
  -- Typed-in shows that people logged first: those are what users see.
  order by (f.wikidata_id is null and f.entry_count > 0) desc, f.entry_count desc, f.title, f.id
  limit least(greatest(page_size, 1), 200)
  offset greatest(page_offset, 0);
end;
$$;

create function public.admin_show_totals(
  q             text    default null,
  in_type       text    default null,
  in_source     text    default null,
  in_entries    text    default null,
  only_problems boolean default false
)
returns table (
  shows            bigint,
  from_wikidata    bigint,
  typed_in         bigint,
  typed_in_logged  bigint,   -- typed-in shows with at least one entry
  no_entries       bigint,
  with_problems    bigint
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  select count(*),
         count(*) filter (where f.wikidata_id is not null),
         count(*) filter (where f.wikidata_id is null),
         count(*) filter (where f.wikidata_id is null and f.entry_count > 0),
         count(*) filter (where f.entry_count = 0),
         count(*) filter (where f.problem is not null)
  from public.admin_shows_filtered(q, in_type, in_source, in_entries, only_problems) f;
end;
$$;

-- Paste titles, see what a user typing each would get from search_shows.
-- `found_at` is the place (1 = top) of the first result whose name equals the
-- title once normalised, or null when none does.
create function public.admin_check_show_names(titles text[])
returns table (
  pos      integer,
  title    text,
  found_at integer,
  results  jsonb      -- the top three: [{id, title, type, year}]
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(array_length(titles, 1), 0) > 100 then
    raise exception 'Check at most 100 titles at a time' using errcode = '22023';
  end if;
  return query
  select t.pos::integer, t.title,
         (select r.place::integer
          from (select s.search_text, row_number() over () as place from public.search_shows(t.title) s) r
          where public.normalise_search_text(public.normalise_show_title(t.title)) = any (string_to_array(r.search_text, ' | '))
          order by r.place limit 1),
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'type', r.type, 'year', r.first_performed) order by r.place)
                   from (select s.*, row_number() over () as place from public.search_shows(t.title) s limit 3) r), '[]'::jsonb)
  from unnest(titles) with ordinality as t(title, pos)
  where btrim(t.title) <> ''
  order by t.pos;
end;
$$;

revoke execute on function public.admin_list_shows(text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_shows(text, text, text, text, boolean, integer, integer) to authenticated;
revoke execute on function public.admin_show_totals(text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_show_totals(text, text, text, text, boolean) to authenticated;
revoke execute on function public.admin_check_show_names(text[]) from public, anon;
grant execute on function public.admin_check_show_names(text[]) to authenticated;
