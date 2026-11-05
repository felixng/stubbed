-- Admin: see which theatres we hold and what each is missing (#356).
-- Counts only: nothing here says who logged what.

-- The page that lists what's on, read by the crawl pilot (#289). Theatres on
-- one site share a URL. Added here because the list filters on it; #357 lets
-- an admin edit it. Not in the column grants, so users can't write it.
alter table public.venues
  add column whats_on_url text
    check (char_length(whats_on_url) <= 500 and whats_on_url ~* '^https?://');

-- One filter shape for both functions. `has_website` / `has_whats_on`: true =
-- only those with one, false = only those without, null = either.
create function public.admin_list_venues(
  q            text    default null,
  in_circuit   text    default null,  -- a venue_circuit, or 'none' for unlabelled
  in_country   text    default null,
  has_website  boolean default null,
  has_whats_on boolean default null,
  page_size    integer default 50,
  page_offset  integer default 0
)
returns table (
  id           uuid,
  name         text,
  city         text,
  country      text,
  circuit      public.venue_circuit,
  website      text,
  whats_on_url text,
  entry_count  bigint
)
language plpgsql stable security definer
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
  select v.id, v.name, v.city, v.country, v.circuit, v.website, v.whats_on_url,
         coalesce(c.n, 0)::bigint as entry_count
  from public.venues v
  left join (select e.venue_id, count(*) as n from public.entries e
             where e.venue_id is not null group by e.venue_id) c on c.venue_id = v.id
  where (nq is null or nq = '' or v.search_text like '%' || nq || '%'
         or (v.city is not null and public.normalise_search_text(v.city) like '%' || nq || '%'))
    and (in_circuit is null or (in_circuit = 'none' and v.circuit is null) or v.circuit::text = in_circuit)
    and (in_country is null or v.country = in_country)
    and (has_website is null or (v.website is not null) = has_website)
    and (has_whats_on is null or (v.whats_on_url is not null) = has_whats_on)
  order by coalesce(c.n, 0) desc, v.name, v.id
  limit least(greatest(page_size, 1), 200)
  offset greatest(page_offset, 0);
end;
$$;

create function public.admin_venue_totals(
  q            text    default null,
  in_circuit   text    default null,
  in_country   text    default null,
  has_website  boolean default null,
  has_whats_on boolean default null
)
returns table (
  venues       bigint,
  labelled     bigint,
  with_website bigint,
  with_whats_on bigint,
  logged_at    bigint  -- venues with at least one entry
)
language plpgsql stable security definer
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
  select count(*),
         count(*) filter (where v.circuit is not null),
         count(*) filter (where v.website is not null),
         count(*) filter (where v.whats_on_url is not null),
         count(*) filter (where exists (select 1 from public.entries e where e.venue_id = v.id))
  from public.venues v
  where (nq is null or nq = '' or v.search_text like '%' || nq || '%'
         or (v.city is not null and public.normalise_search_text(v.city) like '%' || nq || '%'))
    and (in_circuit is null or (in_circuit = 'none' and v.circuit is null) or v.circuit::text = in_circuit)
    and (in_country is null or v.country = in_country)
    and (has_website is null or (v.website is not null) = has_website)
    and (has_whats_on is null or (v.whats_on_url is not null) = has_whats_on);
end;
$$;

revoke execute on function public.admin_list_venues(text, text, text, boolean, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_venues(text, text, text, boolean, boolean, integer, integer) to authenticated;
revoke execute on function public.admin_venue_totals(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.admin_venue_totals(text, text, text, boolean, boolean) to authenticated;
