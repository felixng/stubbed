import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { cache } from "react";

import { ENTRY_SELECT, signPhotos, toEntryRow, TRIP_SELECT, tripNights, type Collection, type EntryRow } from "@/lib/entries";
import { viewerContext } from "@/lib/follows";
import { createPublicClient } from "@/lib/supabase/public";

// Reads for the public entry page (/e/[id]) and trip page (/t/[id]), and
// their link-preview images. Like /@handle, everything goes through the
// publishable key with no session, so RLS decides: a private entry, a planned
// one, a trip with no public show, or anything on a private profile simply
// isn't returned, even to its owner. The entry page alone also tries the
// viewer's session (getEntryForViewer), for approved followers.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicOwner = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
};

const OWNER_SELECT = "id, handle, display_name, avatar_url";

type Owned = { user_id: string; updated_at: string };

export type PublicEntry = {
  entry: EntryRow;
  owner: PublicOwner;
  photoUrl: string | null;
  // Changes whenever the entry is edited; busts the preview image's cache.
  version: string;
};

// Null when there's no such public entry. Cached per request, so the page,
// its metadata and the preview image route each read once.
export const getPublicEntry = cache(async (id: string): Promise<PublicEntry | null> => {
  // Per request, so an entry made private disappears straight away.
  await connection();
  if (!UUID.test(id)) return null;
  return readEntry(createPublicClient(), id);
});

export type ViewedEntry = PublicEntry & {
  // False when only the viewer's session can see it (an approved follower of
  // a private profile, or its owner): no preview image, not indexed.
  listed: boolean;
  viewerId: string | null;
  // The viewer's session (anon when signed out), for likes and comments.
  supabase: Awaited<ReturnType<typeof viewerContext>>["supabase"];
};

// The entry page: what everyone sees, or failing that, what the signed-in
// viewer may see. RLS decides either way, so this adds approved followers of
// a private profile (who can like and comment there) and nobody else.
export const getEntryForViewer = cache(async (id: string): Promise<ViewedEntry | null> => {
  const [listed, { supabase, userId }] = await Promise.all([getPublicEntry(id), viewerContext()]);
  const found = listed ?? (userId && UUID.test(id) ? await readEntry(supabase, id) : null);
  if (!found) return null;
  return { ...found, listed: Boolean(listed), viewerId: userId, supabase };
});

async function readEntry(supabase: SupabaseClient, id: string): Promise<PublicEntry | null> {
  const { data: raw } = await supabase
    .from("entries")
    .select(`${ENTRY_SELECT}, user_id, updated_at`)
    .eq("id", id)
    .eq("visibility", "public")
    .eq("status", "logged")
    .maybeSingle();
  if (!raw) return null;
  const row = raw as unknown as Owned;
  const { data: owner } = await supabase
    .from("profiles")
    .select(OWNER_SELECT)
    .eq("id", row.user_id)
    .maybeSingle<PublicOwner>();
  // Every profile with public entries has a handle (set at /welcome).
  if (!owner?.handle) return null;
  const entry = toEntryRow(raw as never);
  const photos = await signPhotos(supabase, [entry.photo_path]);
  return {
    entry,
    owner,
    photoUrl: entry.photo_path ? (photos.get(entry.photo_path) ?? null) : null,
    version: versionOf(row.updated_at),
  };
}

export type TripStats = {
  shows: number;
  venues: number;
  nights: number;
  cities: string[];
  average: number | null;
};

export type PublicTrip = {
  trip: Collection;
  owner: PublicOwner;
  // Its public shows, oldest first, like an itinerary.
  entries: EntryRow[];
  photos: Map<string, string>;
  stats: TripStats;
  version: string;
};

// Null when the trip isn't public (no public show in it, or a private
// profile). Private shows in a public trip are left out, and so are their
// counts: RLS returns only public links and entries.
export const getPublicTrip = cache(async (id: string): Promise<PublicTrip | null> => {
  await connection();
  if (!UUID.test(id)) return null;
  const supabase = createPublicClient();
  const { data: rawTrip } = await supabase
    .from("collections")
    .select(`${TRIP_SELECT}, user_id`)
    .eq("id", id)
    .eq("kind", "trip")
    .maybeSingle();
  if (!rawTrip) return null;
  const tripRow = rawTrip as unknown as Collection & { user_id: string };

  const [{ data: owner }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select(OWNER_SELECT).eq("id", tripRow.user_id).maybeSingle<PublicOwner>(),
    supabase
      .from("entries")
      .select(`${ENTRY_SELECT}, updated_at, in_trip:entry_collections!inner(collection_id)`)
      .eq("in_trip.collection_id", id)
      .eq("visibility", "public")
      .eq("status", "logged")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (!owner?.handle || !rows?.length) return null;

  const entries = (rows as never[]).map(toEntryRow);
  const photos = await signPhotos(supabase, entries.map((e) => e.photo_path));
  const cities = [...new Set(entries.flatMap((e) => (e.venue?.city?.trim() ? [e.venue.city.trim()] : [])))];
  const rated = entries.flatMap((e) => (e.rating != null ? [e.rating] : []));

  return {
    trip: { id: tripRow.id, name: tripRow.name, kind: "trip", start_date: tripRow.start_date, end_date: tripRow.end_date },
    owner,
    entries,
    photos,
    stats: {
      shows: entries.length,
      venues: new Set(entries.flatMap((e) => (e.venue ? [e.venue.id] : []))).size,
      nights: tripNights(tripRow), // the trip's length from its dates, as on the trip page
      cities,
      average: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    },
    // Collections have no updated_at, so this hashes what the preview shows:
    // the trip's name and dates, and which shows are in it, as last edited.
    version: hash(
      [tripRow.name, tripRow.start_date, tripRow.end_date, ...(rows as unknown as (Owned & { id: string })[]).map((r) => `${r.id}@${r.updated_at}`)].join("|"),
    ),
  };
});

// "2026-10-14T09:30:12.345+00:00" → a short, URL-safe token.
function versionOf(timestamp: string) {
  return Date.parse(timestamp).toString(36);
}

// FNV-1a, 32-bit: a short, stable token for a string. Not for security.
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
