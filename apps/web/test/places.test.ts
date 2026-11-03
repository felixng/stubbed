import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { findNearbyTheatres, parseNominatimSearch } from "@/lib/places";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Hudson Theatre, New York.
const HUDSON = { lat: 40.75697, lng: -73.98393 };

const nominatimTheatre = {
  osm_type: "way",
  osm_id: 123,
  lat: String(HUDSON.lat),
  lon: String(HUDSON.lng),
  name: "Hudson Theatre",
  address: { house_number: "141", road: "West 44th Street", city: "New York", country_code: "us" },
};

test("parseNominatimSearch keeps named theatres within the radius, nearest first", () => {
  const far = { ...nominatimTheatre, osm_id: 9, name: "Far Theatre", lat: String(HUDSON.lat + 0.01) };
  const out = parseNominatimSearch([far, nominatimTheatre, { name: "No id" }], HUDSON.lat + 0.0003, HUDSON.lng);
  assert.equal(out.length, 1);
  assert.deepEqual(
    { ...out[0], distance_m: undefined },
    {
      osm_id: "way/123",
      name: "Hudson Theatre",
      address: "141 West 44th Street",
      city: "New York",
      country: "US",
      lat: HUDSON.lat,
      lng: HUDSON.lng,
      distance_m: undefined,
    },
  );
  assert.ok(out[0].distance_m > 20 && out[0].distance_m < 50);
});

type Handler = (url: string) => Response | Promise<Response>;
function serve(handler: Handler) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(new URL(url).host + new URL(url).pathname);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return handler(url);
  }) as typeof fetch;
  return calls;
}

test("Nominatim covers for Overpass when every mirror fails, and the result is cached", async () => {
  const calls = serve((url) => {
    if (url.includes("/api/interpreter")) return new Response("busy", { status: 504 });
    if (url.includes("/search")) return Response.json([nominatimTheatre]);
    return Response.json({ address: { city: "New York", country_code: "us" } });
  });
  const point = { lat: HUDSON.lat + 0.0002, lng: HUDSON.lng };
  const first = await findNearbyTheatres(point.lat, point.lng);
  assert.deepEqual(first.candidates.map((c) => c.name), ["Hudson Theatre"]);
  assert.equal(first.city, "New York");
  assert.equal(first.country, "US");
  // The theatre's address gave the city; the reverse lookup started anyway.
  assert.ok(calls.filter((c) => c.endsWith("/reverse")).length <= 1);

  const before = calls.length;
  const again = await findNearbyTheatres(point.lat, point.lng);
  assert.deepEqual(again, first);
  assert.equal(calls.length, before, "served from the cache");
});

test("the first Overpass mirror to answer wins", async () => {
  serve(async (url) => {
    if (url.includes("overpass-api.de")) return new Promise<Response>(() => {}); // hangs
    if (url.includes("/api/interpreter")) {
      return Response.json({ elements: [{ type: "node", id: 7, lat: 51.507, lon: -0.1165, tags: { name: "Lyttelton Theatre" } }] });
    }
    if (url.includes("/search")) return Response.json([]);
    return Response.json({ address: { city: "London", country_code: "gb" } });
  });
  const started = Date.now();
  const out = await findNearbyTheatres(51.5071, -0.1166);
  assert.deepEqual(out.candidates.map((c) => c.osm_id), ["node/7"]);
  assert.equal(out.candidates[0].city, "London");
  assert.ok(Date.now() - started < 3_500, "didn't wait for the hanging mirror");
});

test("nearbyRadius: tighter with a precise fix, 150 m when unknown or poor", async () => {
  const { nearbyRadius } = await import("@/lib/places");
  assert.equal(nearbyRadius(null), 150);
  assert.equal(nearbyRadius(undefined), 150);
  assert.equal(nearbyRadius(0), 150);
  assert.equal(nearbyRadius(5), 60); // floor
  assert.equal(nearbyRadius(30), 75);
  assert.equal(nearbyRadius(48), 120);
  assert.equal(nearbyRadius(65), 150); // cap
  assert.equal(nearbyRadius(500), 150);
});

test("parseNominatimSearch honours a tighter radius", () => {
  // ~55 m north of the theatre: inside 150 m, outside 40 m.
  const lat = HUDSON.lat + 0.0005;
  assert.equal(parseNominatimSearch([nominatimTheatre], lat, HUDSON.lng).length, 1);
  assert.equal(parseNominatimSearch([nominatimTheatre], lat, HUDSON.lng, 40).length, 0);
});

test("the reverse lookup is sent before Overpass answers, and the search is skipped when Overpass works", async () => {
  const order: string[] = [];
  serve(async (url) => {
    if (url.includes("/api/interpreter")) {
      order.push("overpass");
      // Outlasts the 1.1 s Nominatim gap left by the earlier tests.
      await new Promise((r) => setTimeout(r, 1_400));
      order.push("overpass-answered");
      return Response.json({ elements: [{ type: "node", id: 8, lat: 48.8566, lon: 2.3523, tags: { name: "Théâtre" } }] });
    }
    if (url.includes("/search")) order.push("search");
    if (url.includes("/reverse")) order.push("reverse");
    return Response.json({ address: { city: "Paris", country_code: "fr" } });
  });
  const out = await findNearbyTheatres(48.8566, 2.3522);
  assert.equal(out.city, "Paris");
  assert.ok(order.indexOf("reverse") !== -1 && order.indexOf("reverse") < order.indexOf("overpass-answered"));
  assert.ok(!order.includes("search"), "Overpass answered, so no fallback search");
});

test("a second lookup near the same point doesn't reverse geocode again", async () => {
  const calls = serve((url) => {
    if (url.includes("/api/interpreter")) return Response.json({ elements: [] });
    return Response.json({ address: { city: "Leeds", country_code: "gb" } });
  });
  await findNearbyTheatres(53.8008, -1.5491);
  // Different 100 m square (a new nearby-cache key), same ~1 km square.
  const second = await findNearbyTheatres(53.8041, -1.5491);
  assert.equal(second.city, "Leeds");
  assert.equal(calls.filter((c) => c.endsWith("/reverse")).length, 1);
});
