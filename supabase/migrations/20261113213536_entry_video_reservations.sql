insert into public.app_config (key, value)
values ('media_video_uploads_enabled', 'false')
on conflict (key) do nothing;

alter table public.entry_media_reservations
add column kind text not null default 'photo' check (kind in ('photo', 'video'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entry-video', 'entry-video', false, 15728640, array['video/mp4']);

create or replace function public.reserve_entry_media(
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

  if p_kind is null or p_kind not in ('photo', 'video') then
    raise exception 'MEDIA_KIND_UNAVAILABLE' using errcode = '22023';
  end if;
  if p_request_id is null or jsonb_typeof(p_assets) is distinct from 'array' then
    raise exception 'MEDIA_INVALID_ASSETS' using errcode = '22023';
  end if;
  if p_kind = 'video' and p_replace_media_id is not null then
    raise exception 'MEDIA_INVALID_ASSETS' using errcode = '22023';
  end if;
  recrop := p_kind = 'photo' and jsonb_array_length(p_assets) = 2 and p_replace_media_id is not null;
  if jsonb_array_length(p_assets) <> (case when recrop then 2 else 3 end) or (
    select count(distinct asset->>'role') from jsonb_array_elements(p_assets) asset
    where case when p_kind = 'video' then
        (asset->>'role' = 'display' and asset->>'content_type' = 'video/mp4')
        or (asset->>'role' in ('poster', 'thumb') and asset->>'content_type' = 'image/jpeg')
      else
        (asset->>'role' in ('display', 'thumb') or (not recrop and asset->>'role' = 'source'))
        and asset->>'content_type' = 'image/jpeg'
      end
      and case when jsonb_typeof(asset->'bytes') = 'number' then
        (asset->>'bytes')::numeric between 1 and (case when asset->>'content_type' = 'video/mp4' then 15728640 else 5242880 end)
        and trunc((asset->>'bytes')::numeric) = (asset->>'bytes')::numeric
      else false end
  ) <> jsonb_array_length(p_assets) then
    raise exception 'MEDIA_INVALID_ASSETS' using errcode = '22023';
  end if;

  select * into reservation from public.entry_media_reservations
  where entry_id = p_entry_id and request_id = p_request_id;
  if found then
    if reservation.kind <> p_kind or reservation.assets <> p_assets or reservation.replace_media_id is distinct from p_replace_media_id then
      raise exception 'MEDIA_REQUEST_CONFLICT' using errcode = '22023';
    end if;
    if reservation.state = 'cancelled' or
      (reservation.state = 'pending' and reservation.expires_at <= clock_timestamp()) then
      raise exception 'MEDIA_RESERVATION_EXPIRED' using errcode = '22023';
    end if;
  else
    if p_kind = 'video' then
      if (select value from public.app_config where key = 'media_video_uploads_enabled') is distinct from 'true' then
        raise exception 'MEDIA_UPLOADS_DISABLED' using errcode = '42501';
      end if;
      if public.has_feature('media.video') is distinct from true then
        raise exception 'MEDIA_PRO_REQUIRED' using errcode = '42501';
      end if;
    elsif (select value from public.app_config where key = 'media_photo_uploads_enabled') is distinct from 'true' then
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
      entry_id, request_id, media_id, replace_media_id, position, revision, assets, expires_at, kind
    ) values (
      p_entry_id, p_request_id, target_id, p_replace_media_id, next_position, next_revision, p_assets,
      clock_timestamp() + interval '20 minutes', p_kind
    ) returning * into reservation;
  end if;

  prefix := reservation.entry_id || '/' || reservation.media_id || '/' || reservation.revision || '/';
  if reservation.kind = 'video' then
    return jsonb_build_object('reservation_id', reservation.id, 'media_id', reservation.media_id,
      'position', reservation.position, 'revision', reservation.revision, 'expires_at', reservation.expires_at,
      'state', reservation.state, 'paths', jsonb_build_object('display', prefix || 'display.mp4',
        'poster', prefix || 'poster.jpg', 'thumb', prefix || 'thumb.jpg'),
      'buckets', jsonb_build_object('display', 'entry-video', 'poster', 'entry-media', 'thumb', 'entry-media'));
  end if;
  return jsonb_build_object('reservation_id', reservation.id, 'media_id', reservation.media_id,
    'position', reservation.position, 'revision', reservation.revision, 'expires_at', reservation.expires_at,
    'state', reservation.state, 'paths', jsonb_build_object('source', prefix || 'source.jpg',
      'display', prefix || 'display.jpg', 'thumb', prefix || 'thumb.jpg')
      - case when jsonb_array_length(reservation.assets) = 2 then 'source' else '' end);
end;
$$;

create or replace function public.can_upload_entry_media(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.entry_media_reservations r
    join public.entries e on e.id = r.entry_id
    cross join lateral jsonb_array_elements(r.assets) asset
    where e.user_id = auth.uid()
      and (r.kind = 'photo' or asset->>'role' in ('poster', 'thumb'))
      and r.state = 'pending' and r.expires_at > statement_timestamp()
      and e.id::text = split_part(object_name, '/', 1)
      and object_name = r.entry_id || '/' || r.media_id || '/' || r.revision || '/' || (asset->>'role') || '.jpg'

  );
$$;

create function public.can_upload_entry_video(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.entry_media_reservations r
    join public.entries e on e.id = r.entry_id
    where e.user_id = auth.uid()
      and r.kind = 'video' and r.state = 'pending' and r.expires_at > statement_timestamp()
      and e.id::text = split_part(object_name, '/', 1)
      and object_name = r.entry_id || '/' || r.media_id || '/' || r.revision || '/display.mp4'
  );
$$;
revoke execute on function public.can_upload_entry_video(text) from public, anon;
grant execute on function public.can_upload_entry_video(text) to authenticated;

create policy "Upload reserved video files" on storage.objects for insert
to authenticated with check (bucket_id = 'entry-video' and public.can_upload_entry_video(name));

create policy "Owners read reserved video files" on storage.objects for select
to authenticated using (bucket_id = 'entry-video' and public.can_upload_entry_video(name));

create policy "Ready videos follow media visibility" on storage.objects for select
to anon, authenticated using (
  bucket_id = 'entry-video' and exists (
    select 1 from public.entry_media m
    where m.entry_id::text = split_part(name, '/', 1)
      and m.kind = 'video' and m.state = 'ready' and name = m.display_path
  )
);

alter table public.entry_media_reservations add column verified_video jsonb;

create or replace function public.entry_media_verification_target(p_reservation_id uuid, p_owner uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('state', r.state, 'kind', r.kind,
    'prefix', r.entry_id || '/' || r.media_id || '/' || r.revision || '/',
    'source_revision', case when jsonb_array_length(r.assets) = 2 then s.source_revision else r.revision end,
    'revision', r.revision)
  from public.entry_media_reservations r join public.entries e on e.id = r.entry_id
  left join public.entry_media_sources s on s.media_id = r.media_id
  where r.id = p_reservation_id and e.user_id = p_owner
    and (r.state = 'finalized' or (r.state = 'pending' and r.expires_at > statement_timestamp()));
$$;

create or replace function public.record_entry_media_verification(p_reservation_id uuid, p_geometry jsonb)
returns void
language sql security definer set search_path = ''
as $$
  update public.entry_media_reservations set verified_photo = p_geometry
  where id = p_reservation_id and kind = 'photo' and state = 'pending' and expires_at > statement_timestamp()
    and verified_photo is null;
$$;

create function public.record_entry_video_verification(p_reservation_id uuid, p_facts jsonb)
returns void
language sql security definer set search_path = ''
as $$
  update public.entry_media_reservations set verified_video = p_facts
  where id = p_reservation_id and kind = 'video' and state = 'pending'
    and expires_at > statement_timestamp() and verified_video is null
    and (p_facts->>'duration_ms')::integer between 1 and 30000;
$$;
revoke execute on function public.record_entry_video_verification(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_entry_video_verification(uuid, jsonb) to service_role;

create or replace function public.finalize_entry_media(p_reservation_id uuid)
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
  if reservation.kind = 'video' then
    if (select value from public.app_config where key = 'media_video_uploads_enabled') is distinct from 'true' then
      raise exception 'MEDIA_UPLOADS_DISABLED' using errcode = '42501';
    end if;
    if public.has_feature('media.video') is distinct from true then
      raise exception 'MEDIA_PRO_REQUIRED' using errcode = '42501';
    end if;
    if exists (select 1 from public.entry_media where entry_id = reservation.entry_id) then
      if (select value from public.app_config where key = 'media_gallery_uploads_enabled') is distinct from 'true' then
        raise exception 'MEDIA_GALLERIES_DISABLED' using errcode = '42501';
      end if;
      if public.has_feature('media.multiple') is distinct from true then
        raise exception 'MEDIA_PRO_REQUIRED' using errcode = '42501';
      end if;
    end if;

    prefix := reservation.entry_id || '/' || reservation.media_id || '/' || reservation.revision || '/';
    if reservation.verified_video is null or exists (
      select 1 from jsonb_array_elements(reservation.assets) asset
      where not exists (
        select 1 from storage.objects o
        where o.bucket_id = case when asset->>'role' = 'display' then 'entry-video' else 'entry-media' end
          and o.name = prefix || (asset->>'role') || case when asset->>'role' = 'display' then '.mp4' else '.jpg' end
          and o.metadata->>'mimetype' = asset->>'content_type'
          and o.metadata->>'size' = asset->>'bytes'
      )
    ) then
      raise exception 'MEDIA_ASSETS_UNVERIFIED' using errcode = '22023';
    end if;

    insert into public.entry_media (
      id, entry_id, kind, position, revision, state, display_path, thumbnail_path, poster_path, duration_ms
    ) values (
      reservation.media_id, reservation.entry_id, 'video', reservation.position, reservation.revision, 'ready',
      prefix || 'display.mp4', prefix || 'thumb.jpg', prefix || 'poster.jpg',
      (reservation.verified_video->>'duration_ms')::integer
    );
    update public.entry_media_reservations set state = 'finalized' where id = reservation.id;
    return jsonb_build_object('media_id', reservation.media_id, 'revision', reservation.revision,
      'position', reservation.position);
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
