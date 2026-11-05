import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueChoice } from "@/lib/entries";
import type { Draft } from "@/components/app/import/DraftCard";
import { isCountryCode } from "./countries";
import type { Extracted } from "./drafts";
import { mezzanineDay, type MezzanineRow } from "./mezzanine";
import { resolveShow, resolveVenue, runPool } from "./resolve";

export type MezzanineDraft = Draft & { invalidRating: boolean; planned: boolean; duplicate: boolean };
export const normaliseImportName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
export const duplicateKey = (show: string, date: string) => `${show}\u001f${date}`;
export function isMezzanineDuplicate(show: string | undefined, date: string, existing: Set<string>): boolean {
  return !!show && !!date && existing.has(duplicateKey(show, date));
}
export function mezzanineMissing(d: MezzanineDraft): string[] {
  const out: string[] = [];
  if (!d.show?.title.trim()) out.push("show");
  if (!d.venue?.name.trim()) out.push("venue");
  if (d.venue && !d.venue.id) {
    if (!d.venue.city?.trim()) out.push("city");
    if (!d.venue.country || !isCountryCode(d.venue.country)) out.push("country");
  }
  if (!mezzanineDay(d.date)) out.push("date");
  if (d.invalidRating) out.push("rating");
  return out;
}
export async function existingMezzanineKeys(client: SupabaseClient, userId: string, shows: string[], before: string): Promise<Set<string>> {
  const keys = new Set<string>(); const ids = [...new Set(shows)].sort();
  for (let start = 0; start < ids.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("entries").select("show_id,date").eq("user_id", userId)
        .in("show_id", ids.slice(start, start + 100)).lte("created_at", before)
        .order("id").range(offset, offset + 499);
      if (error) throw error;
      for (const row of data ?? []) keys.add(duplicateKey(row.show_id, row.date));
      if ((data?.length ?? 0) < 500) break;
    }
  }
  return keys;
}
export async function resolveMezzanine(client: SupabaseClient, userId: string, rows: MezzanineRow[], before: string,
  progress: (done: number, total: number) => void): Promise<{ drafts: MezzanineDraft[]; existing: Set<string> }> {
  const extracted = (row: MezzanineRow): Extracted => ({ show_title: row.show || null, show_type: null,
    venue_name: row.venue || null, venue_osm_id: null, city: row.city || null, country: null,
    date: row.date, time: null, seats: null, price: null, confidence: "high", reason: "Mezzanine export" });
  const shows = new Map<string, Draft["show"]>(); const venues = new Map<string, Draft["venue"]>();
  const jobs: (() => Promise<void>)[] = []; const scheduled = new Set<string>();
  for (const row of rows) {
    const sk = normaliseImportName(row.show), vk = normaliseImportName(row.venue) + "\u001f" + normaliseImportName(row.city);
    if (sk && !scheduled.has("s" + sk)) {
      scheduled.add("s" + sk); jobs.push(async () => { shows.set(sk, await resolveShow(client, extracted(row), true)); });
    }
    if (row.venue && !scheduled.has("v" + vk)) {
      scheduled.add("v" + vk); jobs.push(async () => { venues.set(vk, await resolveVenue(client, extracted(row), [], { city: null, country: null }, true)); });
    }
  }
  // Each job makes one request at a time, including title tidying.
  let done = 0;
  await runPool(jobs, 3, async (job) => { await job(); progress(++done, jobs.length); });
  const existing = await existingMezzanineKeys(client, userId, [...shows.values()].flatMap((s) => s?.id ? [s.id] : []), before);
  const drafts = rows.map((row): MezzanineDraft => {
    const show = shows.get(normaliseImportName(row.show)) ?? null;
    const venue = venues.get(normaliseImportName(row.venue) + "\u001f" + normaliseImportName(row.city)) ?? null;
    const draft: MezzanineDraft = { key: crypto.randomUUID(), reading: { extracted: extracted(row), sources: [] },
      show, venue, date: row.date ?? "", rating: row.rating, note: row.review, include: false, suggestion: null,
      nearby: [], place: { city: null, country: null }, photos: [], photoIndex: null, status: "ready",
      invalidRating: row.invalidRating, planned: row.planned, duplicate: isMezzanineDuplicate(show?.id, row.date ?? "", existing) };
    draft.include = !draft.duplicate && mezzanineMissing(draft).length === 0;
    return draft;
  });
  return { drafts, existing };
}

// Canonicalise only after country is known, before saveDraft's venue comparison.
export async function canonicalMezzanineVenue(client: SupabaseClient, venue: VenueChoice, cache: Map<string, string>): Promise<VenueChoice> {
  if (venue.id || !venue.city || !venue.country) return venue;
  const key = normaliseImportName(venue.city) + "\u001f" + venue.country;
  if (!cache.has(key)) {
    const { data, error } = await client.rpc("canonical_city", { city: venue.city, country: venue.country });
    if (error) throw error;
    cache.set(key, typeof data === "string" ? data : venue.city);
  }
  return { ...venue, city: cache.get(key)! };
}
