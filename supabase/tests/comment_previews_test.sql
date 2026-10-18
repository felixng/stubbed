-- Comment previews for the home feed: the latest few comments per entry, only
-- where the caller may see the entry's comments. Run with `supabase test db`.
begin;
select plan(9);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

-- Bob is public with a public entry (b1) holding three comments and a private
-- one (b2). Alice is private with a public entry (a1) holding one comment;
-- Carol follows her, Dave doesn't.
-- Fixtures, as the superuser --------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@example.com'),
  ('cccccccc-0000-0000-0000-000000000000', 'c@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'd@example.com');

update public.profiles set handle = 'alice', is_private = true where id = 'aaaaaaaa-0000-0000-0000-000000000000';
update public.profiles set handle = 'bob' where id = 'bbbbbbbb-0000-0000-0000-000000000000';
update public.profiles set handle = 'carol' where id = 'cccccccc-0000-0000-0000-000000000000';
update public.profiles set handle = 'dave' where id = 'dddddddd-0000-0000-0000-000000000000';

insert into public.shows (id, title) values ('5a000000-0000-0000-0000-000000000001', 'Hamilton');

insert into public.entries (id, user_id, show_id, date, visibility, status) values
  ('e0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000',
   '5a000000-0000-0000-0000-000000000001', '2026-10-01', 'public', 'logged'),
  ('e0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000000',
   '5a000000-0000-0000-0000-000000000001', '2026-10-01', 'public', 'logged'),
  ('e0000000-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000000',
   '5a000000-0000-0000-0000-000000000001', '2026-10-02', 'public', 'logged');

insert into public.follows (follower_id, followee_id) values
  ('cccccccc-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000');
update public.follows set status = 'accepted';

-- The trigger stamps now(), the same within a transaction, so the times are
-- set afterwards to give the comments an order.
insert into public.entry_comments (id, entry_id, user_id, body) values
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-000000000000', 'First'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000b1', 'dddddddd-0000-0000-0000-000000000000', 'Second'),
  ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-000000000000', 'Third'),
  ('c0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-000000000000', 'Before it went private'),
  ('c0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000000', 'Jealous');
update public.entry_comments set created_at = '2026-10-02 10:00' where id = 'c0000000-0000-0000-0000-000000000001';
update public.entry_comments set created_at = '2026-10-02 11:00' where id = 'c0000000-0000-0000-0000-000000000002';
update public.entry_comments set created_at = '2026-10-02 12:00' where id = 'c0000000-0000-0000-0000-000000000003';

-- b2 is made private after it was commented on.
update public.entries set visibility = 'private' where id = 'e0000000-0000-0000-0000-0000000000b2';

-- Previews -------------------------------------------------------------------

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000000');

select results_eq(
  $$ select body from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b1']::uuid[]) $$,
  $$ values ('Second'), ('Third') $$,
  'the latest two comments come back, oldest first'
);

select results_eq(
  $$ select handle from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b1']::uuid[], 1) $$,
  $$ values ('carol') $$,
  'each comment carries its author'
);

select is(
  (select count(*)::integer from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b1']::uuid[], 50)),
  3,
  'asking for more than there are returns them all'
);

select is(
  (select count(*)::integer from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b1']::uuid[], -1)),
  0,
  'a negative count returns none'
);

select is(
  (select count(*)::integer from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000a1']::uuid[])),
  0,
  'a stranger gets no comments from a private profile''s entry'
);

select is(
  (select count(*)::integer from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b2']::uuid[])),
  0,
  'nobody else gets comments on an entry made private'
);

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');

select results_eq(
  $$ select entry_id, body from public.entry_comment_previews(array[
       'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000b1']::uuid[]) $$,
  $$ values ('e0000000-0000-0000-0000-0000000000a1'::uuid, 'Jealous'),
            ('e0000000-0000-0000-0000-0000000000b1'::uuid, 'Second'),
            ('e0000000-0000-0000-0000-0000000000b1'::uuid, 'Third') $$,
  'an approved follower gets a private profile''s comments, grouped by entry'
);

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

select is(
  (select count(*)::integer from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b2']::uuid[])),
  1,
  'the owner still sees comments on their entry made private'
);

select pg_temp.as_anon();

select is(
  (select count(*)::integer from public.entry_comment_previews(array['e0000000-0000-0000-0000-0000000000b1']::uuid[])),
  2,
  'visitors get previews on a public entry'
);

select * from finish();
rollback;
