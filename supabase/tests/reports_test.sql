-- Reporting (#176): who can report what, that reports are private to admins,
-- and that only admins resolve them (hiding the content, or dismissing).
-- Run with `supabase test db`.
begin;
select plan(14);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.as_admin_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'app_metadata', json_build_object('role', 'admin'))::text, true);
$$;

create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

-- Alice posts a show and comments on it; Bob reports both; Admin acts.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@example.com'),
  ('dddddddd-0000-0000-0000-000000000000', 'admin@example.com');

update public.profiles set handle = 'alice' where id = 'aaaaaaaa-0000-0000-0000-000000000000';
update public.profiles set handle = 'bob' where id = 'bbbbbbbb-0000-0000-0000-000000000000';
update public.profiles set handle = 'admin' where id = 'dddddddd-0000-0000-0000-000000000000';

insert into public.shows (id, title) values ('5a000000-0000-0000-0000-000000000001', 'Hamilton');
insert into public.entries (id, user_id, show_id, date, visibility, note) values
  ('e0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000',
   '5a000000-0000-0000-0000-000000000001', '2026-10-01', 'public', 'Rude note');
insert into public.entry_comments (id, entry_id, user_id, body) values
  ('c0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a',
   'aaaaaaaa-0000-0000-0000-000000000000', 'Rude comment');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');
select lives_ok(
  $$ insert into public.reports (target_type, target_id, reason)
     values ('entry', 'e0000000-0000-0000-0000-00000000000a', 'inappropriate') $$,
  'Bob reports Alice''s show'
);
select lives_ok(
  $$ insert into public.reports (target_type, target_id, reason, note)
     values ('comment', 'c0000000-0000-0000-0000-00000000000a', 'harassment', 'Aimed at me') $$,
  'Bob reports Alice''s comment, with a note'
);
select throws_ok(
  $$ insert into public.reports (target_type, target_id, reason)
     values ('entry', 'e0000000-0000-0000-0000-00000000000a', 'spam') $$,
  '23505', null, 'one open report per person per thing'
);
select throws_ok(
  $$ insert into public.reports (target_type, target_id, reason)
     values ('profile', 'bbbbbbbb-0000-0000-0000-000000000000', 'spam') $$,
  '22023', null, 'nobody reports themselves'
);
select throws_ok(
  $$ insert into public.reports (target_type, target_id, reason)
     values ('comment', 'c0000000-0000-0000-0000-0000000000ff', 'spam') $$,
  'P0002', null, 'nothing to report, nothing saved'
);
select throws_ok(
  $$ insert into public.reports (reporter_id, target_type, target_id, reason)
     values ('aaaaaaaa-0000-0000-0000-000000000000', 'profile', 'bbbbbbbb-0000-0000-0000-000000000000', 'spam') $$,
  '42501', null, 'nobody reports on someone else''s behalf'
);
select is((select count(*)::int from public.reports), 0, 'Bob can''t read reports, his own included');
select throws_ok(
  $$ select public.resolve_report((select id from public.reports limit 1), 'hide') $$,
  '42501', null, 'only admins resolve reports'
);

select pg_temp.as_postgres();
select is(
  (select snapshot || ' / ' || target_owner from public.reports where target_type = 'comment'),
  'Rude comment / aaaaaaaa-0000-0000-0000-000000000000',
  'a report keeps what was said and who said it'
);

select pg_temp.as_admin_user('dddddddd-0000-0000-0000-000000000000');
select is((select count(*)::int from public.reports where resolved_at is null), 2, 'an admin reads open reports');
select lives_ok(
  $$ select public.resolve_report((select id from public.reports where target_type = 'comment'), 'hide') $$,
  'an admin hides the reported comment'
);
select lives_ok(
  $$ select public.resolve_report((select id from public.reports where target_type = 'entry'), 'dismiss') $$,
  'an admin dismisses the report about the show'
);

select pg_temp.as_postgres();
select is(
  (select count(*)::int from public.entry_comments where id = 'c0000000-0000-0000-0000-00000000000a'),
  0, 'hiding a comment deletes it'
);
select is(
  (select string_agg(target_type || ':' || resolution, ',' order by target_type) from public.reports),
  'comment:hidden,entry:dismissed', 'both reports are resolved, each its own way'
);

select * from finish();
rollback;
