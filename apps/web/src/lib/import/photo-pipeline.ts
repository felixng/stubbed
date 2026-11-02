// The photo steps shared by the log form (#14) and batch import (#18), on
// the device: read EXIF and make clean JPEG copies, find theatres near where
// the photo was taken. Each step is best effort; a failure leaves its part blank for the user to fill in.
import type { NearbyVenue, Venue } from "@/lib/entries";
import { readPhotoMeta, reencodeJpeg, STORED_PHOTO_EDGE, type PhotoMeta } from "@/lib/photo";
import { distanceMeters, nearbyRadius, type NearbyPlaces } from "@/lib/places";
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

// Saved venues within the nearby radius of a point: instant, and found even
// when the OpenStreetMap lookups are down.
async function savedVenuesNear(lat: number, lng: number, radius: number): Promise<NearbyVenue[]> {
  const dLat = radius / 111_320;
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const { data } = await createClient()
    .from("venues")
    .select("id, name, city, country, lat, lng, osm_id")
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lng", lng - dLng)
    .lte("lng", lng + dLng)
    .limit(20);
  return ((data as Venue[] | null) ?? [])
    .map((v) => ({ ...v, distance_m: Math.round(distanceMeters(lat, lng, v.lat!, v.lng!)) }))
    .filter((v) => v.distance_m <= radius);
}

// Theatres near a point: the server's OpenStreetMap lookup and the saved
// venues nearby, side by side, merged (a saved venue replaces its OSM twin).
// `accuracy_m`: the photo's stated GPS accuracy, which sets the radius.
export async function lookupNearby(
  lat: number,
  lng: number,
  accuracy_m: number | null = null,
): Promise<{ candidates: NearbyVenue[]; place: Place }> {
  const radius = nearbyRadius(accuracy_m);
  const [found, saved] = await Promise.all([
    fetch("/api/photo/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, accuracy_m }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<NearbyPlaces>) : null))
      // Offline or the lookup failed: carry on with saved venues only.
      .catch(() => null),
    savedVenuesNear(lat, lng, radius).catch(() => [] as NearbyVenue[]),
  ]);
  const candidates: NearbyVenue[] = (found?.candidates ?? []).map((c) => {
    const row = saved.find((v) => v.osm_id === c.osm_id);
    return row
      ? { ...row, distance_m: c.distance_m }
      : { name: c.name, city: c.city, country: c.country, lat: c.lat, lng: c.lng, osm_id: c.osm_id, distance_m: c.distance_m };
  });
  for (const v of saved) if (!candidates.some((c) => c.id === v.id)) candidates.push(v);
  candidates.sort((a, b) => a.distance_m - b.distance_m);
  const fallback = saved[0];
  return {
    candidates: candidates.slice(0, 8),
    place: { city: found?.city ?? fallback?.city ?? null, country: found?.country ?? fallback?.country ?? null },
  };
}
