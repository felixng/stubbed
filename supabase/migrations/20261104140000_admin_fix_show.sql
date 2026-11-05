-- Admin: fix a show's title or type, add a nickname, merge duplicates (#365).

-- A title or type an admin has corrected. The Wikidata sync rewrites both from
-- Wikidata, so while this is set only admin_update_show can change them.
-- Not in the column grants, so users can't set it.
alter table public.shows add column title_locked boolean not null default false;

create function public.keep_admin_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.title_locked
     and (new.title, new.type) is distinct from (old.title, old.type)
     and coalesce(current_setting('stubbed.admin_edit', true), '') <> 'on' then
    new.title := old.title;
    new.type := old.type;
  end if;
  return new;
end;
$$;

create trigger shows_keep_admin_edits
  before update on public.shows
  for each row execute function public.keep_admin_edits();

create function public.admin_update_show(show_id uuid, new_title text, new_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text := nullif(btrim(new_title), '');
  ty public.show_type;
  changed integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if t is null or char_length(t) > 200 then
    raise exception 'The title must be 1 to 200 characters' using errcode = '22023';
  end if;
  begin
    ty := new_type::public.show_type;
  exception when invalid_text_representation then
    raise exception 'Unknown type %', new_type using errcode = '22023';
  end;
  perform set_config('stubbed.admin_edit', 'on', true);
  update public.shows s set title = t, type = ty, title_locked = true where s.id = admin_update_show.show_id;
  get diagnostics changed = row_count;
  perform set_config('stubbed.admin_edit', 'off', true);
  if changed = 0 then
    raise exception 'No such show' using errcode = 'P0002';
  end if;
end;
$$;

-- A nickname people can search by. False when the show already has it.
create function public.admin_add_show_alias(for_show uuid, new_alias text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(new_alias, ''))) not between 2 and 100 then
    raise exception 'A nickname is 2 to 100 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shows s where s.id = for_show) then
    raise exception 'No such show' using errcode = 'P0002';
  end if;
  insert into public.show_aliases (show_id, alias)
  values (for_show, btrim(new_alias))
  on conflict (show_id, search_text) do nothing;
  get diagnostics added = row_count;
  return added > 0;
end;
$$;

-- What a merge would do, for the confirmation: both shows and how many
-- entries and nicknames move. Counts only.
create function public.admin_merge_preview(from_id uuid, into_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  src public.shows;
  dst public.shows;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select * into src from public.shows s where s.id = from_id;
  select * into dst from public.shows s where s.id = into_id;
  if src.id is null or dst.id is null then
    raise exception 'No such show' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'from', jsonb_build_object('id', src.id, 'title', src.title, 'type', src.type, 'wikidata_id', src.wikidata_id,
      'entries', (select count(*) from public.entries e where e.show_id = src.id),
      'aliases', (select count(*) from public.show_aliases a where a.show_id = src.id)),
    'into', jsonb_build_object('id', dst.id, 'title', dst.title, 'type', dst.type, 'wikidata_id', dst.wikidata_id,
      'entries', (select count(*) from public.entries e where e.show_id = dst.id),
      'aliases', (select count(*) from public.show_aliases a where a.show_id = dst.id)),
    'types_differ', src.type is distinct from dst.type);
end;
$$;

-- Fold `from_id` into `into_id` with merge_shows (entries and nicknames move,
-- the duplicate is deleted). The duplicate's title becomes a nickname of the
-- survivor when it reads differently, so what people typed still finds it.
create function public.admin_merge_shows(from_id uuid, into_id uuid, force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  src_title text;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select s.title into src_title from public.shows s where s.id = from_id;
  result := public.merge_shows(from_id, into_id, force);
  if src_title is not null
     and public.normalise_show_title(src_title) is distinct from
         (select public.normalise_show_title(s.title) from public.shows s where s.id = into_id)
     and char_length(src_title) between 2 and 100 then
    insert into public.show_aliases (show_id, alias) values (into_id, src_title)
    on conflict (show_id, search_text) do nothing;
  end if;
  return result;
end;
$$;

revoke execute on function public.keep_admin_edits() from public, anon, authenticated;
revoke execute on function public.admin_update_show(uuid, text, text) from public, anon;
grant execute on function public.admin_update_show(uuid, text, text) to authenticated;
revoke execute on function public.admin_add_show_alias(uuid, text) from public, anon;
grant execute on function public.admin_add_show_alias(uuid, text) to authenticated;
revoke execute on function public.admin_merge_preview(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_preview(uuid, uuid) to authenticated;
revoke execute on function public.admin_merge_shows(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_merge_shows(uuid, uuid, boolean) to authenticated;
