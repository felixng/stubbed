import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dedupe, fillCities, loadSql, mapRows, nameKey, parseNominatim, psqlEnv, venueQuery } from './sync-osm-venues.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/osm-venues.json', import.meta.url), 'utf8'));
const gb = mapRows(fixture.GB, 'GB');
const us = mapRows(fixture.US, 'US');
const byId = (rows, id) => rows.find(row => row.osm_id === id);

test('the query asks QLever for named theatres inside the country relation', () => {
  assert.match(venueQuery('osmrel:62149'), /osmrel:62149 ogc:sfContains \?osm/);
  assert.match(venueQuery('osmrel:148838'), /osmkey:amenity "theatre"/);
});

test('mapRows turns bindings into rows: ids, rounded coordinates, country', () => {
  assert.equal(gb.length, 8);
  assert.equal(us.length, 3);
  const apollo = byId(gb, 'way/149173453');
  assert.equal(apollo.name, 'Apollo Theatre');
  assert.equal(apollo.country, 'GB');
  assert.equal(apollo.city, 'London');
  assert.equal(apollo.website, 'https://www.nimaxtheatres.com/nimax/apollo');
  for (const row of [...gb, ...us]) {
    assert.match(row.osm_id, /^(node|way|relation)\/[0-9]+$/);
    assert.ok(String(row.lat).split('.')[1]?.length <= 7, 'at most 7 decimal places');
    assert.ok(String(row.lng).split('.')[1]?.length <= 7);
  }
});

test('mapRows prefers name:en, and leaves city null when OpenStreetMap has none', () => {
  assert.equal(byId(gb, 'node/12284673396').name, 'Dragon Threatre');
  assert.equal(byId(gb, 'node/10024742071').city, null);
});

test('mapRows drops a wikidata tag that is not exactly one id', () => {
  const berklee = byId(us, 'way/244558109');
  assert.equal(berklee.wikidata_id, null);
  assert.equal(berklee.circuit, null);
});

test('mapRows skips empty and over-long names, and rows without usable coordinates', () => {
  const [sample] = fixture.GB;
  const make = changes => ({ ...sample, ...changes });
  assert.equal(mapRows([make({ name: { type: 'literal', value: 'x'.repeat(201) }, name_en: undefined })], 'GB').length, 0);
  assert.equal(mapRows([make({ name: { type: 'literal', value: '   ' }, name_en: undefined })], 'GB').length, 0);
  assert.equal(mapRows([make({ lat: { type: 'literal', value: 'north' } })], 'GB').length, 0);
  assert.equal(mapRows([make({ city: { type: 'literal', value: 'c'.repeat(101) } })], 'GB')[0].city, null);
  assert.equal(mapRows([make({ website: { type: 'literal', value: 'ftp://example.test' } })], 'GB')[0].website, null);
});

test('mapRows labels West End and Broadway houses from the reviewed lists', () => {
  assert.equal(byId(gb, 'way/149173453').circuit, 'west_end'); // Apollo Theatre, Q4780361
  assert.equal(byId(gb, 'way/313005904').circuit, 'west_end'); // Adelphi Theatre, Q355319
  assert.equal(byId(us, 'way/266149330').circuit, 'broadway'); // Richard Rodgers Theatre, Q7328714
  assert.equal(byId(us, 'way/266170751').circuit, 'broadway'); // Hudson Theatre, Q10526870
  assert.equal(byId(gb, 'node/10024742071').circuit, null);
});

test('dedupe keeps one row for a node and a way of the same theatre, preferring the way', () => {
  const kept = dedupe(gb);
  const palace = kept.filter(row => nameKey(row.name) === 'palacecourttheatre');
  assert.deepEqual(palace.map(row => row.osm_id), ['way/223346381']);
});

test('dedupe keeps one row per wikidata_id', () => {
  const kept = dedupe(gb);
  const sharing = kept.filter(row => row.wikidata_id === 'Q26666980');
  assert.equal(sharing.length, 1);
  assert.equal(sharing[0].osm_id, 'way/1340550657');
});

test('dedupe keeps one row per osm_id, a circuit over none, and same names far apart', () => {
  const [a] = gb;
  assert.equal(dedupe([a, { ...a }]).length, 1);
  const plain = { ...a, osm_id: 'node/1', wikidata_id: null, circuit: null, name: 'Same Name Theatre', lat: 51.5, lng: -0.1 };
  const labelled = { ...plain, osm_id: 'node/2', circuit: 'west_end', wikidata_id: 'Q1' };
  assert.deepEqual(dedupe([plain, labelled]).map(row => row.osm_id), ['node/2']);
  const far = { ...plain, osm_id: 'node/3', lat: 51.6 };
  assert.equal(dedupe([plain, far]).length, 2);
});

test('nameKey treats theater and theatre alike and ignores punctuation, case and accents', () => {
  assert.equal(nameKey("Hudson Theater"), nameKey('hudson-THEATRE'));
  assert.equal(nameKey('Théâtre Royal'), 'theatreroyal');
});

test('parseNominatim takes the first of city, town, village, municipality, county, state', () => {
  assert.deepEqual(parseNominatim({ address: { town: 'Leatherhead', county: 'Surrey', country_code: 'gb' } }), { city: 'Leatherhead', country: 'GB' });
  assert.deepEqual(parseNominatim({ address: { city: 'London', town: 'x' } }), { city: 'London', country: null });
  assert.deepEqual(parseNominatim({ address: { state: 'Texas' } }).city, 'Texas');
  assert.deepEqual(parseNominatim({}), { city: null, country: null });
});

test('loadSql wraps one call in a transaction, rolling back on a dry run', () => {
  assert.match(loadSql(gb, true), /load_osm_venues\(\$stubbed\$/);
  assert.match(loadSql(gb, true), /rollback;$/);
  assert.match(loadSql(gb, false), /commit;$/);
});

test('loadSql refuses data that contains its own quote delimiter', () => {
  assert.throws(() => loadSql([{ ...gb[0], name: 'Bad $stubbed$ Theatre' }], false), /\$stubbed\$/);
});

test('fillCities looks up one ~1 km square once, spaces calls, and resumes from its cache', async () => {
  const cachePath = join(await mkdtemp(join(tmpdir(), 'osm-cities-')), 'cities.json');
  const rows = [
    { lat: 51.50012, lng: -0.1, city: null },
    { lat: 51.50388, lng: -0.1, city: null }, // same 0.01-degree square
    { lat: 53.2, lng: -1.4, city: null },
    { lat: 52.0, lng: -1.0, city: 'Already Known' },
  ];
  let calls = 0, clock = 0;
  const waits = [];
  const fetcher = async url => {
    calls += 1;
    const lat = Number(new URL(url).searchParams.get('lat'));
    return Response.json({ address: { city: lat > 52 ? 'Chesterfield' : 'London', country_code: 'gb' } });
  };
  const options = { cachePath, fetcher, now: () => clock, sleep: async ms => { waits.push(ms); clock += ms; } };
  const first = await fillCities(rows, options);
  assert.deepEqual(rows.map(row => row.city), ['London', 'London', 'Chesterfield', 'Already Known']);
  assert.equal(calls, 2);
  assert.deepEqual(first, { looked: 2, cached: 1, blank: 0 });
  assert.ok(waits.every(ms => ms >= 1000), 'calls are at least about a second apart');

  const again = [{ lat: 51.5001, lng: -0.1, city: null }];
  const second = await fillCities(again, options);
  assert.equal(again[0].city, 'London');
  assert.equal(calls, 2, 'served from the cache file');
  assert.equal(second.looked, 0);
});

test('fillCities leaves a row blank when Nominatim keeps failing, without throwing', async () => {
  const cachePath = join(await mkdtemp(join(tmpdir(), 'osm-cities-')), 'cities.json');
  const rows = [{ lat: 10.1, lng: 10.1, city: null }];
  const result = await fillCities(rows, {
    cachePath, now: () => 0, sleep: async () => {},
    fetcher: async () => new Response('no', { status: 404 }),
  });
  assert.equal(rows[0].city, null);
  assert.equal(result.blank, 1);
});

test('psqlEnv splits a connection URI into PG variables, decoding the password', () => {
  assert.deepEqual(
    psqlEnv('postgresql://postgres.abcd:p%40ss%3Aword@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require'),
    {
      PGHOST: 'aws-0-eu-west-1.pooler.supabase.com',
      PGPORT: '6543',
      PGUSER: 'postgres.abcd',
      PGPASSWORD: 'p@ss:word',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    },
  );
});

test('psqlEnv defaults to the local Supabase database, and rejects anything that is not a postgres URI', () => {
  assert.deepEqual(psqlEnv(undefined), {
    PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGPASSWORD: 'postgres', PGDATABASE: 'postgres',
  });
  assert.equal(psqlEnv('').PGPORT, '54322');
  assert.throws(() => psqlEnv('mysql://u:p@h/db'), /postgresql:\/\//);
  assert.throws(() => psqlEnv('not a url'), /valid/);
});
