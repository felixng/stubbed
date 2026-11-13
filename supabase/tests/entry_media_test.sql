begin;
select plan(15);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000141', 'media-owner@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000141', 'media-reader@example.com');

insert into public.shows (id, title)
values ('50000000-0000-0000-0000-000000000141', 'Media test');

insert into public.entries (id, user_id, show_id, date, visibility, photo_path)
values ('e0000000-0000-0000-0000-000000000141', 'aaaaaaaa-0000-0000-0000-000000000141',
  '50000000-0000-0000-0000-000000000141', '2026-10-01', 'public',
  'aaaaaaaa-0000-0000-0000-000000000141/e0000000-0000-0000-0000-000000000141.jpg');

create temp table original_cover as select media_id, photo_path from public.entry_media_covers;
update public.entries set photo_path = photo_path where id = 'e0000000-0000-0000-0000-000000000141';
select is((select media_id from public.entry_media_covers), (select media_id from original_cover),
  'legacy synchronization preserves the media ID');
select is((select photo_path from public.entries where id = 'e0000000-0000-0000-0000-000000000141'),
  (select photo_path from original_cover), 'the legacy read shape retains the original path');

update public.entry_media set position = 2 where legacy and entry_id = 'e0000000-0000-0000-0000-000000000141';
insert into public.entry_media (
  id, entry_id, kind, position, state, display_path, thumbnail_path,
  source_width, source_height, crop_x, crop_y, crop_width, crop_height
)
values (
  'f0000000-0000-0000-0000-000000000141', 'e0000000-0000-0000-0000-000000000141', 'photo', 1, 'ready',
  'e0000000-0000-0000-0000-000000000141/f0000000-0000-0000-0000-000000000141/1/display.jpg',
  'e0000000-0000-0000-0000-000000000141/f0000000-0000-0000-0000-000000000141/1/thumb.jpg',
  1600, 800, 0.25, 0, 0.5, 1
);
insert into public.entry_media (entry_id, kind, position, state)
values ('e0000000-0000-0000-0000-000000000141', 'video', 0, 'pending');
insert into public.entry_media_sources values ('f0000000-0000-0000-0000-000000000141', 1);

insert into storage.objects (bucket_id, name)
select 'entry-media', display_path from public.entry_media where id = 'f0000000-0000-0000-0000-000000000141'
union all select 'entry-media', 'e0000000-0000-0000-0000-000000000141/f0000000-0000-0000-0000-000000000141/1/source.jpg';

select is((select media_id from public.entry_media_covers), 'f0000000-0000-0000-0000-000000000141'::uuid,
  'cover is the first ready item');
select throws_ok($$update public.entry_media set crop_width = 0.6 where id = 'f0000000-0000-0000-0000-000000000141'$$,
  '23514', null, 'rejects a rectangle that is not square in pixels');
select throws_ok($$update public.entry_media set crop_x = 'NaN' where id = 'f0000000-0000-0000-0000-000000000141'$$,
  '23514', null, 'rejects a nonfinite crop');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000141', true);
select is((select count(*) from public.entry_media), 2::bigint, 'reader sees only ready items');
select is((select count(*) from public.entry_media_sources), 0::bigint, 'reader cannot see source references');
select is((select count(*) from storage.objects where bucket_id = 'entry-media'), 1::bigint, 'reader sees only the display file');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000141', true);
select is((select count(*) from public.entry_media), 3::bigint, 'owner sees pending items too');
select is((select count(*) from storage.objects where bucket_id = 'entry-media'), 2::bigint, 'owner can read the source');
select throws_ok($$delete from public.entry_media$$, '42501', null, 'owner cannot bypass the gallery write API');
update public.entries set photo_path = null where id = 'e0000000-0000-0000-0000-000000000141';
select is((select count(*) from public.entry_media), 3::bigint, 'legacy removal cannot erase a gallery');

update public.profiles set is_private = true where id = 'aaaaaaaa-0000-0000-0000-000000000141';
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000141', true);
select is((select count(*) from public.entry_media), 0::bigint, 'private profiles hide media from nonfollowers');

reset role;
update public.profiles set is_private = false where id = 'aaaaaaaa-0000-0000-0000-000000000141';
update public.entries set visibility = 'private' where id = 'e0000000-0000-0000-0000-000000000141';
set local role authenticated;
select is((select count(*) from public.entry_media), 0::bigint, 'private entry hides media');
reset role;
update public.entries set visibility = 'public' where id = 'e0000000-0000-0000-0000-000000000141';
insert into public.blocks (blocker_id, blocked_id)
values ('aaaaaaaa-0000-0000-0000-000000000141', 'bbbbbbbb-0000-0000-0000-000000000141');
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'entry-media'), 0::bigint, 'block hides gallery objects');

select * from finish();
rollback;
