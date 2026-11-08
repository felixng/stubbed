// Free geocoding for crawled venues (owner decision, 2026-11-08, #444): postcodes.io for UK postcodes, OSM
// Nominatim as the fallback and for non-UK addresses. No account or key. Runs only in the crawler worker,
// never in a logging request. A failure, timeout or odd answer returns null and leaves the venue held; it
// never throws into the crawl. Results are cached in Postgres (crawl_geocodes) so re-runs do not re-query.
import { runPsql } from './db.mjs';
import { jsonLiteral } from './load.mjs';

export const GEOCODER_HOSTS = ['api.postcodes.io', 'nominatim.openstreetmap.org'];
export const GEOCODER_USER_AGENT = 'Stubbed/1.0 (+https://getstubbed.app; what\'s-on research crawler)';
export const NOMINATIM_GAP_MS = 1100; // Nominatim policy: at most 1 request per second
const TIMEOUT_MS = 8000;
const NOT_FOUND_TTL_MS = 7 * 24 * 3600 * 1000;
const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;
const UK_COUNTRY = /^(?:united kingdom|uk|gb|great britain|england|scotland|wales|northern ireland)$/i;

const sqlText = value => '(' + jsonLiteral(value ?? null) + " #>> '{}')";

export function normalisePostcode(value) {
  const match = UK_POSTCODE.exec(String(value ?? '').trim());
  return match ? `${match[1]} ${match[2]}`.toUpperCase() : null;
}

const inUk = (lat, lng) => lat >= 49.5 && lat <= 61.5 && lng >= -8.7 && lng <= 2.1;
const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const SAME_PLACE_M = 150;
const VENUE_TYPES = new Set(['theatre', 'arts_centre', 'concert_hall', 'opera_house', 'events_venue']);

export function metresBetween(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Nominatim often answers one street address with several objects in the same building (the theatre and a gift
// shop at 245 W 44th St). Those are one location. Answers far apart are ambiguous ("1634 Broadway" is in
// Manhattan and Brooklyn), unless exactly one of them is a performance venue. Prefer the venue's own point.
export function pickNominatim(rows) {
  const points = rows.map(row => ({ lat: Number(row.lat), lng: Number(row.lon),
    venue: row.category === 'amenity' && VENUE_TYPES.has(row.type) })).filter(point => valid(point.lat, point.lng));
  if (!points.length) return null;
  const venues = points.filter(point => point.venue);
  if (points.every(point => metresBetween(points[0], point) <= SAME_PLACE_M)) {
    const best = venues[0] ?? points[0];
    return { lat: best.lat, lng: best.lng };
  }
  return venues.length === 1 ? { lat: venues[0].lat, lng: venues[0].lng } : null;
}

// Searching by the theatre's own name ("Wyndham's Theatre, London") accepts only performance venues: a
// building or shop with the same name is not the theatre. Several venue answers must be one place.
export function pickNominatimVenue(rows) {
  const venues = rows.map(row => ({ lat: Number(row.lat), lng: Number(row.lon),
    venue: row.category === 'amenity' && VENUE_TYPES.has(row.type) }))
    .filter(point => point.venue && valid(point.lat, point.lng));
  if (!venues.length || !venues.every(point => metresBetween(venues[0], point) <= SAME_PLACE_M)) return null;
  return { lat: venues[0].lat, lng: venues[0].lng };
}

// "1634 Broadway (At W. 50th St.)": a note in brackets makes Nominatim find nothing.
export function streetForQuery(street) {
  return String(street ?? '').replace(/\s*\([^()]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

// Postgres-backed cache. Only answers worth keeping are stored: a hit, or a definitive "not found".
export function createGeocodeCache(db = sql => runPsql(sql, { timeout: 15_000 })) {
  return {
    async get(provider, query) {
      const [row] = await db(`select to_jsonb(g) from public.get_crawl_geocode(${sqlText(provider)}, ${sqlText(query)}) g`);
      return row ?? null;
    },
    async put(provider, query, result) {
      await db(`select to_jsonb(public.put_crawl_geocode(${sqlText(provider)}, ${sqlText(query)},
        ${result ? Number(result.lat) : 'null'}::double precision, ${result ? Number(result.lng) : 'null'}::double precision))`);
    },
  };
}

export function createGeocoder({
  fetcher = globalThis.fetch, cache = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now, log = () => {},
} = {}) {
  let lastNominatim = 0;
  const live = fetcher === globalThis.fetch;

  async function call(url, { throttle = false } = {}) {
    // CI and unit tests must never reach a live geocoder; they inject a fetcher.
    if (live && process.env.NODE_TEST_CONTEXT) throw new Error('Live geocoding is disabled in tests');
    const host = new URL(url).hostname;
    if (!GEOCODER_HOSTS.includes(host)) throw new Error('Geocoder host not allowed');
    if (throttle) {
      const wait = lastNominatim + NOMINATIM_GAP_MS - now();
      if (wait > 0) await sleep(wait);
      lastNominatim = now();
    }
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': GEOCODER_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
    });
    return response;
  }

  async function cached(provider, query, lookup) {
    if (cache) {
      try {
        const hit = await cache.get(provider, query);
        if (hit && (hit.found || now() - Date.parse(hit.fetched_at) < NOT_FOUND_TTL_MS)) {
          return hit.found ? { lat: hit.lat, lng: hit.lng, cached: true } : null;
        }
      } catch { /* a cache failure only costs a re-query */ }
    }
    const outcome = await lookup(); // { lat, lng } | null (definitive miss); throws on failure
    if (cache) { try { await cache.put(provider, query, outcome); } catch { /* ignore */ } }
    return outcome;
  }

  async function postcodesIo(postcode) {
    return cached('postcodes.io', postcode, async () => {
      const response = await call(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`postcodes.io HTTP ${response.status}`);
      const { result } = await response.json();
      const lat = Number(result?.latitude);
      const lng = Number(result?.longitude);
      return valid(lat, lng) && inUk(lat, lng) ? { lat, lng } : null;
    });
  }

  async function nominatim(query, uk, pick = pickNominatim) {
    return cached('nominatim', query, async () => {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '5', q: query, 'accept-language': 'en' });
      if (uk) params.set('countrycodes', 'gb');
      const response = await call(`https://nominatim.openstreetmap.org/search?${params}`, { throttle: true });
      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
      const rows = await response.json();
      const hit = pick(Array.isArray(rows) ? rows : []);
      return hit && (!uk || inUk(hit.lat, hit.lng)) ? hit : null;
    });
  }

  // Returns { lat, lng, provider, query, precision } or null. Never throws.
  return async function geocode({ postcode, street, city, country, name } = {}) {
    const uk = !country || UK_COUNTRY.test(String(country).trim());
    const code = uk ? normalisePostcode(postcode) : null;
    try {
      if (code) {
        const hit = await postcodesIo(code);
        if (hit) return { lat: hit.lat, lng: hit.lng, provider: 'postcodes.io', query: code, precision: 'postcode_centroid' };
      }
    } catch (error) { log('postcodes.io failed', error?.name); }
    const cleanStreet = streetForQuery(street);
    const parts = [cleanStreet, postcode, city, country].map(part => String(part ?? '').trim()).filter(Boolean);
    if (cleanStreet && parts.length >= 3) {
      const query = parts.join(', ').slice(0, 300);
      try {
        const hit = await nominatim(query, uk);
        if (hit) return { lat: hit.lat, lng: hit.lng, provider: 'nominatim', query, precision: 'address' };
      } catch (error) { log('nominatim failed', error?.name); }
    }
    // Last resort: the theatre's own name in its city, for retired postcodes and numberless streets
    // ("Shaftesbury Avenue, London W1"). Theatres are named places in OSM.
    const venueName = String(name ?? '').replace(/^\s*@/, '').trim();
    if (!venueName || !String(city ?? '').trim()) return null;
    const nameQuery = [venueName, city, country].map(part => String(part ?? '').trim()).filter(Boolean).join(', ').slice(0, 300);
    try {
      const hit = await nominatim(nameQuery, uk, pickNominatimVenue);
      if (hit) return { lat: hit.lat, lng: hit.lng, provider: 'nominatim', query: nameQuery, precision: 'venue_name' };
    } catch (error) { log('nominatim failed', error?.name); }
    return null;
  };
}

// Adds lat/lng and provenance to venue observations that have an address but no coordinates.
export async function geocodeVenueObservations(observations, geocode) {
  const output = [];
  for (const observation of observations ?? []) {
    const missing = observation?.observation_kind === 'venue' && observation.lat == null && observation.lng == null;
    const result = missing && (observation.postcode || observation.street || observation.name) ? await geocode(observation) : null;
    output.push(result ? {
      ...observation, lat: result.lat, lng: result.lng,
      geocode: { provider: `geocoded:${result.provider}`, query: result.query, precision: result.precision },
    } : observation);
  }
  return output;
}

// One-off: give crawler-created venues that have an address but no coordinates a geocoded point, so the next
// source can corroborate against it. Only fills null coordinates; never moves an existing point.
export async function backfillVenueGeocodes(geocode, db = sql => runPsql(sql, { timeout: 30_000 })) {
  const rows = await db(`select jsonb_build_object('id', id, 'street', catalogue_street, 'postcode', catalogue_postcode,
      'city', city, 'country', country) from public.venues
    where source = 'crawler' and lat is null and lng is null and (catalogue_postcode is not null or catalogue_street is not null)
    order by created_at limit 200`);
  let updated = 0;
  for (const row of rows) {
    const result = await geocode(row);
    if (!result) continue;
    const [ok] = await db(`select to_jsonb(public.backfill_crawler_venue_geo(${sqlText(row.id)}::uuid, ${Number(result.lat)}, ${Number(result.lng)}))`);
    if (ok) updated += 1;
  }
  return { candidates: rows.length, updated };
}
