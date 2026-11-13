insert into public.feature_access (feature, tier)
values ('media.multiple', 'pro'), ('media.video', 'pro');

insert into public.app_config (key, value)
values ('media_photo_uploads_enabled', 'false'), ('media_gallery_uploads_enabled', 'false')
on conflict (key) do nothing;

create table public.entry_media_reservations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  request_id uuid not null,
  media_id uuid not null,
  replace_media_id uuid,
  position smallint not null check (position between 0 and 9),
  revision integer not null check (revision > 0),
  assets jsonb not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'cancelled', 'finalized')),
  unique (entry_id, request_id)
);

alter table public.entry_media_reservations enable row level security;
revoke all on public.entry_media_reservations from public, anon, authenticated;

create function public.reserve_entry_media(
  p_entry_id uuid, p_request_id uuid, p_kind text, p_replace_media_id uuid, p_assets jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  reservation public.entry_media_reservations;
  replacement public.entry_media;
  used_slots integer;
  next_position smallint;
  next_revision integer := 1;
  target_id uuid := gen_random_uuid();
  needs_pro boolean;
  recrop boolean;
  prefix text;
begin
  perform 1 from public.entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then raise exception 'MEDIA_ENTRY_NOT_FOUND' using errcode = '42501'; end if;

  if p_kind is distinct from 'photo' then
    raise exception 'MEDIA_KIND_UNAVAILABLE' using errcode = '22023';
  end if;
  if p_request_id is null or jsonb_typeof(p_assets) is distinct from 'array' then
    raise exception 'MEDIA_INVALID_ASSETS' using errcode = '22023';
  end if;
  recrop := jsonb_array_length(p_assets) = 2 and p_replace_media_id is not null;
  if jsonb_array_length(p_assets) <> (case when recrop then 2 else 3 end) or (
    select count(distinct asset->>'role') from jsonb_array_elements(p_assets) asset
    where (asset->>'role' in ('display', 'thumb') or (not recrop and asset->>'role' = 'source'))
      and asset->>'content_type' = 'image/jpeg'
      and case when jsonb_typeof(asset->'bytes') = 'number' then
        (asset->>'bytes')::numeric between 1 and 5242880
        and trunc((asset->>'bytes')::numeric) = (asset->>'bytes')::numeric
      else false end
  ) <> jsonb_array_length(p_assets) then
    raise exception 'MEDIA_INVALID_ASSETS' using errcode = '22023';
  end if;

  select * into reservation from public.entry_media_reservations
  where entry_id = p_entry_id and request_id = p_request_id;
  if found then
    if reservation.assets <> p_assets or reservation.replace_media_id is distinct from p_replace_media_id then
      raise exception 'MEDIA_REQUEST_CONFLICT' using errcode = '22023';
    end if;
    if reservation.state = 'cancelled' or
      (reservation.state = 'pending' and reservation.expires_at <= clock_timestamp()) then
      raise exception 'MEDIA_RESERVATION_EXPIRED' using errcode = '22023';
    end if;
  else
    if (select value from public.app_config where key = 'media_photo_uploads_enabled') is distinct from 'true' then
      raise exception 'MEDIA_UPLOADS_DISABLED' using errcode = '42501';
    end if;
    select count(*) into used_slots from public.entry_media where entry_id = p_entry_id;
    used_slots := used_slots + (
      select count(*) from public.entry_media_reservations
      where entry_id = p_entry_id and state = 'pending' and expires_at > clock_timestamp()
        and replace_media_id is null
    );

    if p_replace_media_id is not null then
      select * into replacement from public.entry_media where id = p_replace_media_id
        and entry_id = p_entry_id and state = 'ready';
      if not found then raise exception 'MEDIA_ITEM_NOT_FOUND' using errcode = '22023'; end if;
      if exists (
        select 1 from public.entry_media_reservations where entry_id = p_entry_id
          and replace_media_id = p_replace_media_id and state = 'pending' and expires_at > clock_timestamp()
      ) then raise exception 'MEDIA_REPLACEMENT_PENDING' using errcode = '22023'; end if;
      next_position := replacement.position;
      target_id := replacement.id;
      select greatest(replacement.revision, coalesce(max(revision), 0)) + 1 into next_revision
      from public.entry_media_reservations where media_id = target_id;
      if recrop and not exists (select 1 from public.entry_media_sources where media_id = replacement.id) then
        raise exception 'MEDIA_SOURCE_NOT_FOUND' using errcode = '22023';
      end if;
      needs_pro := not recrop and (used_slots > 1 or replacement.kind <> 'photo');
    else
      if used_slots >= 10 then raise exception 'MEDIA_CAPACITY' using errcode = '22023'; end if;
      select candidate into next_position
      from generate_series(0, 9) candidate
      where not exists (select 1 from public.entry_media where entry_id = p_entry_id and position = candidate)
        and not exists (select 1 from public.entry_media_reservations
          where entry_id = p_entry_id and position = candidate and state = 'pending'
            and expires_at > clock_timestamp())
      order by candidate limit 1;
      needs_pro := used_slots > 0;
    end if;

    if needs_pro then
      if (select value from public.app_config where key = 'media_gallery_uploads_enabled') is distinct from 'true' then
        raise exception 'MEDIA_GALLERIES_DISABLED' using errcode = '42501';
      end if;
      if public.has_feature('media.multiple') is distinct from true then
        raise exception 'MEDIA_PRO_REQUIRED' using errcode = '42501';
      end if;
    end if;

    insert into public.entry_media_reservations (
      entry_id, request_id, media_id, replace_media_id, position, revision, assets, expires_at
    ) values (
      p_entry_id, p_request_id, target_id, p_replace_media_id, next_position, next_revision, p_assets,
      clock_timestamp() + interval '20 minutes'
    ) returning * into reservation;
  end if;

  prefix := reservation.entry_id || '/' || reservation.media_id || '/' || reservation.revision || '/';
  return jsonb_build_object('reservation_id', reservation.id, 'media_id', reservation.media_id,
    'position', reservation.position, 'revision', reservation.revision, 'expires_at', reservation.expires_at,
    'state', reservation.state, 'paths', jsonb_build_object('source', prefix || 'source.jpg',
      'display', prefix || 'display.jpg', 'thumb', prefix || 'thumb.jpg')
      - case when jsonb_array_length(reservation.assets) = 2 then 'source' else '' end);
end;
$$;

revoke execute on function public.reserve_entry_media(uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.reserve_entry_media(uuid, uuid, text, uuid, jsonb) to authenticated;

-- Storage uses the same lease as the reservation. INSERT only makes every
-- uploaded revision immutable, including before finalization.
create function public.can_upload_entry_media(object_name text, object_metadata jsonb)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.entry_media_reservations r
    join public.entries e on e.id = r.entry_id
    cross join lateral jsonb_array_elements(r.assets) asset
    where e.user_id = auth.uid()
      and r.state = 'pending' and r.expires_at > statement_timestamp()
      and e.id::text = split_part(object_name, '/', 1)
      and object_name = r.entry_id || '/' || r.media_id || '/' || r.revision || '/' || (asset->>'role') || '.jpg'

  );
$$;

revoke execute on function public.can_upload_entry_media(text, jsonb) from public, anon;
grant execute on function public.can_upload_entry_media(text, jsonb) to authenticated;

-- Storage checks INSERT permission before it has populated object metadata.
-- The bucket caps incoming photos and finalize verifies the persisted metadata.
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg']
where id = 'entry-media';

create policy "Upload reserved media files" on storage.objects for insert
to authenticated with check (
  bucket_id = 'entry-media' and public.can_upload_entry_media(name, metadata)
);

create function public.cancel_entry_media(p_reservation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.entries e
  join public.entry_media_reservations r on r.entry_id = e.id
  where e.user_id = auth.uid() and r.id = p_reservation_id
  for update of e;
  if not found then raise exception 'MEDIA_RESERVATION_NOT_FOUND' using errcode = '42501'; end if;

  update public.entry_media_reservations set state = 'cancelled'
  where id = p_reservation_id and state = 'pending';
end;
$$;

revoke execute on function public.cancel_entry_media(uuid) from public, anon;
grant execute on function public.cancel_entry_media(uuid) to authenticated;

-- Crop geometry is checked by entry_media constraints. The trusted photo
-- verifier must set these dimensions and geometry after decoding the files.
alter table public.entry_media_reservations add column verified_photo jsonb;

create function public.finalize_entry_media(p_reservation_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  reservation public.entry_media_reservations;
  target public.entry_media;
  prefix text;
  geometry jsonb;
begin
  perform 1 from public.entries e
  join public.entry_media_reservations r on r.entry_id = e.id
  where e.user_id = auth.uid() and r.id = p_reservation_id for update of e;
  if not found then raise exception 'MEDIA_RESERVATION_NOT_FOUND' using errcode = '42501'; end if;

  select * into strict reservation from public.entry_media_reservations where id = p_reservation_id;
  if reservation.state = 'finalized' then
    return jsonb_build_object('media_id', reservation.media_id, 'revision', reservation.revision,
      'position', reservation.position);
  end if;
  if reservation.state <> 'pending' or reservation.expires_at <= clock_timestamp() then
    raise exception 'MEDIA_RESERVATION_EXPIRED' using errcode = '22023';
  end if;
  if (select value from public.app_config where key = 'media_photo_uploads_enabled') is distinct from 'true' then
    raise exception 'MEDIA_UPLOADS_DISABLED' using errcode = '42501';
  end if;
  if reservation.replace_media_id is not null then
    select * into target from public.entry_media where id = reservation.replace_media_id
      and entry_id = reservation.entry_id;
    if not found then raise exception 'MEDIA_ITEM_NOT_FOUND' using errcode = '22023'; end if;
  end if;
  if jsonb_array_length(reservation.assets) = 3 and (target.kind = 'video' or exists (
    select 1 from public.entry_media where entry_id = reservation.entry_id
      and id is distinct from reservation.replace_media_id
  )) then
    if (select value from public.app_config where key = 'media_gallery_uploads_enabled') is distinct from 'true' then
      raise exception 'MEDIA_GALLERIES_DISABLED' using errcode = '42501';
    end if;
    if public.has_feature('media.multiple') is distinct from true then
      raise exception 'MEDIA_PRO_REQUIRED' using errcode = '42501';
    end if;
  end if;

  prefix := reservation.entry_id || '/' || reservation.media_id || '/' || reservation.revision || '/';
  geometry := reservation.verified_photo;
  if geometry is null or exists (
    select 1 from jsonb_array_elements(reservation.assets) asset
    where not exists (
      select 1 from storage.objects o where o.bucket_id = 'entry-media'
        and o.name = prefix || (asset->>'role') || '.jpg'
        and o.metadata->>'mimetype' = asset->>'content_type'
        and o.metadata->>'size' = asset->>'bytes'
    )
  ) then
    raise exception 'MEDIA_ASSETS_UNVERIFIED' using errcode = '22023';
  end if;

  insert into public.entry_media (
    id, entry_id, kind, position, revision, state, display_path, thumbnail_path,
    source_width, source_height, crop_x, crop_y, crop_width, crop_height
  ) values (
    reservation.media_id, reservation.entry_id, 'photo', coalesce(target.position, reservation.position),
    reservation.revision, 'ready', prefix || 'display.jpg', prefix || 'thumb.jpg',
    (geometry->>'source_width')::integer, (geometry->>'source_height')::integer,
    (geometry->>'crop_x')::numeric, (geometry->>'crop_y')::numeric,
    (geometry->>'crop_width')::numeric, (geometry->>'crop_height')::numeric
  )
  on conflict (id) do update set
    legacy = false, kind = 'photo', revision = excluded.revision, display_path = excluded.display_path,
    thumbnail_path = excluded.thumbnail_path, poster_path = null, duration_ms = null,
    source_width = excluded.source_width, source_height = excluded.source_height, crop_x = excluded.crop_x,
    crop_y = excluded.crop_y, crop_width = excluded.crop_width, crop_height = excluded.crop_height;

  if jsonb_array_length(reservation.assets) = 3 then
    insert into public.entry_media_sources (media_id, source_revision)
    values (reservation.media_id, reservation.revision)
    on conflict (media_id) do update set source_revision = excluded.source_revision;
  end if;

  if target.legacy then
    update public.entries set photo_path = null
    where id = reservation.entry_id and photo_path = target.display_path;
  end if;

  update public.entry_media_reservations set state = 'finalized',
    position = coalesce(target.position, reservation.position) where id = reservation.id
  returning * into reservation;
  return jsonb_build_object('media_id', reservation.media_id, 'revision', reservation.revision,
    'position', reservation.position);
end;
$$;

revoke execute on function public.finalize_entry_media(uuid) from public, anon;
grant execute on function public.finalize_entry_media(uuid) to authenticated;

create function public.reorder_entry_media(p_entry_id uuid, p_media_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then raise exception 'MEDIA_ENTRY_NOT_FOUND' using errcode = '42501'; end if;

  if p_media_ids is null
    or cardinality(p_media_ids) <> (select count(*) from public.entry_media where entry_id = p_entry_id)
    or cardinality(p_media_ids) <> (
      select count(*) from public.entry_media where entry_id = p_entry_id and id = any(p_media_ids)
    ) then
    raise exception 'MEDIA_INVALID_ORDER' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.entry_media_reservations where entry_id = p_entry_id
      and state = 'pending' and expires_at > clock_timestamp()
  ) then raise exception 'MEDIA_UPLOAD_PENDING' using errcode = '22023'; end if;

  set constraints public.entry_media_entry_id_position_key deferred;
  update public.entry_media m set position = ordered.ordinality - 1
  from unnest(p_media_ids) with ordinality ordered(id, ordinality)
  where m.id = ordered.id and m.entry_id = p_entry_id;
  set constraints public.entry_media_entry_id_position_key immediate;
end;
$$;

revoke execute on function public.reorder_entry_media(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_entry_media(uuid, uuid[]) to authenticated;

create function public.delete_entry_media(p_entry_id uuid, p_media_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  removed public.entry_media;
begin
  perform 1 from public.entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then raise exception 'MEDIA_ENTRY_NOT_FOUND' using errcode = '42501'; end if;

  update public.entry_media_reservations set state = 'cancelled'
  where entry_id = p_entry_id and replace_media_id = p_media_id and state = 'pending';

  delete from public.entry_media where id = p_media_id and entry_id = p_entry_id
  returning * into removed;
  if removed.legacy then
    update public.entries set photo_path = null
    where id = p_entry_id and photo_path = removed.display_path;
  end if;
end;
$$;

revoke execute on function public.delete_entry_media(uuid, uuid) from public, anon;
grant execute on function public.delete_entry_media(uuid, uuid) to authenticated;

-- The cleanup worker uses the Storage API to remove bytes. A revision is
-- eligible only after it loses every ready reference and active upload lease.
create function public.list_orphan_entry_media(p_limit integer default 100)
returns table (object_name text)
language sql stable security invoker set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'entry-media'
    and o.created_at < statement_timestamp() - interval '1 hour'
    and not exists (
      select 1 from public.entry_media m
      left join public.entry_media_sources s on s.media_id = m.id
      where m.entry_id::text = split_part(o.name, '/', 1)
        and not m.legacy
        and o.name in (
          m.display_path, m.thumbnail_path, m.poster_path,
          m.entry_id || '/' || m.id || '/' || s.source_revision || '/source.jpg'
        )
    )
    and not exists (
      select 1 from public.entry_media_reservations r
      where r.entry_id::text = split_part(o.name, '/', 1)
        and r.state = 'pending' and r.expires_at > statement_timestamp()
        and starts_with(o.name, r.entry_id || '/' || r.media_id || '/' || r.revision || '/')
    )
  order by o.created_at, o.name
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.list_orphan_entry_media(integer) from public, anon, authenticated;
grant execute on function public.list_orphan_entry_media(integer) to service_role;

create function public.keep_reserved_entry_media_position()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.legacy and exists (
    select 1 from public.entry_media_reservations r
    where r.entry_id = new.entry_id and r.position = new.position
      and r.state = 'pending' and r.expires_at > clock_timestamp()
      and r.replace_media_id is null
  ) then
    update public.entry_media_reservations set state = 'cancelled'
    where entry_id = new.entry_id and position = new.position and state = 'pending'
      and replace_media_id is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_reserved_entry_media_position() from public, anon, authenticated;
create trigger entry_media_keep_reserved_position before insert on public.entry_media
for each row execute function public.keep_reserved_entry_media_position();

create function public.entry_media_verification_target(p_reservation_id uuid, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('state', r.state,
    'prefix', r.entry_id || '/' || r.media_id || '/' || r.revision || '/',
    'source_revision', case when jsonb_array_length(r.assets) = 2 then s.source_revision else r.revision end,
    'revision', r.revision)
  from public.entry_media_reservations r join public.entries e on e.id = r.entry_id
  left join public.entry_media_sources s on s.media_id = r.media_id
  where r.id = p_reservation_id and e.user_id = p_owner
    and (r.state = 'finalized' or (r.state = 'pending' and r.expires_at > statement_timestamp()));
$$;
revoke execute on function public.entry_media_verification_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.entry_media_verification_target(uuid, uuid) to service_role;

create function public.record_entry_media_verification(p_reservation_id uuid, p_geometry jsonb)
returns void
language sql security definer set search_path = ''
as $$
  update public.entry_media_reservations set verified_photo = p_geometry
  where id = p_reservation_id and state = 'pending' and expires_at > statement_timestamp()
    and verified_photo is null;
$$;
revoke execute on function public.record_entry_media_verification(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_entry_media_verification(uuid, jsonb) to service_role;

-- Storage returns the inserted object through SELECT. Keep leased objects
-- visible only to the owner during the active reservation.
create policy "Owners read reserved media files" on storage.objects for select
to authenticated using (
  bucket_id = 'entry-media' and public.can_upload_entry_media(name, null)
);
