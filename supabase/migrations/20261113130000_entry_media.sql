-- Legacy paths remain in entry-photos. New, immutable revisions use a
-- separate private bucket with no client write policies.
insert into storage.buckets (id, name, public)
values ('entry-media', 'entry-media', false);

create table public.entry_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  position smallint not null check (position between 0 and 9),
  revision integer not null default 1 check (revision >= 1),
  state text not null check (state in ('pending', 'ready')),
  legacy boolean not null default false,
  display_path text,
  thumbnail_path text,
  poster_path text,
  source_width integer,
  source_height integer,
  crop_x numeric,
  crop_y numeric,
  crop_width numeric,
  crop_height numeric,
  duration_ms integer,
  unique (entry_id, position) deferrable initially immediate,
  check (
    case when legacy then
      kind = 'photo' and state = 'ready' and display_path is not null
      and num_nonnulls(thumbnail_path, poster_path, source_width, source_height,
        crop_x, crop_y, crop_width, crop_height, duration_ms) = 0
    else
      (state = 'pending' or (display_path is not null and thumbnail_path is not null))
      and (display_path is null or display_path = entry_id || '/' || id || '/' || revision ||
        case when kind = 'photo' then '/display.jpg' else '/display.mp4' end)
      and (thumbnail_path is null or thumbnail_path = entry_id || '/' || id || '/' || revision || '/thumb.jpg')
      and (poster_path is null or poster_path = entry_id || '/' || id || '/' || revision || '/poster.jpg')
      and case when kind = 'photo' then
        duration_ms is null and poster_path is null and (
          (state = 'pending' and num_nonnulls(source_width, source_height, crop_x, crop_y, crop_width, crop_height) = 0)
          or (num_nonnulls(source_width, source_height, crop_x, crop_y, crop_width, crop_height) = 6
            and source_width between 1 and 1600 and source_height between 1 and 1600
            and crop_x between 0 and 1 and crop_y between 0 and 1
            and crop_width > 0 and crop_height > 0
            and crop_x + crop_width <= 1 and crop_y + crop_height <= 1
            and abs(crop_width * source_width - crop_height * source_height) <= 1)
        )
      else
        num_nonnulls(source_width, source_height, crop_x, crop_y, crop_width, crop_height) = 0
        and (duration_ms is null or duration_ms between 1 and 30000)
        and (state = 'pending' or (duration_ms is not null and poster_path is not null))
      end
    end
  )
);

-- Keeping source references in their own relation lets gallery callers use
-- ordinary SELECT privileges without exposing private paths in public rows.
create table public.entry_media_sources (
  media_id uuid primary key references public.entry_media(id) on delete cascade,
  source_revision integer not null check (source_revision >= 1)
);

alter table public.entry_media enable row level security;
alter table public.entry_media_sources enable row level security;
revoke all on public.entry_media, public.entry_media_sources from public, anon, authenticated;
grant select on public.entry_media to anon, authenticated;
grant select on public.entry_media_sources to authenticated;

create policy "Media follows entry visibility" on public.entry_media for select
to anon, authenticated using (
  exists (
    select 1 from public.entries e where e.id = entry_id
      and (e.user_id = (select auth.uid()) or (
        state = 'ready' and not public.is_blocked_between(e.user_id, (select auth.uid()))
      ))
  )
);

create policy "Owners read retained sources" on public.entry_media_sources for select
to authenticated using (
  exists (
    select 1 from public.entry_media m join public.entries e on e.id = m.entry_id
    where m.id = media_id and m.kind = 'photo' and not m.legacy
      and e.user_id = (select auth.uid())
  )
);

create policy "Ready gallery assets follow media visibility" on storage.objects for select
to anon, authenticated using (
  bucket_id = 'entry-media' and exists (
    select 1 from public.entry_media m
    where m.entry_id::text = split_part(name, '/', 1)
      and not m.legacy and m.state = 'ready'
      and name in (m.display_path, m.thumbnail_path, m.poster_path)
  )
);

create policy "Owners read retained photo files" on storage.objects for select
to authenticated using (
  bucket_id = 'entry-media' and exists (
    select 1 from public.entry_media_sources s join public.entry_media m on m.id = s.media_id
    where name = m.entry_id || '/' || m.id || '/' || s.source_revision || '/source.jpg'
  )
);

-- Legacy insert/replace/remove stays authoritative only while an entry has
-- no native gallery. Match the historical client path before projecting it.
create function public.sync_legacy_entry_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.entry_media where entry_id = new.id and not legacy) then
    return new;
  end if;

  if new.photo_path = new.user_id || '/' || new.id || '.jpg' then
    insert into public.entry_media (entry_id, kind, position, state, legacy, display_path)
    values (new.id, 'photo', 0, 'ready', true, new.photo_path)
    on conflict (entry_id) where legacy do nothing;
  else
    delete from public.entry_media where entry_id = new.id and legacy;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_legacy_entry_media() from public, anon, authenticated;

-- Guard retries without relying on the deferrable position constraint as a
-- conflict target. All writes from this trigger hold the parent row lock.
create unique index entry_media_one_legacy_per_entry on public.entry_media (entry_id) where legacy;

create trigger entries_sync_legacy_media
after insert or update of photo_path on public.entries
for each row execute function public.sync_legacy_entry_media();

insert into public.entry_media (entry_id, kind, position, state, legacy, display_path)
select id, 'photo', 0, 'ready', true, photo_path
from public.entries
where photo_path = user_id || '/' || id || '.jpg'
  and not exists (select 1 from public.entry_media m where m.entry_id = entries.id and not m.legacy)
on conflict (entry_id) where legacy do nothing;

create view public.entry_media_covers with (security_invoker = true) as
select distinct on (entry_id)
  entry_id, id as media_id, kind, legacy,
  case when kind = 'video' then poster_path else display_path end as photo_path
from public.entry_media
where state = 'ready'
order by entry_id, position;

revoke all on public.entry_media_covers from public, anon, authenticated;
grant select on public.entry_media_covers to anon, authenticated;
