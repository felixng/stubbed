#!/usr/bin/env node
// Node 24+, no packages. Run with --use-env-proxy in managed environments.
//
// Loads every named theatre in the UK and US from OpenStreetMap (through
// QLever's public SPARQL endpoint) into public.venues, so photo detection can
// answer from Postgres (#343). West End and Broadway houses are labelled from
// the reviewed Wikidata lists next to this file. The import rules live in
// public.load_osm_venues (see supabase/migrations/*_venue_catalogue.sql);
// this script fetches, tidies and calls it. OpenStreetMap data is ODbL; the
// attribution is in the terms (docs/DECISIONS.md, 2026-11-03).
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const QLEVER = 'https://qlever.dev/api/osm-planet';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'Stubbed/1.0 (https://getstubbed.app; venue sync)';
const COUNTRIES = { GB: 'osmrel:62149', US: 'osmrel:148838' };
const NOMINATIM_GAP_MS = 1100;

const reviewed = async name =>
  new Set(JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), 'utf8')).map(row => row.id));
const WEST_END = await reviewed('west-end-theatres.json');
const BROADWAY = await reviewed('broadway-theatres.json');

export function venueQuery(relation) {
  return `PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
SELECT ?osm ?name ?name_en ?lat ?lng ?city ?wikidata ?website WHERE {
  ${relation} ogc:sfContains ?osm .
  ?osm osmkey:amenity "theatre" ; osmkey:name ?name ; geo:hasGeometry/geo:asWKT ?wkt .
  BIND(geof:centroid(?wkt) AS ?c) BIND(geof:latitude(?c) AS ?lat) BIND(geof:longitude(?c) AS ?lng)
  OPTIONAL { ?osm osmkey:name:en ?name_en } OPTIONAL { ?osm osmkey:addr:city ?city }
  OPTIONAL { ?osm osmkey:wikidata ?wikidata } OPTIONAL { ?osm osmkey:website ?website }
}`;
}

// GET or POST with retries and backoff on 429 and 5xx.
async function request(url, init, label, { fetcher = fetch, sleep = delay } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetcher(url, { ...init, signal: AbortSignal.timeout(120_000) });
    } catch {
      if (attempt === 4) throw new Error(`${label} request failed after five attempts`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500) throw new Error(`${label} returned HTTP ${response.status}`);
    if (attempt === 4) throw new Error(`${label} returned HTTP ${response.status} after five attempts`);
    const retry = response.headers.get('retry-after');
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 0;
    await sleep(Math.min(120_000, Math.max(1000 * 2 ** attempt, seconds * 1000)));
  }
}

export async function fetchBindings(country, options = {}) {
  const response = await request(QLEVER, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ query: venueQuery(COUNTRIES[country]) }),
  }, `QLever (${country})`, options);
  const data = await response.json();
  if (!Array.isArray(data?.results?.bindings)) throw new Error('Invalid SPARQL response from QLever');
  return data.results.bindings;
}

const round7 = n => Math.round(n * 1e7) / 1e7;

export function mapRows(bindings, country) {
  const rows = [];
  for (const binding of bindings) {
    const value = key => binding[key]?.value;
    const parts = (value('osm') ?? '').split('/');
    const osm_id = `${parts.at(-2)}/${parts.at(-1)}`;
    if (!/^(node|way|relation)\/[0-9]+$/.test(osm_id)) continue;
    const name = (value('name_en') ?? value('name') ?? '').trim();
    if (!name || name.length > 200) continue;
    const lat = Number(value('lat'));
    const lng = Number(value('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const city = value('city')?.trim();
    const wikidata = value('wikidata')?.trim();
    const website = value('website')?.trim();
    const wikidata_id = wikidata && /^Q[1-9][0-9]*$/.test(wikidata) ? wikidata : null;
    rows.push({
      osm_id,
      name,
      city: city && city.length <= 100 ? city : null,
      country,
      lat: round7(lat),
      lng: round7(lng),
      wikidata_id,
      website: website && website.startsWith('http') && website.length <= 500 ? website : null,
      circuit: wikidata_id && WEST_END.has(wikidata_id) ? 'west_end' : wikidata_id && BROADWAY.has(wikidata_id) ? 'broadway' : null,
    });
  }
  return rows;
}

// Lower case, letters and digits only, "theater" as "theatre": the name key
// that finds the same theatre written two ways.
export function nameKey(name) {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replaceAll('theater', 'theatre').replace(/[^a-z0-9]/g, '');
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const r = degrees => (degrees * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

const TYPE_RANK = { relation: 0, way: 1, node: 2 };
const osmParts = id => { const [type, number] = id.split('/'); return { type, number: Number(number) }; };

// One row per osm_id, per wikidata_id, and per pair with the same name key
// under 100 m apart. Among duplicates keep the row with a circuit, then a
// wikidata_id, then relation over way over node, then the smaller osm_id.
export function dedupe(rows) {
  const preferred = [...rows].sort((a, b) => {
    const x = osmParts(a.osm_id), y = osmParts(b.osm_id);
    return Number(b.circuit !== null) - Number(a.circuit !== null)
      || Number(b.wikidata_id !== null) - Number(a.wikidata_id !== null)
      || TYPE_RANK[x.type] - TYPE_RANK[y.type]
      || x.number - y.number;
  });
  const seenIds = new Set(), seenWikidata = new Set(), byKey = new Map(), kept = [];
  for (const row of preferred) {
    if (seenIds.has(row.osm_id)) continue;
    if (row.wikidata_id && seenWikidata.has(row.wikidata_id)) continue;
    const key = nameKey(row.name);
    const twins = byKey.get(key) ?? [];
    if (twins.some(other => distanceMeters(row.lat, row.lng, other.lat, other.lng) < 100)) continue;
    seenIds.add(row.osm_id);
    if (row.wikidata_id) seenWikidata.add(row.wikidata_id);
    byKey.set(key, [...twins, row]);
    kept.push(row);
  }
  return kept.sort((a, b) => a.osm_id.localeCompare(b.osm_id));
}

// Keep this in step with parseNominatim in apps/web/src/lib/places.ts.
export function parseNominatim(json) {
  const a = json?.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;
  return { city, country: a.country_code ? a.country_code.toUpperCase() : null };
}

const cityKey = row => `${row.lat.toFixed(2)},${row.lng.toFixed(2)}`;

// Fills a missing city from Nominatim, one lookup per ~1 km square, at most
// one a second, saving the cache after every lookup so a stopped run resumes.
export async function fillCities(rows, { cachePath, fetcher = fetch, sleep = delay, now = Date.now, onProgress = () => {} } = {}) {
  let cache = {};
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')); } catch { /* first run */ }
  let looked = 0, cached = 0, lastCall = 0;
  const pending = rows.filter(row => !row.city);
  for (const row of pending) {
    const key = cityKey(row);
    if (!(key in cache)) {
      const wait = lastCall + NOMINATIM_GAP_MS - now();
      if (wait > 0) await sleep(wait);
      lastCall = now();
      try {
        const url = `${NOMINATIM}?${new URLSearchParams({ format: 'jsonv2', zoom: '10', 'accept-language': 'en', lat: String(row.lat), lon: String(row.lng) })}`;
        const response = await request(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }, 'Nominatim', { fetcher, sleep });
        const city = parseNominatim(await response.json()).city;
        cache[key] = city && city.length <= 100 ? city : null;
        await writeFile(cachePath, JSON.stringify(cache));
      } catch {
        continue; // leave this one blank; the next run tries again
      }
      looked += 1;
      if (looked % 100 === 0) onProgress(`Cities: ${looked} looked up`);
    } else cached += 1;
    if (cache[key]) row.city = cache[key];
  }
  return { looked, cached, blank: pending.filter(row => !row.city).length };
}

const DELIMITER = '$stubbed$';

export function loadSql(rows, dryRun) {
  const json = JSON.stringify(rows);
  if (json.includes(DELIMITER)) throw new Error(`Refusing to load: the data contains ${DELIMITER}`);
  return `begin;
    set local standard_conforming_strings = on;
    set local lock_timeout = '10s';
    set local statement_timeout = '300s';
    select to_jsonb(t) from public.load_osm_venues(${DELIMITER}${json}${DELIMITER}::jsonb) t;
    ${dryRun ? 'rollback' : 'commit'};`;
}

export function parsePsqlOutput(output) {
  return output.split('\n').filter(record => record.trim()).map(record => JSON.parse(record));
}

export function runPsql(sql) {
  return new Promise((resolve, reject) => {
    // The URL is never an argv value or shell interpolation. -X ignores ~/.psqlrc.
    const child = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, PGDATABASE: process.env.SUPABASE_DB_URL
        ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', PGCONNECT_TIMEOUT: '10' },
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000,
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    // psql errors can contain connection credentials or SQL. Don't echo them.
    child.stderr.resume();
    child.on('error', () => reject(new Error('Cannot start psql; install the PostgreSQL client')));
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error('Database operation failed (check connection, privileges and the venue catalogue migration); transaction rolled back'));
        return;
      }
      try { resolve(parsePsqlOutput(output)); }
      catch { reject(new Error('Unexpected database response')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
  });
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    country: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean' },
    source: { type: 'string' }, 'save-source': { type: 'string' },
    'skip-cities': { type: 'boolean' }, 'city-cache': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node --use-env-proxy supabase/scripts/sync-osm-venues.mjs [--country GB|US]... [--dry-run] [--skip-cities] [--city-cache file] [--source file] [--save-source file]\nRequires psql. SUPABASE_DB_URL defaults to local Supabase on port 54322. See supabase/README.md.');
    return;
  }
  const countries = values.country?.length ? values.country : Object.keys(COUNTRIES);
  for (const country of countries) if (!COUNTRIES[country]) throw new Error(`Unknown country ${country}; use GB or US`);

  const source = values.source ? JSON.parse(await readFile(values.source, 'utf8')) : {};
  for (const country of countries) {
    if (!source[country]) source[country] = await fetchBindings(country);
    console.error(`${country}: ${source[country].length} theatres fetched`);
  }
  if (values['save-source']) await writeFile(values['save-source'], `${JSON.stringify(source)}\n`, { flag: 'wx' });

  const fetched = Object.fromEntries(countries.map(country => [country, source[country].length]));
  const rows = dedupe(countries.flatMap(country => mapRows(source[country], country)));
  let cities = null;
  if (!values['skip-cities']) {
    cities = await fillCities(rows, {
      cachePath: values['city-cache'] ?? join(tmpdir(), 'stubbed-osm-cities.json'),
      onProgress: message => console.error(message),
    });
  }
  const [counts] = await runPsql(loadSql(rows, values['dry-run']));
  const missing = list => [...list].filter(id => !rows.some(row => row.wikidata_id === id));
  console.log(JSON.stringify({
    dry_run: Boolean(values['dry-run']), fetched, after_dedupe: rows.length, cities, ...counts,
    reviewed_without_osm_row: {
      west_end: countries.includes('GB') ? missing(WEST_END) : [],
      broadway: countries.includes('US') ? missing(BROADWAY) : [],
    },
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
