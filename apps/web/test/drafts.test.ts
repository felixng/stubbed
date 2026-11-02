import assert from "node:assert/strict";
import { test } from "node:test";

import { centroid, groupPhotos, mergeReadings, showKey, type Extracted, type Reading } from "@/lib/import/drafts";

const extracted = (over: Partial<Extracted>): Extracted => ({
  show_title: null,
  show_type: null,
  venue_name: null,
  venue_osm_id: null,
  city: null,
  country: null,
  date: null,
  time: null,
  seats: null,
  price: null,
  confidence: "high",
  reason: "",
  ...over,
});

const reading = (ref: string, over: Partial<Extracted>): Reading => ({
  extracted: extracted(over),
  sources: [{ kind: "email", ref, fileName: ref, subject: null, from: null, sent: null, trimmed: false, readBy: null }],
});

test("showKey ignores case, punctuation, accents and a leading article", () => {
  assert.equal(showKey("The Phantom of the Opera"), showKey("phantom of the opera!"));
  assert.equal(showKey("Les Misérables"), "les miserables");
});

test("mergeReadings joins a booking and its reminder, best confidence first", () => {
  const merged = mergeReadings([
    reading("reminder", { show_title: "hadestown", date: "2026-10-10", confidence: "medium", seats: "M104" }),
    reading("booking", { show_title: "Hadestown", date: "2026-10-10", time: "19:00", venue_name: "Walter Kerr Theatre" }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].extracted.show_title, "Hadestown");
  assert.equal(merged[0].extracted.venue_name, "Walter Kerr Theatre");
  assert.equal(merged[0].extracted.seats, "M104"); // gap filled from the other reading
  assert.equal(merged[0].extracted.confidence, "high");
  assert.deepEqual(merged[0].sources.map((s) => s.ref), ["reminder", "booking"]);
});

test("mergeReadings keeps matinee and evening apart, and never merges unknowns", () => {
  const merged = mergeReadings([
    reading("a", { show_title: "Hamilton", date: "2026-10-11", time: "14:00" }),
    reading("b", { show_title: "Hamilton", date: "2026-10-11", time: "19:30" }),
    reading("c", { show_title: "Hamilton", date: null }),
    reading("d", { show_title: "Hamilton", date: null }),
    reading("e", { show_title: "Hamilton", date: "2026-10-12" }),
  ]);
  assert.equal(merged.length, 5);
});

const NYC = { lat: 40.7605, lng: -73.9865 }; // Midtown
const photo = (date: string | null, time: string | null, lat: number | null = NYC.lat, lng: number | null = NYC.lng) => ({ date, time, lat, lng });

test("groupPhotos: same evening and place is one visit", () => {
  const groups = groupPhotos([
    photo("2026-10-10", "21:55"),
    photo("2026-10-10", "19:41", NYC.lat + 0.0005, NYC.lng), // ~55 m away
    photo("2026-10-10", "14:02", NYC.lat + 0.01, NYC.lng), // matinee elsewhere, ~1.1 km
    photo("2026-10-11", "19:30"),
    photo(null, null),
    photo(null, null),
  ]);
  assert.deepEqual(
    groups.map((g) => g.map((p) => p.time)),
    [["14:02"], ["19:41", "21:55"], ["19:30"], [null], [null]],
  );
});

test("groupPhotos: a photo without location joins the visit by time alone", () => {
  const groups = groupPhotos([photo("2026-10-10", "19:40"), photo("2026-10-10", "19:45", null, null)]);
  assert.equal(groups.length, 1);
  assert.deepEqual(centroid(groups[0]), NYC);
});

test("groupPhotos: hours apart on the same day is two visits", () => {
  assert.equal(groupPhotos([photo("2026-10-10", "13:00"), photo("2026-10-10", "19:30")]).length, 2);
});

test("visitAccuracy: the worst located photo, unknown if any is unknown", async () => {
  const { visitAccuracy } = await import("@/lib/import/drafts");
  const at = (accuracy_m: number | null, lat: number | null = NYC.lat) => ({ date: null, time: null, lat, lng: lat == null ? null : NYC.lng, accuracy_m });
  assert.equal(visitAccuracy([at(8), at(20)]), 20);
  assert.equal(visitAccuracy([at(8), at(null)]), null);
  assert.equal(visitAccuracy([at(8), at(null, null)]), 8); // unlocated photos don't count
  assert.equal(visitAccuracy([at(null, null)]), null);
});
