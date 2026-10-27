import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Follows (supabase/migrations/20261014160000_follows.sql). Postgres sets the
// status: following a public profile is accepted at once, a private one sends
// a request its owner approves. Either side ends a follow by deleting the row.

export type FollowStatus = "pending" | "accepted";
export type FollowCounts = { followers: number; following: number };
export type FollowPerson = { id: string; handle: string; display_name: string | null; avatar_url: string | null };

// Who is looking at a profile, and how they relate to it: signed out (null),
// the owner, or someone else with their follow status (null if none) and
// whether they've blocked the profile (supabase/migrations/…_blocks.sql).
export type Viewer = { id: string; isOwner: boolean; status: FollowStatus | null; blocked?: boolean };

const PERSON = "id, handle, display_name, avatar_url";

// The signed-in visitor on a public page, from the session cookie (the proxy
// refreshes it on /@handle). The client reads as anon when signed out, so
// RLS gives each viewer exactly what they may see.
export async function viewerContext() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId };
}

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getViewer(supabase: Client, userId: string | null, profileId: string): Promise<Viewer | null> {
  if (!userId) return null;
  if (userId === profileId) return { id: userId, isOwner: true, status: null };
  const [{ data }, { data: block }] = await Promise.all([
    supabase
      .from("follows")
      .select("status")
      .eq("follower_id", userId)
      .eq("followee_id", profileId)
      .maybeSingle<{ status: FollowStatus }>(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).eq("blocked_id", profileId).maybeSingle(),
  ]);
  return { id: userId, isOwner: false, status: data?.status ?? null, blocked: Boolean(block) };
}

// True when the profile's owner has blocked the signed-in viewer. Public
// pages read through the publishable key, which can't see that, so they ask
// with the viewer's session and show a 404, as the app does.
export async function hasBlockedMe(supabase: Client, userId: string | null, profileId: string): Promise<boolean> {
  if (!userId || userId === profileId) return false;
  const { data } = await supabase.rpc("has_blocked_me", { profile_id: profileId });
  return data === true;
}

export async function getFollowCounts(supabase: Client, profileId: string): Promise<FollowCounts> {
  const { data } = await supabase.rpc("follow_counts", { profile_id: profileId }).single<FollowCounts>();
  return data ?? { followers: 0, following: 0 };
}

// A profile's followers or the people it follows, newest follow first.
// Accepted follows only. Empty when RLS hides them (a private profile the
// viewer doesn't follow), so check profile_is_visible first to tell the two
// apart.
export async function listFollows(supabase: Client, profileId: string, list: "followers" | "following") {
  const [mine, theirs] = list === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
  const { data } = await supabase
    .from("follows")
    .select(`person:profiles!follows_${theirs}_fkey(${PERSON})`)
    .eq(mine, profileId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as { person: FollowPerson | null }[]).flatMap((r) =>
    r.person?.handle ? [r.person] : [],
  );
}

// Requests waiting for the signed-in user's approval, oldest first.
export async function listFollowRequests(supabase: Client, userId: string) {
  const { data } = await supabase
    .from("follows")
    .select(`person:profiles!follows_follower_id_fkey(${PERSON})`)
    .eq("followee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as { person: FollowPerson | null }[]).flatMap((r) =>
    r.person?.handle ? [r.person] : [],
  );
}
