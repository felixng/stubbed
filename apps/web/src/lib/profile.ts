import { connection } from "next/server";
import { cache } from "react";

import { ENTRY_SELECT, signPhotos, toEntryRow, type EntryRow } from "@/lib/entries";
import { getFollowCounts, getViewer, hasBlockedMe, viewerContext } from "@/lib/follows";
import { HANDLE_PATTERN } from "@/lib/profile-handle";
import { getReactions, type Reactions } from "@/lib/reactions";
import { createPublicClient } from "@/lib/supabase/public";


export type PublicProfile = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  link: string | null;
  is_private: boolean;
};

export type ProfileStats = { shows: number; venues: number; cities: number };

// Everything /@handle shows: the profile, its follow counts, who is looking
// (for the Follow button), its stats and its public entries newest first,
// with their likes and comments.
// Entries are read as a logged-out visitor would, so the owner sees what
// everyone sees, except by an approved follower of a private profile, who
// reads with their own session so RLS lets them in. A private profile anyone
// else looks at comes back with no stats and no entries. Null when no profile
// has that handle. Cached per request, so the page and its metadata share one
// read.
export const getPublicProfile = cache(async (rawHandle: string) => {
  // Live data, read per request, so a newly private entry disappears at once.
  await connection();
  const handle = rawHandle.toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) return null;

  const publicClient = createPublicClient();
  const { data: profile } = await publicClient
    .from("profiles")
    .select("id, handle, display_name, avatar_url, bio, link, is_private")
    .eq("handle", handle)
    .maybeSingle<PublicProfile>();
  if (!profile) return null;

  const { supabase: session, userId } = await viewerContext();
  const [viewer, follows, blockedMe] = await Promise.all([
    getViewer(session, userId, profile.id),
    getFollowCounts(publicClient, profile.id),
    hasBlockedMe(session, userId, profile.id),
  ]);
  // Someone who blocked the viewer doesn't exist for them.
  if (blockedMe) return null;
  const approved = profile.is_private && viewer?.status === "accepted";

  // A private profile shows its header only, unless the viewer is approved.
  // RLS would return no entries anyway; this skips asking. A profile the
  // viewer has blocked shows its header too, with Unblock.
  if ((profile.is_private && !approved) || viewer?.blocked) {
    return {
      profile,
      viewer,
      follows,
      stats: null,
      entries: [] as EntryRow[],
      photos: new Map<string, string>(),
      reactions: new Map<string, Reactions>(),
    };
  }

  // Owner-scale (tens to hundreds of entries), so no paging yet. The explicit
  // visibility and status filters match what RLS already enforces for anyone
  // but the owner.
  const supabase = approved ? session : publicClient;
  const [{ data: rows }, { data: stats }] = await Promise.all([
    supabase
      .from("entries")
      .select(ENTRY_SELECT)
      .eq("user_id", profile.id)
      .eq("visibility", "public")
      .eq("status", "logged")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.rpc("public_profile_stats", { profile_id: profile.id }).single<ProfileStats>(),
  ]);
  const entries: EntryRow[] = ((rows ?? []) as never[]).map(toEntryRow);
  // Reactions with the viewer's session, so each card knows if they liked it.
  const [photos, reactions] = await Promise.all([
    signPhotos(supabase, entries.map((e) => e.photo_path)),
    getReactions(session, entries.map((e) => e.id)),
  ]);

  return {
    profile,
    viewer,
    follows,
    stats: (stats ?? { shows: 0, venues: 0, cities: 0 }) as ProfileStats | null,
    entries,
    photos,
    reactions,
  };
});
