// The shape every import source produces, and the pure steps between
// "what we read" and the review screen (#17, #18): grouping photos from the
// same visit, and merging duplicate sightings of one booking (a confirmation
// plus its reminder email, say). No React or Supabase here, so the web
// review screen, a future mobile flow and the unit tests share it.
import type { ShowType } from "@/lib/entries";
import { distanceMeters } from "@/lib/places";

export type Confidence = "high" | "medium" | "low";

// Where a photo was taken, or where a venue added by hand is.
export type Place = { city: string | null; country: string | null };

// One show as a source described it, before matching to the catalogue.
export type Extracted = {
  show_title: string | null;
  show_type: ShowType | null;
  venue_name: string | null;
  // Only from photo identification, and only from the nearby-theatre list.
  venue_osm_id: string | null;
  city: string | null;
  country: string | null;
  date: string | null; // "2026-10-10"
  time: string | null; // "19:30"
  seats: string | null; // "Orch M 104, 105"
  price: string | null; // "$289.00 total"
  confidence: Confidence;
  reason: string;
};

export type EmailSource = {
  kind: "email";
  ref: string;
  fileName: string;
  subject: string | null;
  from: string | null;
  sent: string | null;
  trimmed: boolean;
  // Which model read it, e.g. "groq:meta-llama/…".
  readBy: string | null;
};

export type PhotoSource = {
  kind: "photo";
  ref: string;
  fileName: string;
  previewUrl: string;
  date: string | null;
  time: string | null;
  hasLocation: boolean;
  readBy: string | null;
};

export type SourceRef = EmailSource | PhotoSource;

export type Reading = { extracted: Extracted; sources: SourceRef[] };

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

// "The Phantom of the Opera" and "Phantom Of The Opera!" are one show.
export function showKey(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Merges readings of the same show on the same date (and time, when both
// know it). The most confident reading wins each field; the others fill its
// gaps. Readings missing a title or date are never merged: there's nothing
// safe to match them on.
export function mergeReadings(readings: Reading[]): Reading[] {
  const out: Reading[] = [];
  for (const r of readings) {
    const e = r.extracted;
    const same =
      e.show_title && e.date
        ? out.find(
            (o) =>
              o.extracted.show_title &&
              showKey(o.extracted.show_title) === showKey(e.show_title!) &&
              o.extracted.date === e.date &&
              (!o.extracted.time || !e.time || o.extracted.time === e.time),
          )
        : undefined;
    if (!same) {
      out.push({ extracted: { ...e }, sources: [...r.sources] });
      continue;
    }
    const [best, other] = RANK[e.confidence] > RANK[same.extracted.confidence] ? [e, same.extracted] : [same.extracted, e];
    const merged = { ...best };
    for (const k of Object.keys(merged) as (keyof Extracted)[]) {
      if (merged[k] == null && other[k] != null) (merged as Record<string, unknown>)[k] = other[k];
    }
    same.extracted = merged;
    same.sources.push(...r.sources.filter((s) => !same.sources.some((x) => x.ref === s.ref)));
  }
  return out;
}

export type PhotoPoint = { date: string | null; time: string | null; lat: number | null; lng: number | null };

// Photos within this distance and time of each other count as one visit.
export const SAME_VISIT_M = 250;
export const SAME_VISIT_MINUTES = 5 * 60;

const minutes = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

// Groups photos from the same visit (same date, within a few hours, and
// close together when both have a location), so a stage shot and a Playbill
// from one evening become one draft and one Claude call. Photos with no date
// stay on their own. Groups come back in time order.
export function groupPhotos<T extends PhotoPoint>(photos: T[]): T[][] {
  const sorted = [...photos].sort((a, b) =>
    `${a.date ?? "9999"} ${a.time ?? "99:99"}`.localeCompare(`${b.date ?? "9999"} ${b.time ?? "99:99"}`),
  );
  const groups: T[][] = [];
  for (const p of sorted) {
    const group = p.date
      ? groups.find((g) => {
          if (g[0].date !== p.date) return false;
          const last = g[g.length - 1];
          const [a, b] = [minutes(last.time), minutes(p.time)];
          if (a != null && b != null && Math.abs(b - a) > SAME_VISIT_MINUTES) return false;
          // Compare against every located photo in the group, so a chain of
          // nearby shots can't drift down the street.
          return g.every(
            (q) => q.lat == null || q.lng == null || p.lat == null || p.lng == null || distanceMeters(q.lat, q.lng, p.lat, p.lng) <= SAME_VISIT_M,
          );
        })
      : undefined;
    if (group) group.push(p);
    else groups.push([p]);
  }
  return groups;
}

// The GPS accuracy to trust for a group of photos: the worst among its
// located photos, or unknown if any of them didn't record one, so a group
// never gets a tighter search circle than its least reliable photo.
export function visitAccuracy(points: (PhotoPoint & { accuracy_m?: number | null })[]): number | null {
  const located = points.filter((p) => p.lat != null && p.lng != null);
  if (!located.length || located.some((p) => p.accuracy_m == null)) return null;
  return Math.max(...located.map((p) => p.accuracy_m!));
}

// Average location of a group's located photos.
export function centroid(points: PhotoPoint[]): { lat: number; lng: number } | null {
  const located = points.filter((p): p is PhotoPoint & { lat: number; lng: number } => p.lat != null && p.lng != null);
  if (!located.length) return null;
  return {
    lat: located.reduce((s, p) => s + p.lat, 0) / located.length,
    lng: located.reduce((s, p) => s + p.lng, 0) / located.length,
  };
}

// Photos sent in one identify call: enough clues, still quick and cheap.
export const MAX_IDENTIFY_PHOTOS = 4;

// Up to `max` photos spread across the group, for identification: the first
// and last shots of an evening (set before curtain-up, curtain call) and a
// few in between usually carry the most clues.
export function pickSpread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max === 1) return [items[0]];
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

// What a ticked draft still needs before it can be saved. "place": a venue
// added by hand needs its city and country.
export type MissingField = "show" | "venue" | "place" | "date";

export function missingFields(d: {
  show: unknown;
  venue: { id?: string | null; osm_id?: string | null; city?: string | null; country?: string | null } | null;
  date: string;
}): MissingField[] {
  const out: MissingField[] = [];
  if (!d.show) out.push("show");
  if (!d.venue) out.push("venue");
  else if (!d.venue.id && !d.venue.osm_id && (!d.venue.city?.trim() || !d.venue.country?.trim())) out.push("place");
  if (!d.date) out.push("date");
  return out;
}

const NEEDS: Record<MissingField, string> = { show: "a show", venue: "a venue", place: "the venue’s city and country", date: "a date" };

// "a show and a venue", for the review screen.
export function describeMissing(fields: MissingField[]): string {
  const parts = fields.map((f) => NEEDS[f]);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
}
