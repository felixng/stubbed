import assert from "node:assert/strict";
import { test } from "node:test";

import { describeMissing, missingFields } from "@/lib/import/drafts";

const venue = { id: "v1", city: "London", country: "GB" };

test("lists each missing field", () => {
  assert.deepEqual(missingFields({ show: null, venue: null, date: "" }), ["show", "venue", "date"]);
  assert.deepEqual(missingFields({ show: { title: "Hadestown" }, venue, date: "2026-10-10" }), []);
  assert.deepEqual(missingFields({ show: { title: "Hadestown" }, venue: null, date: "2026-10-10" }), ["venue"]);
});

test("a venue added by hand needs its city and country", () => {
  assert.deepEqual(missingFields({ show: {}, venue: { city: "Manchester", country: " " }, date: "2026-10-10" }), ["place"]);
  assert.deepEqual(missingFields({ show: {}, venue: { osm_id: "node/1", city: null, country: null }, date: "2026-10-10" }), []);
});

test("describes what's needed in words", () => {
  assert.equal(describeMissing(["venue"]), "a venue");
  assert.equal(describeMissing(["show", "venue"]), "a show and a venue");
  assert.equal(describeMissing(["show", "place", "date"]), "a show, the venue’s city and country and a date");
});
