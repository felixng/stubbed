#!/usr/bin/env node
// Node 24+, no packages. Run with --use-env-proxy in managed environments.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Stubbed/1.0 (https://getstubbed.app; catalogue sync)';
const PAGE_SIZE = 250;
const WEST_END_THEATRES = JSON.parse(await readFile(new URL('./west-end-theatres.json', import.meta.url), 'utf8'));
const VENUES = WEST_END_THEATRES.map(venue => `wd:${venue.id}`).join(' ');
const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>`;

// The West End branch uses the first-performance location, never the location
// of a work's author or publisher. It uses a reviewed list of theatre
// building IDs, verified from Wikidata (see DECISIONS.md). No commercial sites
// are scraped. P1191's P276 qualifier also records premiere venues in Wikidata.
export function candidateQuery(offset, source = 'ibdb') {
  return `${PREFIXES}
SELECT DISTINCT ?item WHERE {
  ${source === 'ibdb' ? '?item wdt:P1219 ?ibdb .' : `
    VALUES ?venue { ${VENUES} }
    { ?item wdt:P4647 ?venue } UNION { ?item p:P1191/pq:P276 ?venue }
  `}
} ORDER BY ?item LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
}

export function detailQuery(ids) {
  if (!ids.every(id => /^Q[1-9]\d*$/.test(id))) throw new Error('Invalid Wikidata ID');
  return `${PREFIXES}
SELECT DISTINCT ?item ?title ?description ?alias ?website ?premiere ?published ?ibdb
                ?opera ?dance ?musical ?play ?excluded WHERE {
  VALUES ?item { ${ids.map(id => `wd:${id}`).join(' ')} }
  OPTIONAL { ?item rdfs:label ?title FILTER(LANG(?title) = "en") }
  OPTIONAL { ?item schema:description ?description FILTER(LANG(?description) = "en") }
  OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "en") }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P1191 ?premiere }
  OPTIONAL { ?item wdt:P577 ?published }
  OPTIONAL { ?item wdt:P1219 ?ibdb }
  BIND(EXISTS { ?item (wdt:P31|wdt:P136)/wdt:P279* wd:Q1344 } AS ?opera)
  BIND(EXISTS { ?item (wdt:P31|wdt:P136)/wdt:P279* wd:Q15079786 }
    || EXISTS { ?item (wdt:P31|wdt:P136)/wdt:P279* ?class . ?class rdfs:label "dance work"@en } AS ?dance)
  BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q58483083 }
    || EXISTS { ?item (wdt:P31|wdt:P136)/wdt:P279* wd:Q2743 } AS ?musical)
  BIND(EXISTS { VALUES ?class { wd:Q7725634 wd:Q116476516 wd:Q25379 }
    ?item wdt:P31/wdt:P279* ?class }
    || EXISTS { VALUES ?genreLabel { "drama"@en "tragedy"@en "comedy"@en "farce"@en }
      ?item wdt:P136 ?genre . ?genre rdfs:label ?genreLabel } AS ?play)
  BIND(EXISTS { VALUES ?class { wd:Q11424 wd:Q482994 wd:Q5398426 wd:Q7366 wd:Q429785 }
    ?item wdt:P31/wdt:P279* ?class } AS ?excluded)
}`;
}

export async function sparql(query, { fetcher = fetch, sleep = delay } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetcher(`${ENDPOINT}?${new URLSearchParams({ query, format: 'json' })}`, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      if (attempt === 4) throw new Error('Wikidata request failed after five attempts');
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const data = await response.json();
      if (!Array.isArray(data?.results?.bindings)) throw new Error('Invalid SPARQL response');
      return data.results.bindings;
    }
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`Wikidata returned HTTP ${response.status}`);
    }
    if (attempt === 4) throw new Error(`Wikidata returned HTTP ${response.status} after five attempts`);
    const retry = response.headers.get('retry-after');
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : null;
    const dateWait = retry && seconds === null ? Date.parse(retry) - Date.now() : 0;
    await sleep(Math.min(120_000, Math.max(1000 * 2 ** attempt, (seconds ?? 0) * 1000, dateWait || 0)));
  }
}

export async function fetchCatalogue({ request = sparql, sleep = delay, onProgress = () => {} } = {}) {
  const ids = new Set();
  // Keep source queries separate: the public endpoint can time out when its
  // optimiser joins the IBDB set with the venue/qualifier UNION.
  for (const source of ['ibdb', 'west-end']) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      await sleep(1000);
      const page = await request(candidateQuery(offset, source));
      onProgress(`${source}: received ${page.length} candidates at offset ${offset}`);
      for (const binding of page) {
        const id = binding.item?.value?.match(/\/entity\/(Q[1-9]\d*)$/)?.[1];
        if (!id) throw new Error('Wikidata returned an invalid candidate ID');
        ids.add(id);
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
  if (!ids.size) throw new Error('Wikidata returned no candidates; refusing an empty sync');
  const bindings = [];
  const list = [...ids].sort();
  for (let i = 0; i < list.length; i += 50) {
    await sleep(1000);
    bindings.push(...await request(detailQuery(list.slice(i, i + 50))));
    onProgress(`Details: ${Math.min(i + 50, list.length)}/${list.length} items`);
  }
  return { head: {}, results: { bindings } };
}

// Keep this in step with public.normalise_show_title; the database's result is
// authoritative for merges and dry runs. This version only deduplicates input.
export function normaliseTitle(title) {
  return title.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s*(\((broadway|west end|the musical|musical|play)\)|[-:–—]?\s*the musical)\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
}

export function mapCatalogue(response) {
  if (!Array.isArray(response?.results?.bindings)) throw new Error('Expected SPARQL results.bindings');
  const grouped = new Map();
  for (const binding of response.results.bindings) {
    const id = binding.item?.value?.match(/^https?:\/\/www.wikidata.org\/entity\/(Q[1-9]\d*)$/)?.[1];
    if (!id) throw new Error('Invalid item URI in Wikidata response');
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(binding);
  }
  const rows = [], skipped = [];
  const sorted = values => [...new Set(values)].sort();
  for (const [id, bindings] of grouped) {
    const values = key => sorted(bindings.map(b => b[key]?.value).filter(Boolean));
    const flag = key => values(key).some(v => v === 'true' || v === '1');
    const title = values('title')[0]?.trim();
    const skip = reason => skipped.push({ wikidata_id: id, title: title ?? id, reason });
    if (!title || title.length > 200 || !normaliseTitle(title)) { skip('missing English title or title longer than 200 characters'); continue; }
    if (flag('excluded')) { skip('film, album, television series, song or poster'); continue; }
    // Work type, not a comedic play's genre. Opera/ballet take precedence over
    // dramatico-musical work, which includes some operas in Wikidata.
    const type = flag('opera') ? 'opera' : flag('dance') ? 'dance'
      : flag('musical') ? 'musical' : flag('play') ? 'play' : 'other';
    const years = key => values(key).map(v => Number(v.match(/^\+?(\d{1,4})-/)?.[1]))
      .filter(year => year >= 1 && year <= 2200);
    const dates = years('premiere');
    const yearsFound = dates.length ? dates : years('published');
    rows.push({ wikidata_id: id, title, type,
      first_performed: yearsFound.length ? Math.min(...yearsFound) : null,
      aliases: values('alias').map(v => v.trim()).filter(v => v && v !== title),
      website: values('website').find(v => /^https?:\/\//.test(v)) ?? null,
      ibdb: values('ibdb').length > 0 });
  }
  // Deterministic winner: IBDB, then oldest known performance, then numeric ID.
  rows.sort((a, b) => Number(b.ibdb) - Number(a.ibdb)
    || (a.first_performed ?? Infinity) - (b.first_performed ?? Infinity)
    || Number(a.wikidata_id.slice(1)) - Number(b.wikidata_id.slice(1)));
  const winners = new Map();
  for (const row of rows) {
    const key = JSON.stringify([normaliseTitle(row.title), row.type]);
    if (winners.has(key)) {
      skipped.push({ wikidata_id: row.wikidata_id, title: row.title,
        reason: `duplicate of ${winners.get(key).wikidata_id}` });
    } else winners.set(key, row);
  }
  return { rows: [...winners.values()].sort((a, b) => a.wikidata_id.localeCompare(b.wikidata_id)), skipped };
}

const literal = value => `'${value.replaceAll("'", "''")}'`;

export function syncSql(rows, dryRun) {
  if (!rows.length) throw new Error('No mapped catalogue rows; refusing an empty sync');
  // Strip metadata: websites are fetched for review but not persisted until
  // artwork has a schema. Identity/verified/creator are set only on INSERT.
  const payload = JSON.stringify(rows.map(({ wikidata_id, title, type, first_performed, aliases }) =>
    ({ wikidata_id, title, type, first_performed, aliases })));
  const incoming = `select * from jsonb_to_recordset(${literal(payload)}::jsonb)
    as x(wikidata_id text, title text, type public.show_type, first_performed smallint, aliases text[])`;
  const counts = `with incoming as (${incoming})
    select json_build_object('added', count(*) filter (where s.id is null),
      'updated', count(*) filter (where s.id is not null and
        (s.title, s.type, s.first_performed, s.aliases) is distinct from
        (i.title, i.type, i.first_performed, i.aliases)),
      'unchanged', count(*) filter (where s.id is not null and
        (s.title, s.type, s.first_performed, s.aliases) is not distinct from
        (i.title, i.type, i.first_performed, i.aliases)))
    from incoming i left join public.shows s using (wikidata_id);`;
  if (dryRun) return `begin transaction isolation level repeatable read read only;
    set local standard_conforming_strings = on;
    set local statement_timeout = '60s';
    ${counts}
    with incoming as (${incoming}), catalogue as (
      select title, type from incoming union all
      select title, type from public.shows s where wikidata_id is not null
        and not exists (select 1 from incoming i where i.wikidata_id = s.wikidata_id)
    ), planned as (
      select s.title, case when count(*) = 1 and bool_and(c.type = s.type)
        then 'merged' else 'ambiguous' end as outcome
      from public.shows s join catalogue c
        on public.normalise_show_title(c.title) = public.normalise_show_title(s.title)
      where s.wikidata_id is null group by s.id, s.title, s.type
    ) select coalesce(json_agg(planned order by title), '[]') from planned;
    commit;`;
  return `begin;
    set local standard_conforming_strings = on;
    set local lock_timeout = '10s';
    set local statement_timeout = '60s';
    lock table public.shows in share row exclusive mode;
    lock table public.entries in share row exclusive mode;
    ${counts}
    insert into public.shows (wikidata_id, title, type, first_performed, aliases, verified, created_by)
      select wikidata_id, title, type, first_performed, aliases, true, null from (${incoming}) i
    on conflict (wikidata_id) do update set title = excluded.title, type = excluded.type,
      first_performed = excluded.first_performed, aliases = excluded.aliases
    where (shows.title, shows.type, shows.first_performed, shows.aliases) is distinct from
      (excluded.title, excluded.type, excluded.first_performed, excluded.aliases);
    select coalesce(json_agg(m order by title), '[]') from public.merge_into_catalogue() m;
    commit;`;
}

export function runPsql(sql) {
  return new Promise((resolve, reject) => {
    // URL is never an argv value or shell interpolation. -X ignores ~/.psqlrc.
    const child = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, PGDATABASE: process.env.SUPABASE_DB_URL
        ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', PGCONNECT_TIMEOUT: '10' },
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000,
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    // psql errors can contain connection credentials or SQL. Don't echo them.
    child.stderr.resume();
    child.on('error', () => reject(new Error('Cannot start psql; install the PostgreSQL client')));
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error('Database operation failed (check connection, privileges and catalogue migration); transaction rolled back'));
        return;
      }
      try { resolve(output.trim().split('\n').map(line => JSON.parse(line))); }
      catch { reject(new Error('Unexpected database response')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
  });
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    'dry-run': { type: 'boolean' }, 'source': { type: 'string' },
    'save-source': { type: 'string' }, 'help': { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node --use-env-proxy supabase/scripts/sync-wikidata.mjs [--dry-run] [--source response.json] [--save-source response.json]\nRequires psql. SUPABASE_DB_URL defaults to local Supabase on port 54322. See supabase/README.md.');
    return;
  }
  const response = values.source ? JSON.parse(await readFile(values.source, 'utf8'))
    : await fetchCatalogue({ onProgress: message => console.error(message) });
  if (values['save-source']) await writeFile(values['save-source'], `${JSON.stringify(response, null, 2)}\n`, { flag: 'wx' });
  const { rows, skipped } = mapCatalogue(response);
  const [counts, outcomes] = await runPsql(syncSql(rows, values['dry-run']));
  console.log(JSON.stringify({ dry_run: Boolean(values['dry-run']), ...counts,
    merged: outcomes.filter(row => row.outcome === 'merged').length,
    ambiguous: outcomes.filter(row => row.outcome === 'ambiguous').map(row => row.title),
    skipped, websites_found: rows.filter(row => row.website).length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
