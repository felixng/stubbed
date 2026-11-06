// From "what a source said" to form values, and from confirmed drafts to
// entries (#17, #18). Works with the browser Supabase client; every rule is
// still enforced by RLS and constraints.
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asVenue,
  ensureShow,
  ensureVenue,
  localToday,
  PHOTO_BUCKET,
  photoPath,
  statusFor,
  type NearbyVenue,
  similarShows,
  similarVenues,
  tidyShowTitle,
  type NewShow,
  type Show,
  type VenueChoice,
} from "@/lib/entries";
import type { Extracted, Place } from "./drafts";

// The same existing show ("LES MIS - Dress Circle" is Les Misérables), or a
// new one with a tidied title; the draft card then offers close matches (#146).
export async function resolveShow(supabase: SupabaseClient, e: Extracted, sequential = false): Promise<Show | NewShow | null> {
  if (!e.show_title) return null;
  const [similar, title] = sequential
    ? [await similarShows(supabase, e.show_title, true), await tidyShowTitle(supabase, e.show_title, true)]
    : await Promise.all([similarShows(supabase, e.show_title), tidyShowTitle(supabase, e.show_title)]);
  const same = similar.find((s) => s.same);
  return same ? { id: same.id, title: same.title, type: same.type } : { title, type: e.show_type ?? "musical" };
}

// A nearby theatre the source picked, then the same venue already in the
// catalogue (near the photo, or in the same city), then a new venue. A lone
// nearby theatre wins when the source named none.
export async function resolveVenue(
  supabase: SupabaseClient,
  e: Extracted,
  nearby: NearbyVenue[],
  place: Place,
  strict = false,
): Promise<VenueChoice | null> {
  const picked = nearby.find((c) => c.osm_id && c.osm_id === e.venue_osm_id);
  if (picked) return picked;
  if (!e.venue_name) return nearby.length === 1 ? nearby[0] : null;
  const name = e.venue_name.toLowerCase();
  const byName = nearby.find((c) => c.name.toLowerCase() === name);
  if (byName) return byName;
  const near = nearby[0]?.lat != null && nearby[0]?.lng != null ? { lat: nearby[0].lat, lng: nearby[0].lng } : null;
  const city = e.city ?? place.city;
  const same = (await similarVenues(supabase, e.venue_name, near, city, strict)).find((v) => v.same);
  if (same) return asVenue(same);
  return { name: e.venue_name, city, country: e.country ?? place.country };
}

export type ConfirmedDraft = {
  show: Show | NewShow;
  venue: VenueChoice;
  date: string;
  rating: number | null;
  note: string | null;
  collectionIds: string[];
  // The clean 1600px copy to attach, if any.
  photo: Blob | null;
  // The title an email used, kept as a nickname when it was mapped to an
  // existing show (#35). The database skips titles search already finds.
  alias?: string | null;
};

export class SaveError extends Error {
  readonly step: string;
  constructor(step: string, detail: string) {
    super(`Couldn’t save the ${step}: ${detail}`);
    this.step = step;
  }
}

// Same order as the log form: catalogue rows, the entry, its trips, then the
// photo, so a failed upload never loses the entry. Visibility is left to the
// database default (the owner's profile setting). A ticket for a date after
// today is saved as an upcoming (planned) show, without a rating.
export async function saveDraft(
  supabase: SupabaseClient,
  userId: string,
  draft: ConfirmedDraft,
  retryId?: string,
): Promise<{ id: string; photoFailed: boolean }> {
  const id = retryId ?? crypto.randomUUID();
  let step = "show";
  try {
    const showId = await ensureShow(supabase, draft.show);
    step = "venue";
    const venueId = await ensureVenue(supabase, draft.venue);
    step = "entry";
    const planned = statusFor(draft.date, localToday()) === "planned";
    const fields = {
      id,
      show_id: showId,
      venue_id: venueId,
      date: draft.date,
      status: planned ? "planned" : "logged",
      rating: planned ? null : draft.rating,
      note: draft.note?.trim() || null,
    };
    const table = supabase.from("entries");
    // File imports retain their row id across retries, including a lost response.
    const { error: write } = await (retryId ? table.upsert(fields) : table.insert(fields));
    if (write) throw write;
    step = "trips";
    if (draft.collectionIds.length) {
      const { error: link } = await supabase
        .from("entry_collections")
        .insert(draft.collectionIds.map((collection_id) => ({ entry_id: id, collection_id })));
      if (link) throw link;
    }
  } catch (err) {
    const detail = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    throw new SaveError(step, detail);
  }

  if (draft.alias && draft.show.id) {
    await supabase.rpc("remember_show_alias", { show_id: draft.show.id, alias: draft.alias });
  }

  let photoFailed = false;
  if (draft.photo) {
    const path = photoPath(userId, id);
    const { error: upload } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, draft.photo, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
    const { error: link } = upload
      ? { error: upload }
      : await supabase.from("entries").update({ photo_path: path }).eq("id", id);
    if (link) {
      console.error("Saving the photo failed", link);
      photoFailed = true;
    }
  }
  return { id, photoFailed };
}

// Runs `fn` over `items`, at most `limit` at a time, in order of start.
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
