-- Nicknames people teach for shows (#35, part 2): "Les Mis", "MJ", "Joseph".
--
-- shows.aliases is rewritten by the Wikidata sync, so nicknames users add
-- live here instead. search_shows reads both, and returns each show once,
-- ranked by its best match. No review for now (#35 triage); created_by is
-- kept so they can be moderated later (#4).

create table public.show_aliases (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references public.shows (id) on delete cascade,
  alias       text not null check (char_length(btrim(alias)) between 2 and 100),
  search_text text generated always as
    (public.normalise_search_text(public.normalise_show_title(alias))) stored,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One per show, however it's capitalised, accented or punctuated.
create unique index show_aliases_unique on public.show_aliases (show_id, search_text);
create index show_aliases_search_text_trgm on public.show_aliases using gin (search_text extensions.gin_trgm_ops);
create index show_aliases_created_by on public.show_aliases (created_by);

alter table public.show_aliases enable row level security;
revoke all on public.show_aliases from anon, authenticated;
grant select on public.show_aliases to anon, authenticated;
grant insert (show_id, alias), update (alias), delete on public.show_aliases to authenticated;

create policy "Show aliases are public"
  on public.show_aliases for select
  to anon, authenticated
  using (true);

create policy "Signed-in users add show aliases"
  on public.show_aliases for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "Creators edit their show aliases"
  on public.show_aliases for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "Creators delete their show aliases"
  on public.show_aliases for delete
  to authenticated
  using (created_by = (select auth.uid()));

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
  order by b.tier, b.score desc, (s.wikidata_id is not null) desc, s.verified desc, s.title, s.id
  limit 20;
end;
$$;

-- Saves what someone searched for as a nickname for the show they then
-- picked, unless search already finds that show near the top for it (a
-- retyped title or a typo adds nothing). Returns whether it was saved.
create function public.remember_show_alias(show_id uuid, alias text)
returns boolean
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  saved boolean;
begin
  if (select auth.uid()) is null
     or char_length(btrim(remember_show_alias.alias)) not between 2 and 100 then
    return false;
  end if;
  if exists (select 1 from (select r.id from public.search_shows(remember_show_alias.alias) r limit 3) top
             where top.id = remember_show_alias.show_id) then
    return false;
  end if;
  insert into public.show_aliases (show_id, alias)
  values (remember_show_alias.show_id, btrim(remember_show_alias.alias))
  on conflict (show_id, search_text) do nothing;
  get diagnostics saved = row_count;
  return saved;
end;
$$;
revoke all on function public.remember_show_alias(uuid, text) from public, anon;
grant execute on function public.remember_show_alias(uuid, text) to authenticated;

-- Merging a user-added show into the catalogue keeps its nicknames.
create or replace function public.merge_into_catalogue()
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
      insert into public.show_aliases (show_id, alias, created_by, created_at)
      select target_id, a.alias, a.created_by, a.created_at
      from public.show_aliases a where a.show_id = source.id
      on conflict (show_id, search_text) do nothing;
      delete from public.shows s where s.id = source.id;
      title := source.title; outcome := 'merged'; return next;
    elsif same_title > 0 then
      title := source.title; outcome := 'ambiguous'; moved_entries := 0; return next;
    end if;
  end loop;
end;
$$;
