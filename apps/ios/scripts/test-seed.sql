-- Local-only diary for the UI test user (ios-test@stubbed.local), run by
-- `scripts/dev test-users` after the account exists. Replaces the user's
-- entries and trips each run, so tests start from the same diary.
do $$
declare
  uid uuid := (select id from auth.users where email = 'ios-test@stubbed.local');
  friend uuid := (select id from auth.users where email = 'ios-friend@stubbed.local');
  fan uuid := (select id from auth.users where email = 'ios-fan@stubbed.local');
  i integer;
begin
  delete from public.entries where user_id in (uid, friend);
  delete from public.collections where user_id in (uid, friend);
  delete from public.follows
    where uid in (follower_id, followee_id) or friend in (follower_id, followee_id) or fan in (follower_id, followee_id);
  update public.profiles set handle = coalesce(handle, 'ios_fan'), display_name = 'A Fan' where id = fan;
  update public.profiles set is_private = false, default_visibility = 'public' where id = uid;
  update public.profiles
    set handle = coalesce(handle, 'ios_friend'), display_name = 'Friend of iOS', bio = 'Fringe every August.',
        is_private = false
    where id = friend;
  update public.profiles set display_name = 'iOS Test', bio = 'Musicals, mostly. Always the front row.',
    link = 'https://www.instagram.com/ios_test/'
    where id = uid;

  insert into public.shows (id, title, type) values
    ('00000000-0000-4000-a000-000000000001', 'Hamilton', 'musical'),
    ('00000000-0000-4000-a000-000000000002', 'Operation Mincemeat', 'musical'),
    ('00000000-0000-4000-a000-000000000003', 'Hadestown', 'musical'),
    ('00000000-0000-4000-a000-000000000004', 'Stereophonic', 'play')
  on conflict (id) do nothing;
  insert into public.venues (id, name, city, country) values
    ('00000000-0000-4000-b000-000000000001', 'Richard Rodgers Theatre', 'New York', 'United States'),
    ('00000000-0000-4000-b000-000000000002', 'Golden Theatre', 'New York', 'United States'),
    ('00000000-0000-4000-b000-000000000003', 'Walter Kerr Theatre', 'New York', 'United States'),
    ('00000000-0000-4000-b000-000000000004', 'Duke of York''s Theatre', 'London', 'United Kingdom')
  on conflict (id) do nothing;
  -- A real location, so a photo taken there finds it as a nearby theatre.
  update public.venues set lat = 40.75929, lng = -73.98674
    where id = '00000000-0000-4000-b000-000000000001';

  insert into public.collections (id, user_id, name, kind, start_date, end_date) values
    ('00000000-0000-4000-c000-000000000001', uid, 'NYC Oct 2026', 'trip', '2026-10-04', '2026-10-08');

  insert into public.entries (id, user_id, show_id, venue_id, date, status, rating, note, visibility) values
    ('00000000-0000-4000-d000-000000000001', uid, '00000000-0000-4000-a000-000000000001',
     '00000000-0000-4000-b000-000000000001', '2026-10-05', 'logged', 4.5,
     'Lin''s replacement was brilliant. Front mezz, row B.', 'public'),
    ('00000000-0000-4000-d000-000000000002', uid, '00000000-0000-4000-a000-000000000002',
     '00000000-0000-4000-b000-000000000002', '2026-10-06', 'logged', 5, null, 'public'),
    ('00000000-0000-4000-d000-000000000003', uid, '00000000-0000-4000-a000-000000000004',
     '00000000-0000-4000-b000-000000000004', '2026-09-12', 'logged', 4, null, 'private'),
    ('00000000-0000-4000-d000-000000000004', uid, '00000000-0000-4000-a000-000000000003',
     '00000000-0000-4000-b000-000000000003', current_date + 20, 'planned', null, null, 'public');

  insert into public.entry_collections (entry_id, collection_id) values
    ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001'),
    ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000001');

  -- The friend: public, followed by the test user and following back, with
  -- 24 public shows (more than one feed page) and a like on Hamilton.
  insert into public.follows (follower_id, followee_id) values (uid, friend), (friend, uid);
  for i in 1..24 loop
    insert into public.entries (user_id, show_id, venue_id, date, status, rating, note, visibility)
    values (friend, ('00000000-0000-4000-a000-00000000000' || (1 + i % 4))::uuid, ('00000000-0000-4000-b000-00000000000' || (1 + i % 4))::uuid,
            date '2026-10-10' - i * 3, 'logged', 3 + (i % 5) * 0.5,
            case when i = 1 then 'Second time round and it still lands.' end, 'public');
  end loop;
  -- A request waiting for the test user's approval. Inserting sets the
  -- status from the followee's privacy, so set it back to pending after.
  insert into public.follows (follower_id, followee_id) values (fan, uid);
  update public.follows set status = 'pending' where follower_id = fan and followee_id = uid;

  insert into public.entry_likes (entry_id, user_id) values ('00000000-0000-4000-d000-000000000001', friend);
  insert into public.entry_comments (entry_id, user_id, body)
    values ('00000000-0000-4000-d000-000000000001', friend, 'Front mezz is the best seat in that house.');
end $$;
