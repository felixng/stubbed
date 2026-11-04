import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createFetcher, isAllowed, parseRobots, siteKey, USER_AGENT } from './fetch.mjs';
import { groupBySite, crawlSites } from './index.mjs';
import { cleanFinding, insertFindingsSql, jsonLiteral, uuidLiteral } from './load.mjs';
import { extractTitle, readPage, stubReader } from './readers.mjs';
import { renderReport, summarise } from './report.mjs';

const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const html = (body, { status = 200, type = 'text/html; charset=utf-8', headers = {}, url } = {}) => {
  const res = new Response(status === 304 ? null : body, { status, headers: { 'content-type': type, ...headers } });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
};

test('parseRobots: our agent beats *, longest rule wins, allow wins ties', () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: Stubbed\nDisallow: /private\nAllow: /private/open\nCrawl-delay: 5\n`);
  assert.equal(rules.crawlDelay, 5);
  assert.equal(isAllowed(rules, '/whats-on'), true);
  assert.equal(isAllowed(rules, '/private/x'), false);
  assert.equal(isAllowed(rules, '/private/open/x'), true);
  const star = parseRobots('User-agent: *\nDisallow: /a*b$\nAllow: /a');
  assert.equal(isAllowed(star, '/axb'), false);
  assert.equal(isAllowed(star, '/axbc'), true);
  assert.equal(isAllowed(parseRobots(''), '/anything'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), '/anything'), true);
});

test('siteKey: http(s) only, no fragment', () => {
  assert.equal(siteKey('https://a.test/whats-on#top'), 'https://a.test/whats-on');
  assert.equal(siteKey('ftp://a.test/x'), null);
  assert.equal(siteKey('nonsense'), null);
});

test('fetcher: sends the User-Agent, reads robots.txt first, and spaces requests per host', async () => {
  const calls = [];
  const sleeps = [];
  let t = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, ua: init.headers['User-Agent'] });
    return url.endsWith('/robots.txt') ? html('User-agent: *\nDisallow: /secret', { type: 'text/plain' }) : html('<title>Hi</title>');
  };
  const fetchPage = createFetcher({ fetchFn, minDelayMs: 1000, sleep: async ms => { sleeps.push(ms); t += ms; }, now: () => t });
  const a = await fetchPage('https://a.test/whats-on');
  const b = await fetchPage('https://a.test/other');
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  assert.deepEqual(calls.map(c => c.url), ['https://a.test/robots.txt', 'https://a.test/whats-on', 'https://a.test/other']);
  assert.ok(calls.every(c => c.ua === USER_AGENT));
  assert.equal(sleeps.length, 2, 'waited between the three requests');
  assert.ok(sleeps.every(ms => ms > 0 && ms <= 1000));
  assert.equal((await fetchPage('https://a.test/secret')).status, 'blocked');
});

test('fetcher: blocked, failed, unchanged and off-site answers are statuses, not throws', async () => {
  const answer = (path, res) => async url => (url.endsWith('/robots.txt') ? html('', { status: 404 }) : res(path));
  const run = async res => createFetcher({ fetchFn: answer('', res), minDelayMs: 0 })('https://a.test/x');
  assert.equal((await run(() => html('', { status: 403 }))).status, 'blocked');
  assert.equal((await run(() => html('', { status: 429 }))).status, 'blocked');
  assert.equal((await run(() => html('', { status: 500 }))).status, 'failed');
  assert.equal((await run(() => html('', { status: 304 }))).status, 'not_modified');
  assert.equal((await run(() => html('x', { type: 'image/png' }))).status, 'failed');
  assert.equal((await run(() => html('x', { url: 'https://other.test/x' }))).status, 'failed');
  assert.equal((await run(() => { throw new Error('socket hang up'); })).status, 'failed');
  assert.equal((await createFetcher({ fetchFn: async () => html('', { status: 403 }), minDelayMs: 0 })('https://a.test/x')).status, 'blocked', 'a forbidden robots.txt blocks the site');
  assert.equal((await createFetcher()('not a url')).status, 'failed');
});

test('fetcher: remembers ETag and sends it back', async () => {
  const cache = {};
  const seen = [];
  const fetchFn = async (url, init) => {
    if (url.endsWith('/robots.txt')) return html('', { status: 404 });
    seen.push(init.headers['If-None-Match']);
    return init.headers['If-None-Match'] ? html('', { status: 304 }) : html('<title>x</title>', { headers: { etag: '"v1"' } });
  };
  const fetchPage = createFetcher({ fetchFn, minDelayMs: 0, cache });
  assert.equal((await fetchPage('https://a.test/p')).status, 'ok');
  assert.equal((await fetchPage('https://a.test/p')).status, 'not_modified');
  assert.deepEqual(seen, [undefined, '"v1"']);
});

test('groupBySite: one fetch per URL, however many theatres share it', () => {
  const { sites, skipped } = groupBySite([
    { id: '1', name: 'Olivier', whats_on_url: 'https://nt.test/whats-on#x' },
    { id: '2', name: 'Lyttelton', whats_on_url: 'https://nt.test/whats-on' },
    { id: '3', name: 'Soho', whats_on_url: 'https://soho.test/' },
    { id: '4', name: 'No link', whats_on_url: null },
    { id: '5', name: 'Bad link', whats_on_url: 'ftp://x' },
  ]);
  assert.deepEqual(sites.map(s => [s.url, s.venues.map(v => v.id)]), [['https://nt.test/whats-on', ['1', '2']], ['https://soho.test/', ['3']]]);
  assert.deepEqual(skipped.map(v => v.id), ['4', '5']);
});

test('stub reader: title with entities, venue only when the site has one', async () => {
  const soho = await fixture('soho-theatre.html');
  assert.equal(extractTitle(soho), "What's On & Tickets | Soho Theatre London");
  assert.equal(extractTitle(await fixture('national-theatre.html')), 'Whats On at the National Theatre');
  assert.equal(extractTitle(await fixture('no-title.html')), '');
  const [one] = readPage({ url: 'https://soho.test/', html: soho }, { venues: [{ id: 'v1' }] });
  assert.deepEqual([one.venue_id, one.method, one.confidence, one.start_date], ['v1', 'stub', 0, null]);
  const [shared] = readPage({ url: 'https://nt.test/', html: await fixture('national-theatre.html') }, { venues: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  assert.equal(shared.venue_id, null);
  assert.equal(readPage({ url: 'u', html: '' }, { venues: [] }, [() => null])?.length, 0, 'no reader answered: no findings');
  assert.equal(stubReader({ url: 'u', html: '' }, { venues: [] })[0].raw_title, '(no title)');
});

test('crawlSites: a blocked or failing site does not stop the run', async () => {
  const sites = [
    { url: 'https://ok.test/', venues: [{ id: '1', name: 'Ok' }] },
    { url: 'https://blocked.test/', venues: [{ id: '2', name: 'Blocked' }] },
    { url: 'https://store-fails.test/', venues: [{ id: '3', name: 'Store fails' }] },
    { url: 'https://ok2.test/', venues: [{ id: '4', name: 'Ok too' }] },
  ];
  const fetchPage = async url => (url.includes('blocked') ? { status: 'blocked', error: 'Disallowed by robots.txt' } : { status: 'ok', html: '<title>T</title>' });
  const stored = [];
  const results = await crawlSites({
    sites, fetchPage,
    load: async (url, findings) => { if (url.includes('store-fails')) throw new Error('boom'); stored.push([url, findings.length]); },
  });
  assert.deepEqual(results.map(r => r.status), ['ok', 'blocked', 'failed', 'ok']);
  assert.deepEqual(stored, [['https://ok.test/', 1], ['https://ok2.test/', 1]]);
  assert.equal(results[1].error, 'Disallowed by robots.txt');
  const dry = await crawlSites({ sites: sites.slice(0, 1), fetchPage, load: null });
  assert.equal(dry[0].findings, 1, 'a dry run reads but stores nothing');
});

test('load: findings are clipped and checked; SQL literals are safe', () => {
  const f = cleanFinding({ raw_title: 'x'.repeat(400), kind: 'weird', method: 'guess', confidence: 7, evidence: 'e'.repeat(500), venue_id: undefined }, 'https://a.test/');
  assert.equal(f.raw_title.length, 300);
  assert.deepEqual([f.kind, f.method, f.confidence, f.evidence.length, f.venue_id, f.source_url], ['other', 'stub', 1, 400, null, 'https://a.test/']);
  const nasty = [{ t: "$j1$ '); drop table x; --" }];
  const literal = jsonLiteral(nasty);
  const tag = /^\$(\w+)\$/.exec(literal)[1];
  assert.ok(!JSON.stringify(nasty).includes(`$${tag}$`), 'the quote tag cannot appear in the payload');
  assert.throws(() => uuidLiteral("x'; drop table y; --"));
  assert.equal(uuidLiteral('c0000000-0000-0000-0000-000000000001'), "'c0000000-0000-0000-0000-000000000001'::uuid");
  const sql = insertFindingsSql('c0000000-0000-0000-0000-000000000001', [f]);
  assert.ok(sql.startsWith('begin;') && sql.trim().endsWith('commit;'));
});

test('report: lists each site and how it was read', () => {
  const sites = [
    { url: 'https://a.test/', venues: [{ id: '1', name: 'A Theatre' }], status: 'ok', findings: 1, methods: ['stub'] },
    { url: 'https://b.test/', venues: [{ id: '2', name: 'B Theatre' }, { id: '3', name: 'B Studio' }], status: 'blocked', error: 'Disallowed by robots.txt', findings: 0, methods: [] },
  ];
  const text = renderReport({ run: { id: 'r1', method: 'rules', skipped_venues: [{ id: '9', name: 'No Link' }] }, sites });
  assert.match(text, /2 sites: 1 read, 1 not read\. 1 finding\./);
  assert.match(text, /B Theatre, B Studio \| blocked \(Disallowed by robots\.txt\)/);
  assert.match(text, /Skipped \(no what's-on link\): No Link/);
  assert.match(renderReport({ run: null, sites: [], dryRun: true }), /dry run/);
  assert.deepEqual(summarise(sites, [{ id: '9' }]).skipped_venues, ['9']);
  assert.equal(summarise(sites).findings, 1);
});

test('db: the connection goes in PG* variables', async () => {
  const { connectionEnv } = await import('./db.mjs');
  assert.deepEqual(connectionEnv('postgresql://me:p%40ss@db.example.com:6543/app?sslmode=require'),
    { PGHOST: 'db.example.com', PGPORT: '6543', PGUSER: 'me', PGPASSWORD: 'p@ss', PGDATABASE: 'app', PGCONNECT_TIMEOUT: '10', PGSSLMODE: 'require' });
  assert.equal(connectionEnv().PGPORT, '54322');
});
