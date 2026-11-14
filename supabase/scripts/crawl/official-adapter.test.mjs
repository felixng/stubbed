import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { official, previousState } from './sources/official.mjs';

const read = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const rules = JSON.parse(readFileSync(new URL('./almeida-rules.json', import.meta.url), 'utf8'));
const context = over => ({
  siteId: 'site-1', whatsOnUrl: 'https://almeida.test/whats-on/', archiveUrl: 'https://almeida.test/archive/',
  rules, ruleId: 'rule-1', venues: [{ id: 'venue-1', name: 'Almeida Theatre' }],
  allowedHosts: ['almeida.test', 'www.almeida.test'], previous: null, ...over,
});
const parse = (url, html, ctx) => official.parsers.venue({ url, html, context: ctx });

test('a structured-data page with no rules gives official findings with the context venues', async () => {
  const venues = [{ id: 'oli', name: 'Olivier' }, { id: 'lyt', name: 'Lyttelton' }];
  const result = await parse('https://nt.test/whats-on/', read('nt-jsonld.html'),
    context({ rules: null, ruleId: null, venues, whatsOnUrl: 'https://nt.test/whats-on/', archiveUrl: null, allowedHosts: ['nt.test', 'www.nt.test'] }));
  assert.deepEqual(result.children, []);
  assert.ok(result.observations.every(row => row.observation_kind === 'official_finding' && row.page_type === 'whats_on'));
  assert.deepEqual(result.observations.slice(0, 2).map(row => [row.raw_title, row.venue_id]), [['Example Play', 'oli'], ['Example Musical', 'lyt']]);
});

test('a rules page gives findings through the rules reader', async () => {
  const result = await parse('https://almeida.test/archive/', read('almeida-archive.html'), context());
  assert.equal(result.observations.length, 5);
  assert.ok(result.observations.every(row => row.method === 'rules' && row.rule_id === 'rule-1' && row.page_type === 'archive'));
  assert.equal(result.observations[0].raw_title, 'The Years');
});

test('an archive page gives its next link as a venue child; a what\'s-on page gives none', async () => {
  const withNext = read('almeida-archive.html') + '<a class="next page-numbers" href="/archive/page/3/">Next</a>';
  const archive = await parse('https://almeida.test/archive/', withNext, context());
  assert.deepEqual(archive.children, [{ stage: 'venue', url: 'https://almeida.test/archive/page/3/' }]);
  const whatsOn = await parse('https://almeida.test/whats-on/', withNext, context());
  assert.deepEqual(whatsOn.children, []);
  assert.ok(whatsOn.observations.every(row => row.page_type === 'whats_on'));
});

test('rules but no findings fails at once, without the retry ladder', async () => {
  const result = await parse('https://almeida.test/archive/', '<main>Nothing here</main>', context());
  assert.equal(result.status, 'invalid');
  assert.match(result.reason, /^extraction: no_findings/);
  assert.equal(result.retry, false);
});

test('a page without rules or structured data is an empty success, not a failure', async () => {
  const result = await parse('https://almeida.test/whats-on/', '<main>Nothing here</main>', context({ rules: null, ruleId: null }));
  assert.deepEqual(result, { children: [], observations: [] });
});

test('the previous extraction feeds the health checks', async () => {
  const first = await parse('https://almeida.test/archive/', read('almeida-archive.html'), context());
  const previous = previousState(first.observations);
  assert.deepEqual([previous.result_count, previous.readable_share, previous.type], [5, 1, 'archive']);
  assert.equal(previous.titles[0], 'the years');
  const half = read('almeida-archive.html').split('<div class="c-event-card">').slice(0, 3).join('<div class="c-event-card">');
  const second = await parse('https://almeida.test/archive/', half, context({ previous }));
  assert.equal(second.status, 'invalid');
  assert.match(second.reason, /results_dropped/);
  assert.equal(previousState(null), null);
});
