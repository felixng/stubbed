-- Local-only diary for the landing page's screenshots (`scripts/dev
-- marketing`): @sillyelphaba, the sample handle, with a season of shows,
-- two coming up and two trips. Replaces the account's entries and trips each
-- run. Photos are uploaded by the script afterwards; photo_path is set here.
do $$
declare
  uid uuid := (select id from auth.users where email = 'marketing@stubbed.local');
begin
  delete from public.entries where user_id = uid;
  delete from public.collections where user_id = uid;
  update public.profiles
    set display_name = 'Elphie', bio = 'Musicals, mostly. Always the aisle seat.',
        is_private = false, default_visibility = 'public'
    where id = uid;

  insert into public.shows (id, title, type) values
    ('00000000-0000-4000-a100-000000000001', 'The Lost Boys', 'musical'),
    ('00000000-0000-4000-a100-000000000002', 'Operation Mincemeat', 'musical'),
    ('00000000-0000-4000-a100-000000000003', 'Death Note: The Musical', 'musical'),
    ('00000000-0000-4000-a100-000000000004', 'Groundhog Day', 'musical'),
    ('00000000-0000-4000-a100-000000000005', 'Cabaret', 'musical'),
    ('00000000-0000-4000-a100-000000000006', 'Guys and Dolls', 'musical'),
    ('00000000-0000-4000-a100-000000000007', 'Rent', 'musical'),
    ('00000000-0000-4000-a100-000000000008', 'The Importance of Being Earnest', 'play'),
    ('00000000-0000-4000-a100-000000000009', 'Wicked', 'musical'),
    ('00000000-0000-4000-a100-000000000010', 'Hamilton', 'musical')
  on conflict (id) do nothing;
  -- No city or country: the screenshots are public copy, which never names a
  -- place, and the app leaves out what's missing.
  insert into public.venues (id, name) values
    ('00000000-0000-4000-b100-000000000001', 'Palace Theatre'),
    ('00000000-0000-4000-b100-000000000002', 'Fortune Theatre'),
    ('00000000-0000-4000-b100-000000000003', 'London Palladium'),
    ('00000000-0000-4000-b100-000000000004', 'The Old Vic'),
    ('00000000-0000-4000-b100-000000000005', 'Playhouse Theatre'),
    ('00000000-0000-4000-b100-000000000006', 'Bridge Theatre'),
    ('00000000-0000-4000-b100-000000000007', 'Hope Mill Theatre'),
    ('00000000-0000-4000-b100-000000000008', 'Theatre Royal'),
    ('00000000-0000-4000-b100-000000000009', 'Apollo Victoria Theatre'),
    ('00000000-0000-4000-b100-000000000010', 'Victoria Palace Theatre')
  on conflict (id) do update set city = null, country = null;

  insert into public.collections (id, user_id, name, kind, start_date, end_date) values
    ('00000000-0000-4000-c100-000000000001', uid, 'Birthday weekend', 'trip', '2026-08-21', '2026-08-23'),
    ('00000000-0000-4000-c100-000000000002', uid, 'November matinees', 'trip', '2026-11-07', '2026-11-21');

  insert into public.entries (id, user_id, show_id, venue_id, date, status, rating, note, visibility, photo_path)
  select e.id::uuid, uid, e.show::uuid, e.venue::uuid, e.date::date, e.status::public.entry_status, e.rating, e.note, 'public',
         case when e.photo then uid::text || '/' || e.id || '.jpg' end
  from (values
    ('00000000-0000-4000-d100-000000000001', '00000000-0000-4000-a100-000000000001', '00000000-0000-4000-b100-000000000001',
     '2026-10-18', 'logged', 4.5, 'Came for the vampires, stayed for the harmonies. That opening still has me.', true),
    ('00000000-0000-4000-d100-000000000002', '00000000-0000-4000-a100-000000000002', '00000000-0000-4000-b100-000000000002',
     '2026-10-02', 'logged', 5, 'Third time. Still the funniest thing on any stage.', true),
    ('00000000-0000-4000-d100-000000000003', '00000000-0000-4000-a100-000000000003', '00000000-0000-4000-b100-000000000003',
     '2026-09-13', 'logged', 4, null, true),
    ('00000000-0000-4000-d100-000000000004', '00000000-0000-4000-a100-000000000004', '00000000-0000-4000-b100-000000000004',
     '2026-08-22', 'logged', 4.5, null, true),
    ('00000000-0000-4000-d100-000000000005', '00000000-0000-4000-a100-000000000005', '00000000-0000-4000-b100-000000000005',
     '2026-08-21', 'logged', 3.5, null, true),
    ('00000000-0000-4000-d100-000000000006', '00000000-0000-4000-a100-000000000006', '00000000-0000-4000-b100-000000000006',
     '2026-07-11', 'logged', 5, 'Standing tickets in the middle of it all. Worth every minute on my feet.', true),
    ('00000000-0000-4000-d100-000000000007', '00000000-0000-4000-a100-000000000007', '00000000-0000-4000-b100-000000000007',
     '2026-06-14', 'logged', 4, null, true),
    ('00000000-0000-4000-d100-000000000008', '00000000-0000-4000-a100-000000000008', '00000000-0000-4000-b100-000000000008',
     '2026-05-30', 'logged', 3.5, null, true),
    ('00000000-0000-4000-d100-000000000009', '00000000-0000-4000-a100-000000000009', '00000000-0000-4000-b100-000000000009',
     '2026-11-07', 'planned', null, null, false),
    ('00000000-0000-4000-d100-000000000010', '00000000-0000-4000-a100-000000000010', '00000000-0000-4000-b100-000000000010',
     '2026-11-21', 'planned', null, null, false)
  ) as e(id, show, venue, date, status, rating, note, photo);

  insert into public.entry_collections (entry_id, collection_id) values
    ('00000000-0000-4000-d100-000000000004', '00000000-0000-4000-c100-000000000001'),
    ('00000000-0000-4000-d100-000000000005', '00000000-0000-4000-c100-000000000001'),
    ('00000000-0000-4000-d100-000000000009', '00000000-0000-4000-c100-000000000002'),
    ('00000000-0000-4000-d100-000000000010', '00000000-0000-4000-c100-000000000002');
end $$;
