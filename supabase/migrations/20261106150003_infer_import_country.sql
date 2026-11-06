-- One rule for both import clients. Catalogue evidence only; no geocoding or AI.
create function public.infer_import_country(venue_name text, city_name text)
returns text language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select upper(btrim(v.country)) as country,
      replace(replace(public.normalise_search_text(v.name), 'theater', 'theatre'), ' ', '') =
      replace(replace(public.normalise_search_text(venue_name), 'theater', 'theatre'), ' ', '') as exact_venue
    from public.venues v
    where nullif(btrim(city_name), '') is not null
      and v.country ~ '^[A-Za-z]{2}$'
      and public.normalise_search_text(public.canonical_city(v.city, v.country)) =
          public.normalise_search_text(public.canonical_city(city_name, v.country))
  ), evidence as (
    select country from candidates
    where exact_venue or not exists (select 1 from candidates where exact_venue)
  )
  select case when count(distinct country) = 1 then min(country) end from evidence;
$$;
revoke all on function public.infer_import_country(text, text) from public;
grant execute on function public.infer_import_country(text, text) to authenticated;
