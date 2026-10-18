import { connection } from "next/server";

import type { CardSocial } from "@/components/profile/PublicEntryCard";
import { ENTRY_SELECT, signPhotos, toEntryRow, TRIP_SELECT, type Collection, type EntryRow } from "@/lib/entries";
import { getReactions, listCommentPreviews, NO_REACTIONS } from "@/lib/reactions";
import { createClient } from "@/lib/supabase/server";

// Server-side reads for the owner app. Always scoped to the signed-in user:
// RLS would also return other people's public rows.
//
// connection(): this is live, private data, read per request. It keeps it out
// of the prerendered and session shells, where the Supabase client's own
// Date.now() (token expiry) would also be rejected.
export async function ownerContext() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId };
}

export async function getOwnEntry(id: string) {
  const { supabase, userId } = await ownerContext();
  if (!userId || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("entries").select(ENTRY_SELECT).eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const entry = toEntryRow(data as never);
  const urls = await signPhotos(supabase, [entry.photo_path]);
  return { entry, photoUrl: entry.photo_path ? (urls.get(entry.photo_path) ?? null) : null };
}

// Newest first. Owner-scale (tens to hundreds of entries), so no paging yet.
export async function listOwnEntries() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return { entries: [] as EntryRow[], photos: new Map<string, string>() };
  const { data } = await supabase
    .from("entries")
    .select(ENTRY_SELECT)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  const entries = ((data ?? []) as never[]).map(toEntryRow);
  const photos = await signPhotos(supabase, entries.map((e) => e.photo_path));
  return { entries, photos };
}

// The owner's trips, newest first.
export async function listOwnTrips() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return [] as Collection[];
  const { data } = await supabase
    .from("collections")
    .select(TRIP_SELECT)
    .eq("user_id", userId)
    .eq("kind", "trip")
    .order("start_date", { ascending: false });
  return (data ?? []) as Collection[];
}

// One entry plus what its share cards show: its place in the year, the visit
// number at its venue, how many times the show has been seen, and the handle.
// The counts come from entry_card_stats in Postgres, so iOS shows the same.
export async function getShareCard(id: string) {
  const found = await getOwnEntry(id);
  if (!found) return null;
  const { supabase, userId } = await ownerContext();
  const [{ data: stats }, { data: profile }, reactions] = await Promise.all([
    supabase
      .rpc("entry_card_stats", { entry_id: id })
      .maybeSingle<{ show_of_year: number; venue_visit: number; times_seen: number }>(),
    supabase.from("profiles").select("handle, is_private").eq("id", userId!).maybeSingle(),
    getReactions(supabase, [id]),
  ]);
  return {
    ...found,
    handle: (profile?.handle as string | null) ?? null,
    // Whether /e/[id] shows this entry to everyone (see lib/public-pages).
    isPublic: found.entry.visibility === "public" && found.entry.status === "logged" && profile?.is_private === false,
    // Likes and comments, and whether its page (with the thread) opens for
    // the owner: approved followers of a private profile see it too.
    reactions: reactions.get(id) ?? NO_REACTIONS,
    hasPage: found.entry.visibility === "public" && found.entry.status === "logged",
    showOfYear: stats?.show_of_year ?? 0,
    venueVisit: stats?.venue_visit ?? 0,
    timesSeen: stats?.times_seen ?? 0,
  };
}

export type OwnProfile = {
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  link: string | null;
  avatar_url: string | null;
  is_private: boolean;
};

export async function getOwnProfile() {
  const { supabase, userId } = await ownerContext();
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("handle, display_name, bio, link, avatar_url, is_private")
    .eq("id", userId)
    .maybeSingle<OwnProfile>();
  return data;
}

export type FeedOwner = { id: string; handle: string | null; display_name: string | null; avatar_url: string | null; is_private: boolean };
// `social` is null for your private shows, which take no likes or comments.
export type FeedItem = { entry: EntryRow; owner: FeedOwner; mine: boolean; photoUrl: string | null; social: CardSocial | null };
// Where the next page starts: the last show's date, created_at and id.
export type FeedCursor = { date: string; created: string; id: string };
export type FeedPage = { items: FeedItem[]; next: FeedCursor | null };

export const FEED_SIZE = 20;

type Client = Awaited<ReturnType<typeof ownerContext>>["supabase"];

// One page of the home feed (feed_entries in Postgres, so iOS pages the same
// way): your own shows and the ones RLS lets you see from people you follow,
// newest first, each public one with its latest comments for the inline
// thread. `next` is null on the last page.
export async function readFeedPage(supabase: Client, userId: string, cursor: FeedCursor | null): Promise<FeedPage> {
  const { data: rows, error } = await supabase
    .rpc("feed_entries", {
      max_rows: FEED_SIZE,
      before_date: cursor?.date ?? null,
      before_created: cursor?.created ?? null,
      before_id: cursor?.id ?? null,
    })
    .select(`${ENTRY_SELECT}, user_id, created_at`);
  if (error) {
    console.error("feed_entries failed", error.code, error.message);
    throw new Error("Couldn’t load the feed");
  }
  const raw = (rows ?? []) as unknown as { id: string; date: string; created_at: string; user_id: string }[];
  const ids = [...new Set(raw.map((r) => r.user_id))];
  const { data: owners } = ids.length
    ? await supabase.from("profiles").select("id, handle, display_name, avatar_url, is_private").in("id", ids)
    : { data: [] };
  const byId = new Map(((owners ?? []) as FeedOwner[]).map((o) => [o.id, o]));
  const entries = raw.map((r) => toEntryRow(r as never));
  const open = entries.flatMap((e) => (e.visibility === "public" ? [e.id] : []));
  const [photos, reactions, comments] = await Promise.all([
    signPhotos(supabase, entries.map((e) => e.photo_path)),
    getReactions(supabase, open),
    listCommentPreviews(supabase, open),
  ]);
  const items = raw.flatMap((r, i) => {
    const owner = byId.get(r.user_id);
    const entry = entries[i];
    return owner?.handle
      ? [
          {
            entry,
            owner,
            mine: r.user_id === userId,
            photoUrl: entry.photo_path ? (photos.get(entry.photo_path) ?? null) : null,
            social:
              entry.visibility === "public"
                ? {
                    viewerId: userId,
                    reactions: reactions.get(entry.id) ?? NO_REACTIONS,
                    thread: { ownerId: r.user_id, latest: comments.get(entry.id) ?? [] },
                  }
                : null,
          },
        ]
      : [];
  });
  // The cursor comes from the raw rows, so a show left out above (an owner
  // without a handle) can't stall paging.
  const last = raw.at(-1);
  return { items, next: raw.length === FEED_SIZE && last ? { date: last.date, created: last.created_at, id: last.id } : null };
}

// The first page, plus whether you follow anyone (follows and requests), for
// the empty state. `failed` when the page couldn't be read, so the feed says
// so instead of looking empty.
export async function getFeed() {
  const { supabase, userId } = await ownerContext();
  const empty = { items: [] as FeedItem[], next: null, following: 0, failed: false };
  if (!userId) return empty;
  const [page, { count: following }] = await Promise.all([
    readFeedPage(supabase, userId, null).catch(() => null),
    supabase.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return page ? { ...page, following: following ?? 0, failed: false } : { ...empty, following: following ?? 0, failed: true };
}
