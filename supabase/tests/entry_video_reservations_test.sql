begin;
select plan(7);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000523', 'video-owner@example.com');
insert into public.shows (id, title) values ('50000000-0000-0000-0000-000000000523', 'Video test');
insert into public.entries (id, user_id, show_id, date, visibility)
values ('e0000000-0000-0000-0000-000000000523', 'aaaaaaaa-0000-0000-0000-000000000523',
  '50000000-0000-0000-0000-000000000523', '2026-10-01', 'public');

create function pg_temp.reserve_video() returns jsonb language sql as $$
  select public.reserve_entry_media('e0000000-0000-0000-0000-000000000523',
    'a0000000-0000-0000-0000-000000000523', 'video', null,
    '[{"role":"display","content_type":"video/mp4","bytes":100},{"role":"poster","content_type":"image/jpeg","bytes":100},{"role":"thumb","content_type":"image/jpeg","bytes":100}]');
$$;

update public.app_config set value = 'false' where key in ('media_video_uploads_enabled', 'paywall_gates_enabled');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000523', true);
select throws_ok('select pg_temp.reserve_video()', '42501', 'MEDIA_UPLOADS_DISABLED', 'video rollout is enforced');
reset role;
update public.app_config set value = 'true' where key = 'media_video_uploads_enabled';
set local role authenticated;
create temp table video_lease as select pg_temp.reserve_video() as data;
select is(pg_temp.reserve_video(), (select data from video_lease), 'retry keeps the same reservation');
select ok(public.can_upload_entry_video((select data #>> '{paths,display}' from video_lease)), 'owner can upload the leased MP4');
select throws_ok($$select public.finalize_entry_media((data->>'reservation_id')::uuid) from video_lease$$,
  '22023', 'MEDIA_ASSETS_UNVERIFIED', 'unverified video cannot publish');

reset role;
insert into storage.objects (bucket_id, name, metadata, created_at)
select data->'buckets'->>asset.key, asset.value,
  jsonb_build_object('size', 100, 'mimetype', case when asset.key = 'display' then 'video/mp4' else 'image/jpeg' end),
  now() - interval '2 hours'
from video_lease cross join lateral jsonb_each_text(data->'paths') asset;
select public.record_entry_video_verification((data->>'reservation_id')::uuid, '{"duration_ms":30000}') from video_lease;
set local role authenticated;
create temp table video_finalized as select public.finalize_entry_media((data->>'reservation_id')::uuid) as data from video_lease;
select is((select public.finalize_entry_media((data->>'reservation_id')::uuid) from video_lease),
  (select data from video_finalized), 'verified publication is idempotent');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from storage.objects where bucket_id = 'entry-video'
  and name like 'e0000000-0000-0000-0000-000000000523/%'), 1::bigint, 'public ready video is readable');
reset role;
delete from public.entries where id = 'e0000000-0000-0000-0000-000000000523';
select is((select count(*) from public.list_orphan_entry_video()
  where object_name like 'e0000000-0000-0000-0000-000000000523/%'), 1::bigint, 'entry deletion releases its stored video');
select * from finish();
rollback;
