-- Optional Wikidata catalogue (#145). Existing user-created shows remain valid.
alter table public.shows
  add column wikidata_id text unique check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  add column first_performed smallint check (first_performed between 1 and 2200),
  add column aliases text[] not null default '{}';

-- No new INSERT/UPDATE grants: catalogue metadata is service-role only.
create function public.normalise_show_title(title text)
returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(regexp_replace(pg_catalog.normalize(btrim(title), 'NFKD'),
        U&'[\0300-\036f]', '', 'g')), '^the\s+', ''),
      '\s*(\((broadway|west end|the musical|musical|play)\)|[-:–—]?\s*the musical)\s*$', '', 'i'),
    '\s+', ' ', 'g'));
$$;

create index shows_normalised_title on public.shows (public.normalise_show_title(title));

create or replace function public.search_shows(q text)
returns setof public.shows
language sql stable
set search_path = public, extensions
as $$
  select s.*
  from public.shows s
  cross join lateral (
    select max(greatest(similarity(btrim(q), candidate), word_similarity(btrim(q), candidate))) as score
    from unnest(array[s.title] || s.aliases) as names(candidate)
    where candidate ilike '%' || replace(replace(replace(btrim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or btrim(q) <% candidate
  ) matched
  where matched.score is not null
  order by matched.score desc, (s.wikidata_id is not null) desc, s.verified desc, s.title, s.id
  limit 20;
$$;

-- Each call is one transaction. Take locks before planning so a concurrent
-- import cannot add references between moving entries and deleting a duplicate.
-- Only show_id changes on entries; the usual updated_at trigger still runs.
create function public.merge_into_catalogue()
returns table (title text, outcome text, moved_entries bigint)
language plpgsql security definer
set search_path = ''
as $$
declare
  source record;
  target_id uuid;
  matches uuid[];
  same_title bigint;
begin
  lock table public.shows in share row exclusive mode;
  lock table public.entries in share row exclusive mode;
  for source in
    select s.id, s.title, s.type from public.shows s
    where s.wikidata_id is null
    order by s.id
  loop
    select array_agg(c.id) filter (where c.type = source.type), count(*)
      into matches, same_title
    from public.shows c
    where c.wikidata_id is not null
      and public.normalise_show_title(c.title) = public.normalise_show_title(source.title);

    -- Any same-title type disagreement is deliberately left for an admin,
    -- even when there is also a single candidate of the expected type.
    if same_title = 1 and coalesce(cardinality(matches), 0) = 1 then
      target_id := matches[1];
      update public.entries e set show_id = target_id where e.show_id = source.id;
      get diagnostics moved_entries = row_count;
      delete from public.shows s where s.id = source.id;
      title := source.title; outcome := 'merged'; return next;
    elsif same_title > 0 then
      title := source.title; outcome := 'ambiguous'; moved_entries := 0; return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.merge_into_catalogue() from public, anon, authenticated;
grant execute on function public.merge_into_catalogue() to service_role;
