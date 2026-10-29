-- Stand-up is a show type of its own. Run with `supabase test db`.
begin;
select plan(2);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values ('cccccccc-5000-0000-0000-000000000000', 'standup@example.com');

select enum_has_labels(
  'public', 'show_type', array['musical', 'play', 'opera', 'dance', 'comedy', 'standup', 'other'],
  'show types, in order, include stand-up after comedy'
);

select pg_temp.as_user('cccccccc-5000-0000-0000-000000000000');

select lives_ok(
  $$ insert into public.shows (title, type) values ('An Hour of Stand-up', 'standup') $$,
  'signed-in users can add a stand-up show'
);

select * from finish();
rollback;
