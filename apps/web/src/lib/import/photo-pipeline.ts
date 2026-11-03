// The photo steps shared by the log form (#14) and batch import (#18), on
// the device: read EXIF and make clean JPEG copies, find theatres near where
// the photo was taken. Each step is best effort; a failure leaves its part blank for the user to fill in.
import type { NearbyVenue } from "@/lib/entries";
import { readPhotoMeta, reencodeJpeg, STORED_PHOTO_EDGE, type PhotoMeta } from "@/lib/photo";
import { nearbyRadius, type NearbyPlaces } from "@/lib/places";
import { createClient } from "@/lib/supabase/client";
import type { Place } from "./drafts";

export type { Place };

export type PreparedPhoto = {
  meta: PhotoMeta;
  // 1600px, no metadata: what gets uploaded with the entry.
  stored: Blob;
};

// Throws when the browser can't decode the file (e.g. HEIC outside Safari).
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const [meta, stored] = await Promise.all([readPhotoMeta(file), reencodeJpeg(file, STORED_PHOTO_EDGE)]);
  return { meta, stored };
}

type NearbyRow = Omit<NearbyVenue, "distance_m"> & { distance_m: number };

// Saved venues within the radius, nearest first: one database call, and found
// even when the OpenStreetMap lookups are down. The rule lives in Postgres.
async function savedVenuesNear(lat: number, lng: number, radius: number): Promise<NearbyVenue[]> {
  const { data } = await createClient().rpc("nearby_venues", { lat, lng, radius_m: radius });
  return ((data as NearbyRow[] | null) ?? []).slice(0, 8);
}

async function osmNearby(lat: number, lng: number, accuracy_m: number | null): Promise<NearbyPlaces | null> {
  return fetch("/api/photo/nearby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, accuracy_m }),
    // Give up after a few seconds.
    signal: AbortSignal.timeout(6_000),
  })
    .then((res) => (res.ok ? (res.json() as Promise<NearbyPlaces>) : null))
    // Offline or the lookup failed: the form carries on without suggestions.
    .catch(() => null);
}

// Theatres near a point: saved venues first. If any is in range, that's the
// answer (city and country from the nearest) and OpenStreetMap isn't asked.
// Only when none is saved nearby does the server's OpenStreetMap lookup run.
// `accuracy_m`: the photo's stated GPS accuracy, which sets the radius.
export async function lookupNearby(
  lat: number,
  lng: number,
  accuracy_m: number | null = null,
  sources: {
    saved?: typeof savedVenuesNear;
    osm?: typeof osmNearby;
  } = {},
): Promise<{ candidates: NearbyVenue[]; place: Place }> {
  const radius = nearbyRadius(accuracy_m);
  const saved = await (sources.saved ?? savedVenuesNear)(lat, lng, radius).catch(() => [] as NearbyVenue[]);
  if (saved.length > 0) {
    return { candidates: saved, place: { city: saved[0].city ?? null, country: saved[0].country ?? null } };
  }
  const found = await (sources.osm ?? osmNearby)(lat, lng, accuracy_m);
  const candidates: NearbyVenue[] = (found?.candidates ?? []).map((c) => ({
    name: c.name,
    city: c.city,
    country: c.country,
    lat: c.lat,
    lng: c.lng,
    osm_id: c.osm_id,
    distance_m: c.distance_m,
  }));
  return { candidates: candidates.slice(0, 8), place: { city: found?.city ?? null, country: found?.country ?? null } };
}
