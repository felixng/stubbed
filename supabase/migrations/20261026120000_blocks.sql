-- Blocking (#144), needed before public sign-up and by App Review (1.2).
-- A block works both ways, and nobody is told:
-- - the two can't see each other's shows, trips, photos, likes, comments or
--   follow lists anywhere (profile_is_visible looks at blocks both ways);
-- - the blocker's profile doesn't exist for the person they blocked: profile
--   lookups, their likes and their comments elsewhere return nothing, so to
--   them it reads as "no one here";
-- - the blocked person's comments on the blocker's shows are hidden from
--   everyone, the blocker included, and come back on unblock;
-- - blocking ends follows and requests in both directions and removes the
--   blocked person's likes on the blocker's shows; neither can follow the
--   other while the block stands. Unblocking doesn't restore follows.
-- Clients write the table directly; the rules live here.

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- "Has this person blocked me?" looks up by the blocked side.
create index blocks_blocked_idx on public.blocks (blocked_id, blocker_id);

alter table public.blocks enable row level security;

revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
grant delete on public.blocks to authenticated;

create policy "Blockers see their own blocks"
  on public.blocks for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Users block as themselves"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "Blockers unblock"
  on public.blocks for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- Whether either of two people has blocked the other. Security definer so
-- policies can ask without blocks' own RLS (which hides others' blocks).
create function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

revoke execute on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to anon, authenticated;

-- Whether `profile_id` has blocked the caller. False for signed-out visitors.
create function public.has_blocked_me(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where blocker_id = profile_id and blocked_id = (select auth.uid())
  );
$$;

revoke execute on function public.has_blocked_me(uuid) from public;
grant execute on function public.has_blocked_me(uuid) to anon, authenticated;

-- Whether a comment is by someone the entry's owner has blocked.
create function public.comment_by_blocked(entry uuid, commenter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entries e
    join public.blocks b on b.blocker_id = e.user_id and b.blocked_id = commenter
    where e.id = entry
  );
$$;

revoke execute on function public.comment_by_blocked(uuid, uuid) from public;
grant execute on function public.comment_by_blocked(uuid, uuid) to anon, authenticated;

-- Visibility: as before (not private, theirs, or an approved follower), and
-- no block between the caller and the profile, in either direction.
create or replace function public.profile_is_visible(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = profile_id
      and (
        not p.is_private
        or p.id = (select auth.uid())
        or exists (
          select 1 from public.follows f
          where f.followee_id = p.id
            and f.follower_id = (select auth.uid())
            and f.status = 'accepted'
        )
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
           or (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
      )
  );
$$;

-- The blocker's profile row doesn't exist for the person they blocked.
alter policy "Profiles are public"
  on public.profiles
  using (not public.has_blocked_me(id));

-- Nobody follows across a block, in either direction.
alter policy "Users follow as themselves"
  on public.follows
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked_between(follower_id, followee_id)
  );

-- Likes and comments by the blocker vanish for the person they blocked;
-- comments by the blocked person on the blocker's shows vanish for everyone.
alter policy "Likes are visible with their entry"
  on public.entry_likes
  using (
    (public.entry_is_open(entry_id) or public.owns_entry(entry_id))
    and not public.has_blocked_me(user_id)
  );

alter policy "Comments are visible with their entry"
  on public.entry_comments
  using (
    (public.entry_is_open(entry_id) or public.owns_entry(entry_id))
    and not public.has_blocked_me(user_id)
    and not public.comment_by_blocked(entry_id, user_id)
  );

-- Blocking ends follows both ways and takes back the blocked person's likes.
create function public.apply_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  delete from public.entry_likes l
  using public.entries e
  where l.entry_id = e.id and e.user_id = new.blocker_id and l.user_id = new.blocked_id;
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.apply_block() from public, anon, authenticated;

create trigger blocks_apply
  before insert on public.blocks
  for each row execute function public.apply_block();

-- People search leaves out anyone across a block from the caller.
create or replace function public.search_profiles(q text)
returns table (id uuid, handle text, display_name text, avatar_url text, is_private boolean)
language sql
stable
set search_path = ''
as $$
  select p.id, p.handle::text, p.display_name, p.avatar_url, p.is_private
  from public.profiles p
  where p.handle is not null
    and length(btrim(q)) >= 2
    and not public.is_blocked_between(p.id, (select auth.uid()))
    and (
      p.handle::text ilike replace(replace(lower(btrim(q, ' @')), '%', ''), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(btrim(q), '%', ''), '_', '\_') || '%'
    )
  order by (p.handle::text ilike replace(replace(lower(btrim(q, ' @')), '%', ''), '_', '\_') || '%') desc,
           p.handle
  limit 20;
$$;

-- The caller's blocked accounts, newest first, for Settings → Blocked accounts.
create function public.my_blocks()
returns table (id uuid, handle text, display_name text, avatar_url text, blocked_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.id, p.handle::text, p.display_name, p.avatar_url, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke execute on function public.my_blocks() from public;
grant execute on function public.my_blocks() to authenticated;
