// Nearby theatres from OpenStreetMap, for the photo-first log flow (#14) and
// photo import (#18). Server only: OSM's usage policies ask for an
// identifying User-Agent, which browsers can't set. The GPS point is used for
// this lookup only and never stored or logged.

export type PlaceCandidate = {
  osm_id: string; // "way/123456"
  name: string;
  address: string | null;
  city: string | null;
  country: string | null; // ISO 3166-1 alpha-2, upper case
  lat: number;
  lng: number;
  distance_m: number;
};

export type NearbyPlaces = {
  candidates: PlaceCandidate[];
  // Where the photo was taken, for venues added by hand at that spot.
  city: string | null;
  country: string | null;
};

const USER_AGENT = "Stubbed/0.1 (theatre diary; https://github.com/felixng/stubbed)";
// The main public Overpass server is often overloaded (504s and timeouts
// from Vercel); mirrors run the same API. All are asked at once and the
// first answer wins, so one slow server can't hold the lookup up.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
// Short waits: a lookup that hasn't answered in a few seconds rarely will,
// and the identify step can still search near the point without it.
const LOOKUP_TIMEOUT_MS = 4_000;
// A healthy Overpass mirror answers a 150 m query in well under a second.
const OVERPASS_TIMEOUT_MS = 2_000;
// After every mirror failed, this instance goes straight to Nominatim for
// this long, then lets one lookup try Overpass again.
const OVERPASS_SKIP_MS = 10 * 60_000;

// Broadway houses can be under 100 m apart and phone GPS in Midtown can be
// 20–50 m off, so without better information look a little wider and let
// distance order the list.
export const NEARBY_RADIUS_M = 150;
// With a precise fix, a tighter circle: fewer theatres to choose from, and
// often just one (the log form then fills the venue straight away).
export const MIN_NEARBY_RADIUS_M = 60;

// The search radius for a photo, from the GPS accuracy its phone recorded:
// about 2.5× the stated error, between 60 m and 150 m. Unknown accuracy
// keeps the full 150 m, so the right theatre isn't missed.
export function nearbyRadius(accuracy_m: number | null | undefined): number {
  if (accuracy_m == null || !Number.isFinite(accuracy_m) || accuracy_m <= 0) return NEARBY_RADIUS_M;
  return Math.round(Math.min(NEARBY_RADIUS_M, Math.max(MIN_NEARBY_RADIUS_M, accuracy_m * 2.5)));
}
const MAX_CANDIDATES = 8;

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export function parseOverpass(json: unknown, lat: number, lng: number): PlaceCandidate[] {
  const elements = (json as { elements?: OverpassElement[] })?.elements ?? [];
  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = (tags["name:en"] ?? tags.name ?? "").trim();
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    if (!name || pLat == null || pLng == null) continue;
    const osm_id = `${el.type}/${el.id}`;
    if (seen.has(osm_id)) continue;
    seen.add(osm_id);
    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    out.push({
      osm_id,
      name,
      address: street || null,
      city: tags["addr:city"] ?? null,
      country: tags["addr:country"]?.toUpperCase() ?? null,
      lat: pLat,
      lng: pLng,
      distance_m: Math.round(distanceMeters(lat, lng, pLat, pLng)),
    });
  }
  return out.sort((a, b) => a.distance_m - b.distance_m).slice(0, MAX_CANDIDATES);
}

type NominatimReverse = {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country_code?: string;
  };
};

export function parseNominatim(json: unknown): { city: string | null; country: string | null } {
  const a = (json as NominatimReverse)?.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;
  return { city, country: a.country_code ? a.country_code.toUpperCase() : null };
}

async function getJson(url: string, init?: RequestInit, timeoutMs = LOOKUP_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init?.headers },
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

// Every mirror at once; the first good answer wins and the rest are
// cancelled. Fails only when all of them do.
async function queryOverpass(query: string) {
  const done = new AbortController();
  try {
    return await Promise.any(
      OVERPASS_URLS.map((url) =>
        getJson(url, { method: "POST", body: new URLSearchParams({ data: query }), signal: done.signal }, OVERPASS_TIMEOUT_MS),
      ),
    );
  } catch (error) {
    throw error instanceof AggregateError ? new Error(error.errors.map(String).join("; ")) : error;
  } finally {
    done.abort();
  }
}

// Nominatim's usage policy allows about one request a second, so calls from
// this server instance are spaced out.
let nominatimTurn: Promise<unknown> = Promise.resolve();
function nominatim(path: string, params: Record<string, string>) {
  const url = `${NOMINATIM_URL}/${path}?${new URLSearchParams({ format: "jsonv2", "accept-language": "en", ...params })}`;
  const run = nominatimTurn.then(() => getJson(url));
  nominatimTurn = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1_100)));
  return run;
}

type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  address?: NominatimReverse["address"] & { road?: string; house_number?: string };
};

// Nominatim's search for theatres in a small box around the point: the
// fallback when every Overpass server is down.
export function parseNominatimSearch(json: unknown, lat: number, lng: number, radius = NEARBY_RADIUS_M): PlaceCandidate[] {
  const items = Array.isArray(json) ? (json as NominatimPlace[]) : [];
  const out: PlaceCandidate[] = [];
  for (const item of items) {
    const pLat = Number(item.lat);
    const pLng = Number(item.lon);
    const name = item.name?.trim();
    if (!name || !item.osm_type || !item.osm_id || !Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
    const distance_m = Math.round(distanceMeters(lat, lng, pLat, pLng));
    if (distance_m > radius) continue;
    const place = parseNominatim({ address: item.address });
    const street = [item.address?.house_number, item.address?.road].filter(Boolean).join(" ");
    out.push({ osm_id: `${item.osm_type}/${item.osm_id}`, name, address: street || null, ...place, lat: pLat, lng: pLng, distance_m });
  }
  return out.sort((a, b) => a.distance_m - b.distance_m).slice(0, MAX_CANDIDATES);
}

function searchNominatim(lat: number, lng: number, radius: number) {
  // A box a little larger than the radius; results outside it are dropped.
  const dLat = (radius * 1.2) / 111_320;
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return nominatim("search", {
    amenity: "theatre",
    viewbox: [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(","),
    bounded: "1",
    limit: "20",
    addressdetails: "1",
  }).then((json) => parseNominatimSearch(json, lat, lng, radius));
}

// Overpass health for this server instance. While `skipUntil` is in the
// future, lookups go straight to Nominatim; the first one after that is the
// trial (`trialing`, so only one), and its result decides whether to go on
// skipping.
const overpass = { skipUntil: 0, trialing: false };

/** Test hook: forget what this instance knows about Overpass. */
export function resetOverpassHealth() {
  overpass.skipUntil = 0;
  overpass.trialing = false;
}

// Results per ~100 m square for this server instance: theatres don't move,
// and several photo visits often share a venue.
const nearbyCache = new Map<string, NearbyPlaces>();
const MAX_CACHED = 500;

// City and country per ~1 km square, so a second visit nearby skips Nominatim.
const placeCache = new Map<string, { city: string | null; country: string | null }>();

function reversePlace(lat: number, lng: number): Promise<{ city: string | null; country: string | null }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = placeCache.get(key);
  if (cached) return Promise.resolve(cached);
  return nominatim("reverse", { lat: String(lat), lon: String(lng), zoom: "10" })
    .then(parseNominatim)
    .then((place) => {
      if (place.city || place.country) {
        if (placeCache.size >= MAX_CACHED) placeCache.delete(placeCache.keys().next().value!);
        placeCache.set(key, place);
      }
      return place;
    })
    .catch((error) => {
      console.error("Nominatim lookup failed", String(error));
      return { city: null, country: null };
    });
}

// `radius` comes from nearbyRadius(): tighter when the photo's GPS is precise.
export async function findNearbyTheatres(lat: number, lng: number, radius = NEARBY_RADIUS_M): Promise<NearbyPlaces> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
  const cached = nearbyCache.get(key);
  if (cached) return cached;

  const query =
    `[out:json][timeout:4];` +
    `nwr(around:${radius},${lat},${lng})["amenity"="theatre"];` +
    `out center tags;`;

  // Overpass is the main source. While it's known to be down we go straight
  // to Nominatim's theatre search, which then runs first in the queue.
  // Otherwise the reverse lookup goes first in the queue, beside Overpass,
  // so the city is usually ready when Overpass answers, and Nominatim's
  // theatre search is only the fallback. Both are best effort: if neither
  // answers, the list is empty.
  const skipping = Date.now() < overpass.skipUntil || overpass.trialing;
  let candidates: PlaceCandidate[] | null = null;
  let reverse: Promise<{ city: string | null; country: string | null }> | null = null;
  if (skipping) {
    candidates = await searchNominatim(lat, lng, radius).catch((error) => {
      console.error("Nominatim theatre search failed", String(error));
      return null;
    });
  } else {
    const trial = overpass.skipUntil > 0;
    if (trial) overpass.trialing = true;
    const started = Date.now();
    reverse = reversePlace(lat, lng);
    candidates = await queryOverpass(query)
      .then((json) => {
        overpass.skipUntil = 0;
        return parseOverpass(json, lat, lng);
      })
      .catch((error) => {
        const alreadySkipping = overpass.skipUntil > Date.now();
        overpass.skipUntil = Date.now() + OVERPASS_SKIP_MS;
        if (!trial && !alreadySkipping) console.warn(`Overpass is down: skipping it for ${OVERPASS_SKIP_MS / 60_000} minutes`);
        console.error(`Overpass lookup failed after ${Date.now() - started} ms`, String(error));
        return null;
      })
      .finally(() => {
        overpass.trialing = false;
      });
    if (!candidates) {
      candidates = await searchNominatim(lat, lng, radius).catch((error) => {
        console.error("Nominatim theatre search failed", String(error));
        return null;
      });
    }
  }

  // City and country: from a theatre's address when there is one, else the
  // reverse lookup of the point.
  const addressed = candidates?.find((c) => c.city && c.country);
  const place: { city: string | null; country: string | null } = addressed
    ? { city: addressed.city, country: addressed.country }
    : await (reverse ?? reversePlace(lat, lng));

  const result: NearbyPlaces = {
    // Most theatres don't carry addr:city; the point's city is close enough.
    candidates: (candidates ?? []).map((c) => ({ ...c, city: c.city ?? place.city, country: c.country ?? place.country })),
    ...place,
  };
  // Cache only real answers, not "everything failed".
  if (candidates) {
    if (nearbyCache.size >= MAX_CACHED) nearbyCache.delete(nearbyCache.keys().next().value!);
    nearbyCache.set(key, result);
  }
  return result;
}
