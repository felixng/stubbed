import assert from "node:assert/strict";
import { test } from "node:test";

import type { NearbyVenue } from "@/lib/entries";
import { lookupNearby } from "@/lib/import/photo-pipeline";
import type { NearbyPlaces } from "@/lib/places";

const savedHudson: NearbyVenue = {
  id: "7e000343-0000-0000-0000-000000000001",
  name: "Hudson Theatre",
  city: "New York",
  country: "US",
  lat: 40.75697,
  lng: -73.98393,
  osm_id: "way/1",
  distance_m: 30,
};

const osmAnswer: NearbyPlaces = {
  candidates: [
    { osm_id: "way/2", name: "Lyceum Theatre", address: null, city: null, country: null, lat: 40.7, lng: -73.9, distance_m: 80 },
  ],
  city: "New York",
  country: "US",
};

test("a saved venue in range is the answer: no OpenStreetMap request, city and country from it", async () => {
  let osmCalls = 0;
  const out = await lookupNearby(40.757, -73.984, null, {
    saved: async () => [savedHudson],
    osm: async () => {
      osmCalls += 1;
      return osmAnswer;
    },
  });
  assert.equal(osmCalls, 0);
  assert.deepEqual(out.candidates.map((c) => c.name), ["Hudson Theatre"]);
  assert.deepEqual(out.place, { city: "New York", country: "US" });
});

test("nothing saved in range: the OpenStreetMap lookup runs as before", async () => {
  let osmCalls = 0;
  const out = await lookupNearby(40.757, -73.984, null, {
    saved: async () => [],
    osm: async () => {
      osmCalls += 1;
      return osmAnswer;
    },
  });
  assert.equal(osmCalls, 1);
  assert.deepEqual(out.candidates.map((c) => c.osm_id), ["way/2"]);
  assert.deepEqual(out.place, { city: "New York", country: "US" });
});

test("a failed saved lookup falls back to OpenStreetMap, and a failed OpenStreetMap lookup is empty", async () => {
  const out = await lookupNearby(40.757, -73.984, null, {
    saved: async () => {
      throw new Error("offline");
    },
    osm: async () => null,
  });
  assert.deepEqual(out, { candidates: [], place: { city: null, country: null } });
});
