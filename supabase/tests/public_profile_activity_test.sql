begin;
select plan(11);
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
insert into auth.users(id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'activity-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'activity-b@example.com');
update public.profiles set handle = 'activity_a' where id = 'aaaaaaaa-0000-0000-0000-000000000000';
update public.profiles set handle = 'activity_b' where id = 'bbbbbbbb-0000-0000-0000-000000000000';
insert into public.shows(id, title) values ('5a000000-0000-0000-0000-000000000001', 'Year test');
insert into public.entries(user_id, show_id, date, visibility, status) values
  ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','2025-12-29','public','logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','2026-01-05','public','logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','2026-01-05','public','logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','2026-01-12','private','logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','2026-01-19','public','logged'),
  ('aaaaaaaa-0000-0000-0000-000000000000','5a000000-0000-0000-0000-000000000001','2026-01-26','public','planned');
create function pg_temp.activity() returns jsonb language sql as $$
  select public.public_profile_activity('aaaaaaaa-0000-0000-0000-000000000000',2026,'2026-01-25');
$$;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((pg_temp.activity()->>'total')::int,3,'year count excludes private, planned and other years');
select is((pg_temp.activity()->>'current_weekly')::int,1,'private entries do not bridge public streaks');
select is((pg_temp.activity()->>'longest_weekly')::int,1,'best streak is within selected year; repeated visits are one week');
select is(pg_temp.activity()->'days','[{"date":"2026-01-05","count":2},{"date":"2026-01-19","count":1}]'::jsonb,'heatmap contains only public logged dates in the year');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is((pg_temp.activity()->>'total')::int,3,'owner public preview also excludes private shows');
reset role;
set local role anon;
select is((pg_temp.activity()->>'total')::int,3,'anonymous aggregate respects public visibility');
reset role;
update public.profiles set is_private = true where id = 'aaaaaaaa-0000-0000-0000-000000000000';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((pg_temp.activity()->>'total')::int,0,'unapproved viewer gets no private-profile activity');
select is(pg_temp.activity()->'days','[]'::jsonb,'hidden profile does not leak activity dates');
reset role;
insert into public.follows(follower_id,followee_id,status) values
  ('bbbbbbbb-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','accepted');
-- The insert trigger makes private-profile requests pending; approve explicitly.
update public.follows set status = 'accepted' where follower_id = 'bbbbbbbb-0000-0000-0000-000000000000' and followee_id = 'aaaaaaaa-0000-0000-0000-000000000000';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((pg_temp.activity()->>'total')::int,3,'approved follower sees only public entries');
reset role;
update public.entries set visibility = 'public' where date = '2026-01-12' and user_id = 'aaaaaaaa-0000-0000-0000-000000000000';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((pg_temp.activity()->>'current_weekly')::int,4,'live streak can cross the year boundary once all weeks are public');
reset role;
insert into public.blocks(blocker_id, blocked_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((pg_temp.activity()->>'total')::int,0,'blocked viewer cannot obtain activity through the RPC');
select * from finish();
rollback;
