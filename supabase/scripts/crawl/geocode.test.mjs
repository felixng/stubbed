import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeocoder, geocodeVenueObservations, normalisePostcode, pickNominatim, streetForQuery } from './geocode.mjs';
import { safeError } from './frontier.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function mock(routes) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, ua: init?.headers?.['User-Agent'] });
    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error('unexpected ' + url);
    const out = hit[1];
    if (out instanceof Error) throw out;
    return out;
  };
  return { fetcher, calls };
}
const memory = () => {
  const rows = new Map();
  return {
    rows,
    get: async (p, q) => rows.get(p + '|' + q) ?? null,
    put: async (p, q, r) => rows.set(p + '|' + q, { found: !!r, lat: r?.lat, lng: r?.lng, fetched_at: new Date().toISOString() }),
  };
};

test('postcode normalisation', () => {
  assert.equal(normalisePostcode('wc2r0ns'), 'WC2R 0NS');
  assert.equal(normalisePostcode('not a postcode'), null);
});

test('UK postcode resolves through postcodes.io with provenance, then comes from the cache', async () => {
  const { fetcher, calls } = mock([['api.postcodes.io', json({ result: { latitude: 51.51, longitude: -0.12 } })]]);
  const cache = memory();
  const geocode = createGeocoder({ fetcher, cache });
  const first = await geocode({ postcode: 'WC2R 0NS', street: '1 Strand', city: 'London', country: 'GB' });
  assert.deepEqual([first.lat, first.lng, first.provider, first.query, first.precision], [51.51, -0.12, 'postcodes.io', 'WC2R 0NS', 'postcode_centroid']);
  await geocode({ postcode: 'wc2r0ns', city: 'London', country: 'GB' });
  assert.equal(calls.length, 1, 'second lookup is served from the cache');
  assert.match(calls[0].ua, /Stubbed/);
});

test('a postcodes.io miss falls back to Nominatim with the 1100 ms gap', async () => {
  const { fetcher, calls } = mock([
    ['api.postcodes.io', json({}, 404)],
    ['nominatim', json([{ lat: '51.5', lon: '-0.1' }])],
  ]);
  const sleeps = [];
  let clock = 1000;
  const geocode = createGeocoder({ fetcher, sleep: async ms => { sleeps.push(ms); clock += ms; }, now: () => clock });
  const input = { postcode: 'ZZ9 9ZZ', street: '1 Road', city: 'London', country: 'GB' };
  const a = await geocode(input);
  assert.equal(a.provider, 'nominatim');
  await geocode({ ...input, street: '2 Road' });
  assert.ok(sleeps.some(ms => ms > 0 && ms <= 1100), 'second Nominatim call waits for the gap');
  assert.ok(calls.every(call => new URL(call.url).hostname.match(/^(api\.postcodes\.io|nominatim\.openstreetmap\.org)$/)));
});

test('failure, timeout, ambiguity and out-of-country answers return null without throwing', async () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const input = { postcode: 'WC2R 0NS', street: '1 Strand', city: 'London', country: 'GB' };
  assert.equal(await createGeocoder({ fetcher: mock([['postcodes.io', timeout], ['nominatim', timeout]]).fetcher })(input), null);
  assert.equal(await createGeocoder({ fetcher: mock([['postcodes.io', json({}, 500)], ['nominatim', json({}, 429)]]).fetcher })(input), null);
  const two = json([{ lat: '51.5', lon: '-0.1' }, { lat: '52', lon: '-1' }]);
  assert.equal(await createGeocoder({ fetcher: mock([['postcodes.io', json({}, 404)], ['nominatim', two]]).fetcher })(input), null);
  const abroad = json({ result: { latitude: 40.7, longitude: -74 } });
  assert.equal(await createGeocoder({ fetcher: mock([['postcodes.io', abroad], ['nominatim', json([])]]).fetcher })(input), null);
});

test('a failed lookup is not cached, a definitive miss is', async () => {
  const cache = memory();
  const input = { postcode: 'ZZ9 9ZZ', city: 'London', country: 'GB' };
  await createGeocoder({ fetcher: mock([['postcodes.io', json({}, 500)]]).fetcher, cache })(input);
  assert.equal(cache.rows.size, 0);
  await createGeocoder({ fetcher: mock([['postcodes.io', json({}, 404)]]).fetcher, cache })(input);
  assert.equal(cache.rows.get('postcodes.io|ZZ9 9ZZ').found, false);
});

test('live geocoders are never reached from tests', async () => {
  const geocode = createGeocoder();
  assert.equal(await geocode({ postcode: 'WC2R 0NS', city: 'London', country: 'GB' }), null);
});

test('venue observations gain coordinates and provenance only when missing', async () => {
  const geocode = async () => ({ lat: 1, lng: 2, provider: 'postcodes.io', query: 'Q', precision: 'postcode_centroid' });
  const [bare, withGeo, event] = await geocodeVenueObservations([
    { observation_kind: 'venue', postcode: 'A1 1AA' },
    { observation_kind: 'venue', postcode: 'A1 1AA', lat: 5, lng: 6 },
    { observation_kind: 'event', postcode: 'A1 1AA' },
  ], geocode);
  assert.deepEqual([bare.lat, bare.lng, bare.geocode.provider], [1, 2, 'geocoded:postcodes.io']);
  assert.deepEqual([withGeo.lat, withGeo.lng, withGeo.geocode], [5, 6, undefined]);
  assert.equal(event.lat, undefined);
});

test('safeError keeps the class, strips URLs and secrets and caps length', () => {
  const error = Object.assign(new Error('connect postgresql://u:secret@h/db failed at https://x.test/a?k=1 token eyJabcdefghijklmnop.qrs ' + 'x'.repeat(500)), { code: 'ECONNRESET' });
  const text = safeError(error, 300);
  assert.ok(text.startsWith('ECONNRESET: '));
  assert.ok(text.length <= 300);
  assert.ok(!/secret|https?:|eyJ/.test(text));
});

test('Nominatim: objects in one building are one place, and the venue point wins', () => {
  // 245 W 44th St answers with the Majestic Theatre and a gift shop about 20 m apart.
  const majestic = [
    { lat: '40.7583731', lon: '-73.9882377', category: 'shop', type: 'gift' },
    { lat: '40.7584179', lon: '-73.9880164', category: 'amenity', type: 'theatre' },
  ];
  assert.deepEqual(pickNominatim(majestic), { lat: 40.7584179, lng: -73.9880164 });
  // Two non-venue objects in the same building still give the address point.
  assert.deepEqual(pickNominatim([{ lat: '40.75', lon: '-73.98', category: 'shop', type: 'gift' },
    { lat: '40.7501', lon: '-73.9801', category: 'shop', type: 'books' }]), { lat: 40.75, lng: -73.98 });
});

test('Nominatim: far-apart answers are ambiguous unless exactly one is a performance venue', () => {
  // "1634 Broadway" is the Winter Garden in Manhattan and a shop in Brooklyn.
  const winterGarden = [
    { lat: '40.7616856', lon: '-73.9835045', category: 'amenity', type: 'theatre' },
    { lat: '40.6847818', lon: '-73.9141336', category: 'shop', type: 'variety_store' },
    { lat: '40.7615479', lon: '-73.9837434', category: 'amenity', type: 'restaurant' },
  ];
  assert.deepEqual(pickNominatim(winterGarden), { lat: 40.7616856, lng: -73.9835045 });
  const twoTheatres = [
    { lat: '40.76', lon: '-73.98', category: 'amenity', type: 'theatre' },
    { lat: '40.68', lon: '-73.91', category: 'amenity', type: 'theatre' },
  ];
  assert.equal(pickNominatim(twoTheatres), null);
  assert.equal(pickNominatim([{ lat: '40.76', lon: '-73.98' }, { lat: '40.68', lon: '-73.91' }]), null);
  assert.equal(pickNominatim([]), null);
});

test('a bracketed note is left out of the street query', async () => {
  assert.equal(streetForQuery('1634 Broadway (At W. 50th St.)'), '1634 Broadway');
  assert.equal(streetForQuery('219 W. 49th St.'), '219 W. 49th St.');
  const { fetcher, calls } = mock([['nominatim', json([{ lat: '40.7616856', lon: '-73.9835045', category: 'amenity', type: 'theatre' }])]]);
  const hit = await createGeocoder({ fetcher, sleep: async () => {} })(
    { street: '1634 Broadway (At W. 50th St.)', city: 'New York', country: 'US' });
  assert.equal(hit.query, '1634 Broadway, New York, US');
  assert.equal(new URL(calls[0].url).searchParams.get('countrycodes'), null, 'a US address is not limited to GB');
});

test('a theatre-name search is the last fallback and accepts only a performance venue', async () => {
  const { pickNominatimVenue } = await import('./geocode.mjs');
  // Retired postcode, then a numberless street that matches nothing, then the theatre's own name.
  const { fetcher, calls } = mock([
    ['postcodes.io', json({}, 404)],
    ['Charing+Cross+Road', json([])],
    ["Wyndham%27s+Theatre", json([{ lat: '51.5111', lon: '-0.1281', category: 'amenity', type: 'theatre' }])],
  ]);
  const hit = await createGeocoder({ fetcher, sleep: async () => {} })(
    { name: "Wyndham's Theatre", street: 'Charing Cross Road', postcode: 'WC2N 0DA', city: 'London', country: 'GB' });
  assert.equal(hit.precision, 'venue_name');
  assert.equal(hit.query, "Wyndham's Theatre, London, GB");
  assert.equal(calls.length, 3);
  // A same-named building is not the theatre; two theatres far apart are ambiguous.
  assert.equal(pickNominatimVenue([{ lat: '51.50', lon: '-0.11', category: 'building', type: 'commercial' }]), null);
  assert.equal(pickNominatimVenue([{ lat: '51.51', lon: '-0.12', category: 'amenity', type: 'theatre' },
    { lat: '51.49', lon: '-0.23', category: 'amenity', type: 'theatre' }]), null);
});
