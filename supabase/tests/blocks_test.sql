-- Blocking (#144): what a block hides, both ways; that it ends follows and
-- likes; that neither side can follow or react across it; who can see and
-- change blocks; and that unblocking restores visibility but not follows.
-- Run with `supabase test db`.
begin;
select plan(26);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

-- Alice blocks Bob. Carol is a bystander. All three are public, each with a
-- public show. Bob and Alice follow each other; Bob likes and comments on
-- Alice's show; Alice likes and comments on Carol's; Carol comments on Alice's.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@example.com'),
  ('cccccccc-0000-0000-0000-000000000000', 'c@example.com');

update public.profiles set handle = 'alice' where id = 'aaaaaaaa-0000-0000-0000-000000000000';
update public.profiles set handle = 'bob' where id = 'bbbbbbbb-0000-0000-0000-000000000000';
update public.profiles set handle = 'carol' where id = 'cccccccc-0000-0000-0000-000000000000';

insert into public.shows (id, title) values ('5a000000-0000-0000-0000-000000000001', 'Hamilton');

insert into public.entries (id, user_id, show_id, date, visibility) values
  ('e0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '2026-10-01', 'public'),
  ('e0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '2026-10-02', 'public'),
  ('e0000000-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000000', '5a000000-0000-0000-0000-000000000001', '2026-10-03', 'public');

insert into public.follows (follower_id, followee_id) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000');

insert into public.entry_likes (entry_id, user_id) values
  ('e0000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000000'),
  ('e0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000');

insert into public.entry_comments (entry_id, user_id, body) values
  ('e0000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000000', 'From Bob on Alice'),
  ('e0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'From Alice on Carol'),
  ('e0000000-0000-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-000000000000', 'From Carol on Alice');

-- Blocking -------------------------------------------------------------------

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select throws_ok(
  $$ insert into public.blocks (blocker_id, blocked_id)
     values ('aaaaaaaa-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000') $$,
  '42501', null, 'nobody blocks on someone else''s behalf'
);

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select lives_ok(
  $$ insert into public.blocks (blocked_id) values ('bbbbbbbb-0000-0000-0000-000000000000') $$,
  'Alice blocks Bob'
);
select is((select count(*)::int from public.my_blocks()), 1, 'Alice''s blocked accounts list Bob');

select pg_temp.as_admin();
select is(
  (select count(*)::int from public.follows
   where 'aaaaaaaa-0000-0000-0000-000000000000' in (follower_id, followee_id)
     and 'bbbbbbbb-0000-0000-0000-000000000000' in (follower_id, followee_id)),
  0, 'blocking ends follows in both directions'
);
select is(
  (select count(*)::int from public.entry_likes
   where entry_id = 'e0000000-0000-0000-0000-00000000000a' and user_id = 'bbbbbbbb-0000-0000-0000-000000000000'),
  0, 'blocking takes back Bob''s like on Alice''s show'
);

-- What Bob (blocked) sees -------------------------------------------------------

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select is((select count(*)::int from public.blocks), 0, 'Bob can''t see that he''s blocked');
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000000'),
  0, 'Alice''s profile doesn''t exist for Bob'
);
select is(
  (select count(*)::int from public.entries where id = 'e0000000-0000-0000-0000-00000000000a'),
  0, 'Bob can''t see Alice''s show'
);
select is(
  (select count(*)::int from public.entry_comments where body = 'From Alice on Carol'),
  0, 'Bob can''t see Alice''s comments elsewhere'
);
select is(
  (select count(*)::int from public.entry_likes where user_id = 'aaaaaaaa-0000-0000-0000-000000000000'),
  0, 'Bob can''t see Alice''s likes elsewhere'
);
select is(
  (select count(*)::int from public.entry_comments where body = 'From Carol on Alice'),
  0, 'Bob can''t see the thread on Alice''s show'
);
select is((select count(*)::int from public.search_profiles('ali')), 0, 'Bob can''t find Alice');
select throws_ok(
  $$ insert into public.follows (follower_id, followee_id)
     values ('bbbbbbbb-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000') $$,
  '42501', null, 'Bob can''t follow Alice'
);
select throws_ok(
  $$ insert into public.entry_comments (entry_id, body) values ('e0000000-0000-0000-0000-00000000000a', 'Again') $$,
  '42501', null, 'Bob can''t comment on Alice''s show'
);
select throws_ok(
  $$ insert into public.entry_likes (entry_id) values ('e0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'Bob can''t like Alice''s show'
);

-- What Alice (blocker) sees -----------------------------------------------------

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select is(
  (select count(*)::int from public.entries where id = 'e0000000-0000-0000-0000-00000000000b'),
  0, 'Alice can''t see Bob''s show either'
);
select is(
  (select count(*)::int from public.entry_comments where entry_id = 'e0000000-0000-0000-0000-00000000000a'),
  1, 'on her own show Alice sees Carol''s comment, not Bob''s'
);
select is((select count(*)::int from public.search_profiles('bob')), 0, 'Alice doesn''t find Bob in search');
select throws_ok(
  $$ insert into public.follows (follower_id, followee_id)
     values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000') $$,
  '42501', null, 'Alice can''t follow Bob while he''s blocked'
);

-- What everyone else sees -------------------------------------------------------

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
select is(
  (select count(*)::int from public.entry_comments where entry_id = 'e0000000-0000-0000-0000-00000000000a'),
  1, 'Carol doesn''t see Bob''s comment on Alice''s show'
);
select is(
  (select count(*)::int from public.entry_comments where body = 'From Alice on Carol'),
  1, 'Carol still sees Alice''s comment on her show'
);

select pg_temp.as_anon();
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000000'),
  1, 'signed out, Alice''s profile is there as usual'
);

-- Unblocking -------------------------------------------------------------------

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
delete from public.blocks;
select pg_temp.as_admin();
select is((select count(*)::int from public.blocks), 1, 'Bob can''t remove Alice''s block');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
select lives_ok(
  $$ delete from public.blocks where blocked_id = 'bbbbbbbb-0000-0000-0000-000000000000' $$,
  'Alice unblocks Bob'
);

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');
select is(
  (select count(*)::int from public.entry_comments where entry_id = 'e0000000-0000-0000-0000-00000000000a'),
  2, 'unblocking brings Bob''s comment back'
);

select pg_temp.as_admin();
select is(
  (select count(*)::int from public.follows
   where 'aaaaaaaa-0000-0000-0000-000000000000' in (follower_id, followee_id)
     and 'bbbbbbbb-0000-0000-0000-000000000000' in (follower_id, followee_id)),
  0, 'unblocking doesn''t restore follows'
);

select * from finish();
rollback;
