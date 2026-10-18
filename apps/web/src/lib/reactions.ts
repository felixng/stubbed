import type { SupabaseClient } from "@supabase/supabase-js";

import type { FollowPerson } from "@/lib/follows";

// Likes and comments on entries (supabase/migrations/20261014190000_likes_comments.sql).
// Anyone signed in who can see a public entry can like it and comment on it;
// Postgres enforces who, so these reads and the client writes stay thin. The
// reads take either Supabase client: the feed's inline comments use them in
// the browser too.

export type Reactions = { likes: number; comments: number; liked: boolean };
export type Comment = { id: string; body: string; created_at: string; author: FollowPerson };

export const NO_REACTIONS: Reactions = { likes: 0, comments: 0, liked: false };
export const COMMENT_MAX = 500;
// How many of an entry's latest comments show under it in the feed.
export const PREVIEW_COMMENTS = 2;

type Client = SupabaseClient;

const PERSON = "id, handle, display_name, avatar_url";
// A comment with its author, for reads and for a comment just posted.
export const COMMENT_SELECT = `id, body, created_at, author:profiles!entry_comments_user_id_fkey(${PERSON})`;

// Counts for a page of entries, and whether the viewer liked each, in one
// call. Read with the viewer's session so `liked` is theirs.
export async function getReactions(supabase: Client, entryIds: string[]) {
  const map = new Map<string, Reactions>();
  if (entryIds.length === 0) return map;
  const { data } = await supabase.rpc("entry_reactions", { entry_ids: entryIds });
  for (const r of (data ?? []) as ({ entry_id: string } & Reactions)[]) {
    map.set(r.entry_id, { likes: r.likes, comments: r.comments, liked: r.liked });
  }
  return map;
}

// An entry's comments, oldest first, like a conversation.
export async function listComments(supabase: Client, entryId: string): Promise<Comment[]> {
  const { data } = await supabase
    .from("entry_comments")
    .select(COMMENT_SELECT)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as (Omit<Comment, "author"> & { author: FollowPerson | null })[]).flatMap((c) =>
    c.author?.handle ? [{ ...c, author: c.author }] : [],
  );
}

// The latest few comments on each of a page of entries, oldest first, for
// the feed (entry_comment_previews in Postgres, one call per page). RLS
// decides which entries' comments come back.
export async function listCommentPreviews(supabase: Client, entryIds: string[], perEntry = PREVIEW_COMMENTS) {
  const map = new Map<string, Comment[]>();
  if (entryIds.length === 0) return map;
  const { data } = await supabase.rpc("entry_comment_previews", { entry_ids: entryIds, per_entry: perEntry });
  type Row = Omit<Comment, "author"> & Omit<FollowPerson, "id" | "handle"> & { entry_id: string; user_id: string; handle: string | null };
  for (const r of (data ?? []) as Row[]) {
    if (!r.handle) continue;
    const comment = {
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      author: { id: r.user_id, handle: r.handle, display_name: r.display_name, avatar_url: r.avatar_url },
    };
    map.set(r.entry_id, [...(map.get(r.entry_id) ?? []), comment]);
  }
  return map;
}

// The most recent people to like an entry, for "Liked by @a, @b and 3 others".
export async function listLikers(supabase: Client, entryId: string, limit = 3): Promise<FollowPerson[]> {
  const { data } = await supabase
    .from("entry_likes")
    .select(`person:profiles!entry_likes_user_id_fkey(${PERSON})`)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as { person: FollowPerson | null }[]).flatMap((r) =>
    r.person?.handle ? [r.person] : [],
  );
}

// "now", "5m", "3h", "2d", then a date: compact, as on Hevy and Instagram.
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  const date = new Date(iso);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  });
}
