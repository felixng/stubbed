-- Comments inline on the home feed (#87), as on Hevy: each public show in the
-- feed shows its latest few comments under the card, with a box to add one.
-- The full thread still lives on the entry's page.
--
-- One call per page of cards. Security invoker, so the entry_comments and
-- profiles policies decide what comes back: an entry the caller can't see
-- (private, planned, or on a private profile they don't follow) returns no
-- comments, exactly as reading the table directly would.

create function public.entry_comment_previews(entry_ids uuid[], per_entry integer default 2)
returns table (
  id uuid,
  entry_id uuid,
  body text,
  created_at timestamptz,
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.entry_id, c.body, c.created_at, p.id, p.handle::text, p.display_name, p.avatar_url
  from unnest(entry_ids) as e(id)
  cross join lateral (
    select c.id, c.entry_id, c.body, c.created_at, c.user_id
    from public.entry_comments c
    where c.entry_id = e.id
    order by c.created_at desc, c.id desc
    -- A preview, not the thread: at most 10 per entry whatever is asked.
    limit greatest(0, least(per_entry, 10))
  ) c
  join public.profiles p on p.id = c.user_id
  order by c.entry_id, c.created_at, c.id;
$$;

revoke execute on function public.entry_comment_previews(uuid[], integer) from public;
grant execute on function public.entry_comment_previews(uuid[], integer) to anon, authenticated;
