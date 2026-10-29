import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapCatalogue, normaliseTitle, sparql, fetchCatalogue, syncSql, detailQuery } from './sync-wikidata.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/mapping.json', import.meta.url)));

test('maps captured live Wikidata statements for real musicals and plays', async () => {
  const live = JSON.parse(await readFile(new URL('./fixtures/wikidata-live.json', import.meta.url)));
  const { rows, skipped } = mapCatalogue(live);
  assert.deepEqual(rows.map(({ title, type, first_performed }) => ({ title, type, first_performed })), [
    { title: 'By Jeeves', type: 'musical', first_performed: 1975 },
    { title: 'Bye Bye Birdie', type: 'musical', first_performed: 1960 },
    { title: 'Cabaret', type: 'musical', first_performed: 1966 },
    { title: 'The Goat, or Who Is Sylvia?', type: 'play', first_performed: 2002 },
    { title: 'Carousel', type: 'musical', first_performed: 1945 },
  ]);
  assert.deepEqual(rows[0].aliases, ['Jeeves']);
  assert.equal(skipped.length, 2);
});

test('maps work types, dates, aliases, websites and skips non-theatre items', () => {
  const { rows, skipped } = mapCatalogue(fixture);
  const musical = rows.find(row => row.wikidata_id === 'Q830581');
  assert.equal(musical.type, 'musical');
  assert.equal(musical.first_performed, 1980);
  assert.deepEqual(musical.aliases, ['Les Mis', 'Les Miz']);
  assert.equal(musical.website, 'https://www.lesmis.com/');
  assert.equal(rows.find(row => row.wikidata_id === 'Q100001').type, 'opera');
  assert.equal(rows.find(row => row.wikidata_id === 'Q100002').type, 'dance');
  assert.equal(rows.find(row => row.wikidata_id === 'Q100003').type, 'play');
  assert.equal(rows.find(row => row.wikidata_id === 'Q100004').type, 'other');
  assert.equal(rows.find(row => row.wikidata_id === 'Q100003').first_performed, 1950);
  assert.equal(rows.find(row => row.wikidata_id === 'Q100004').first_performed, null);
  assert.equal(skipped.filter(row => row.reason.startsWith('film')).length, 2);
  assert.equal(skipped.filter(row => row.reason.startsWith('missing English')).length, 1);
  assert.equal(skipped.find(row => row.wikidata_id === 'Q111905785').reason, 'duplicate of Q830581');
});

test('duplicate preference is IBDB, then oldest known year, then numeric ID', () => {
  const base = { title: { value: 'Example' }, musical: { value: 'true' } };
  const item = (id, extra = {}) => ({ ...base, item: { value: `http://www.wikidata.org/entity/${id}` }, ...extra });
  const response = bindings => ({ results: { bindings } });
  const input = [item('Q10'), item('Q2'), item('Q30', { premiere: { value: '1900-01-01T00:00:00Z' } })];
  assert.equal(mapCatalogue(response(input)).rows[0].wikidata_id, 'Q30');
  input.push(item('Q40', { ibdb: { value: '123' } }));
  assert.equal(mapCatalogue(response(input)).rows[0].wikidata_id, 'Q40');
  assert.equal(mapCatalogue(response(input.slice(0, 2))).rows[0].wikidata_id, 'Q2');
  assert.deepEqual(mapCatalogue(response(input)), mapCatalogue(response(input.toReversed())));
});

test('normalisation handles documented accents, suffixes, articles and whitespace', () => {
  for (const title of [' The Les Misérables ', 'Les Miserables (Broadway)', 'Les Miserables: The Musical']) {
    assert.equal(normaliseTitle(title), 'les miserables');
  }
  assert.equal(normaliseTitle('The Importance of Being Earnest'), 'importance of being earnest');
  assert.equal(normaliseTitle('A  New\tShow'), 'a new show');
});

test('malformed responses fail rather than silently syncing partial garbage', () => {
  assert.throws(() => mapCatalogue({}), /bindings/);
  assert.throws(() => mapCatalogue({ results: { bindings: [{ item: { value: "Q1');drop table shows;" } }] } }), /URI/);
  assert.throws(() => detailQuery(['Q1 }']), /Invalid/);
  assert.throws(() => syncSql([], true), /empty/);
});

test('SPARQL retries 429/5xx sequentially, honours Retry-After and sends identification', async () => {
  const waits = [], requests = [];
  const statuses = [429, 503, 200];
  const result = await sparql('SELECT ?item WHERE {}', {
    sleep: async ms => waits.push(ms),
    fetcher: async (url, options) => {
      requests.push({ url, options });
      const status = statuses.shift();
      return new Response(JSON.stringify({ results: { bindings: [{ item: 'ok' }] } }), {
        status, headers: { 'Retry-After': '3' },
      });
    },
  });
  assert.deepEqual(result, [{ item: 'ok' }]);
  assert.deepEqual(waits, [3000, 3000]);
  assert.equal(requests.length, 3);
  assert.match(requests[0].options.headers['User-Agent'], /Stubbed.*getstubbed.app/);
  await assert.rejects(sparql('bad', { fetcher: async () => new Response('', { status: 400 }) }), /HTTP 400/);
});

test('fetches candidate pages before details and refuses an empty catalogue', async () => {
  const calls = [];
  const response = await fetchCatalogue({ sleep: async () => {}, request: async query => {
    calls.push(query);
    if (query.includes('SELECT DISTINCT ?item WHERE')) return [{ item: { value: 'http://www.wikidata.org/entity/Q830581' } }];
    return fixture.results.bindings.slice(0, 1);
  } });
  assert.equal(calls.length, 3);
  assert.match(calls[0], /P1219/);
  assert.match(calls[1], /P4647/);
  assert.doesNotMatch(calls[0], /P1218/);
  assert.match(calls[2], /VALUES \?item \{ wd:Q830581 \}/);
  assert.equal(response.results.bindings.length, 1);
  await assert.rejects(fetchCatalogue({ request: async () => [], sleep: async () => {} }), /no candidates/);
});

test('dry run uses a read-only transaction; write is atomic and only refreshes owned fields', () => {
  const { rows } = mapCatalogue(fixture);
  const preview = syncSql(rows, true);
  assert.match(preview, /read only/);
  assert.doesNotMatch(preview, /insert into|update set|delete from/i);
  const sql = syncSql(rows, false);
  assert.match(sql, /^begin;/);
  assert.match(sql, /on conflict \(wikidata_id\) do update/);
  const updates = sql.split('do update set')[1].split('where')[0];
  assert.doesNotMatch(updates, /verified|created_by|website|ibdb/);
  assert.match(sql, /merge_into_catalogue/);
  assert.match(sql, /commit;$/);
});
