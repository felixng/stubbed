begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000518', 'reserve-owner@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000518', 'reserve-other@example.com');
insert into public.shows (id, title) values ('50000000-0000-0000-0000-000000000518', 'Reservation test');
insert into public.entries (id, user_id, show_id, date)
values ('e0000000-0000-0000-0000-000000000518', 'aaaaaaaa-0000-0000-0000-000000000518',
  '50000000-0000-0000-0000-000000000518', '2026-10-01');

create function pg_temp.reserve(request_id uuid) returns jsonb language sql as $$
  select public.reserve_entry_media('e0000000-0000-0000-0000-000000000518', request_id, 'photo', null,
    '[{"role":"source","content_type":"image/jpeg","bytes":100},{"role":"display","content_type":"image/jpeg","bytes":100},{"role":"thumb","content_type":"image/jpeg","bytes":100}]'::jsonb);
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000518', true);
select throws_ok($$select pg_temp.reserve(gen_random_uuid())$$, '42501', 'MEDIA_ENTRY_NOT_FOUND', 'reservation requires ownership');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000518', true);
select throws_ok($$select pg_temp.reserve(gen_random_uuid())$$, '42501', 'MEDIA_UPLOADS_DISABLED', 'rollout defaults off');
reset role;
update public.app_config set value = 'true' where key = 'media_photo_uploads_enabled';
set local role authenticated;
create temp table reservation as select pg_temp.reserve('a0000000-0000-0000-0000-000000000518') as data;
select is(pg_temp.reserve('a0000000-0000-0000-0000-000000000518'), (select data from reservation), 'request retry returns same lease');
select throws_ok($$select pg_temp.reserve(gen_random_uuid())$$, '42501', 'MEDIA_GALLERIES_DISABLED', 'pending item consumes the free slot');
select ok(public.can_upload_entry_media((select data #>> '{paths,source}' from reservation),
  '{"mimetype":"image/jpeg","size":100}'), 'owner may upload declared object');
select ok(not public.can_upload_entry_media((select replace(data #>> '{paths,source}', 'source.jpg', 'other.jpg') from reservation),
  null), 'unreserved path is denied');
select throws_ok($$select public.finalize_entry_media((select (data->>'reservation_id')::uuid from reservation))$$,
  '22023', 'MEDIA_ASSETS_UNVERIFIED', 'cannot finalize missing or unverified objects');

reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'entry-media', asset.value, '{"mimetype":"image/jpeg","size":100}'::jsonb
from reservation cross join lateral jsonb_each_text(data->'paths') asset;
select public.record_entry_media_verification(
  (select (data->>'reservation_id')::uuid from reservation),
  '{"source_width":800,"source_height":400,"crop_x":0.25,"crop_y":0,"crop_width":0.5,"crop_height":1}'
);
set local role authenticated;
create temp table finalized as
select public.finalize_entry_media((data->>'reservation_id')::uuid) as data from reservation;
select is((select count(*) from public.entry_media where state = 'ready'), 1::bigint, 'verified reservation creates ready media');
select is(public.finalize_entry_media((select (data->>'reservation_id')::uuid from reservation)),
  (select data from finalized), 'duplicate finalize returns the original result');

create temp table recrop as
select public.reserve_entry_media('e0000000-0000-0000-0000-000000000518', gen_random_uuid(),
  'photo', (data->>'media_id')::uuid,
  '[{"role":"display","content_type":"image/jpeg","bytes":100},{"role":"thumb","content_type":"image/jpeg","bytes":100}]'
) as data from finalized;
select ok(not (select (data->'paths') ? 'source' from recrop), 'recrop receives only derivative paths');
select ok(not public.can_upload_entry_media(
  (select replace(data #>> '{paths,display}', 'display.jpg', 'source.jpg') from recrop),
  '{"mimetype":"image/jpeg","size":100}'), 'recrop cannot authorize a new source');

select public.delete_entry_media('e0000000-0000-0000-0000-000000000518',
  (select (data->>'media_id')::uuid from finalized));
select is((select count(*) from public.entry_media), 0::bigint, 'deleting ready media removes gallery metadata');
select throws_ok($$select public.finalize_entry_media((select (data->>'reservation_id')::uuid from recrop))$$,
  '22023', 'MEDIA_RESERVATION_EXPIRED', 'deleting media cancels an active recrop');

select * from finish();
rollback;
