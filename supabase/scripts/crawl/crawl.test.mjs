import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createFetcher, siteKey, USER_AGENT } from './fetch.mjs';
import { groupBySite, crawlSites } from './index.mjs';
import { cleanFinding, insertFindingsSql, jsonLiteral, uuidLiteral } from './load.mjs';
import { extractTitle, readPage, stubReader } from './readers.mjs';
import { DEFAULT_PROMPT, MODEL_PRICES, costUsd, eventsFromJsonLd, explicitDateText, findingsFromModel, isoDate, jsonLdBlocks, matchStage, modelReader, pageText, plausibleDate, structuredReader } from './sources/theatre-site.mjs';
import { READERS } from './index.mjs';
import { renderReport, summarise } from './report.mjs';

const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const html = (body, { status = 200, type = 'text/html; charset=utf-8', headers = {}, url } = {}) => {
  const res = new Response(status === 304 ? null : body, { status, headers: { 'content-type': type, ...headers } });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
};

test('siteKey: http(s) only, no fragment', () => {
  assert.equal(siteKey('https://a.test/whats-on#top'), 'https://a.test/whats-on');
  assert.equal(siteKey('ftp://a.test/x'), null);
  assert.equal(siteKey('nonsense'), null);
});

test('fetcher: requests pages directly without robots.txt and spaces requests per host', async () => {
  const calls = [];
  const sleeps = [];
  let t = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, ua: init.headers['User-Agent'] });
    return html('<title>Hi</title>');
  };
  const fetchPage = createFetcher({ fetchFn, minDelayMs: 1000, sleep: async ms => { sleeps.push(ms); t += ms; }, now: () => t });
  const a = await fetchPage('https://a.test/whats-on');
  const b = await fetchPage('https://a.test/other');
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  assert.deepEqual(calls.map(c => c.url), ['https://a.test/whats-on', 'https://a.test/other']);
  assert.ok(calls.every(c => c.ua === USER_AGENT));
  assert.deepEqual(sleeps, [1000]);
});

test('fetcher: blocked, failed, unchanged and off-site answers are statuses, not throws', async () => {
  const run = async fetchFn => createFetcher({ fetchFn, minDelayMs: 0 })('https://a.test/x');
  assert.deepEqual(await run(() => html('', { status: 401 })), { status: 'blocked', error: 'The site answered 401' });
  assert.equal((await run(() => html('', { status: 403 }))).status, 'blocked');
  assert.equal((await run(() => html('', { status: 429 }))).status, 'blocked');
  assert.equal((await run(() => html('', { status: 500 }))).status, 'failed');
  assert.equal((await run(() => html('', { status: 304 }))).status, 'not_modified');
  assert.equal((await run(() => html('x', { type: 'image/png' }))).status, 'failed');
  assert.equal((await run(() => html('x', { url: 'https://other.test/x' }))).status, 'failed');
  assert.equal((await run(() => { throw new Error('socket hang up'); })).status, 'failed');
  assert.equal((await createFetcher()('not a url')).status, 'failed');
});

test('fetcher: remembers ETag and sends it back', async () => {
  const cache = {};
  const seen = [];
  const fetchFn = async (_url, init) => {
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
  const [one] = await readPage({ url: 'https://soho.test/', html: soho }, { venues: [{ id: 'v1' }] });
  assert.deepEqual([one.venue_id, one.method, one.confidence, one.start_date], ['v1', 'stub', 0, null]);
  const [shared] = await readPage({ url: 'https://nt.test/', html: await fixture('national-theatre.html') }, { venues: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  assert.equal(shared.venue_id, null);
  assert.equal((await readPage({ url: 'u', html: '' }, { venues: [] }, [() => null])).length, 0, 'no reader answered: no findings');
  assert.equal(stubReader({ url: 'u', html: '' }, { venues: [] })[0].raw_title, '(no title)');
});

test('crawlSites: a blocked or failing site does not stop the run', async () => {
  const sites = [
    { url: 'https://ok.test/', venues: [{ id: '1', name: 'Ok' }] },
    { url: 'https://blocked.test/', venues: [{ id: '2', name: 'Blocked' }] },
    { url: 'https://store-fails.test/', venues: [{ id: '3', name: 'Store fails' }] },
    { url: 'https://ok2.test/', venues: [{ id: '4', name: 'Ok too' }] },
  ];
  const fetchPage = async url => (url.includes('blocked') ? { status: 'blocked', error: 'The site answered 403' } : { status: 'ok', html: '<title>T</title>' });
  const stored = [];
  const results = await crawlSites({
    sites, fetchPage,
    load: async (url, findings) => { if (url.includes('store-fails')) throw new Error('boom'); stored.push([url, findings.length]); },
  });
  assert.deepEqual(results.map(r => r.status), ['ok', 'blocked', 'failed', 'ok']);
  assert.deepEqual(stored, [['https://ok.test/', 1], ['https://ok2.test/', 1]]);
  assert.equal(results[1].error, 'The site answered 403');
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
    { url: 'https://b.test/', venues: [{ id: '2', name: 'B Theatre' }, { id: '3', name: 'B Studio' }], status: 'blocked', error: 'The site answered 403', findings: 0, methods: [] },
  ];
  const text = renderReport({ run: { id: 'r1', method: 'rules', skipped_venues: [{ id: '9', name: 'No Link' }] }, sites });
  assert.match(text, /2 sites: 1 read, 1 not read\. 1 finding\./);
  assert.match(text, /B Theatre, B Studio \| blocked \(The site answered 403\)/);
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

// ---- #291: reading what's on ----

const TODAY = new Date('2026-11-04T12:00:00Z');
const read = (reader, html, venues, extra = {}) => reader({ url: 'https://x.test/whats-on', html }, { venues, today: TODAY, ...extra });

test('dates: real calendar dates only, plausible years only, explicit text only', () => {
  assert.equal(isoDate('2026-12-03T19:30:00+00:00'), '2026-12-03');
  assert.equal(isoDate('2026-02-30'), null);
  assert.equal(isoDate('3 December'), null);
  assert.equal(plausibleDate('1999-01-01', TODAY), null);
  assert.equal(plausibleDate('2027-06-01', TODAY), '2027-06-01');
  assert.equal(plausibleDate('2031-06-01', TODAY), null);
  assert.equal(explicitDateText('12 Dec - 4 Jan 2027'), true);
  assert.equal(explicitDateText('Fridays in December'), false);
  assert.equal(explicitDateText(''), false);
});

test('structured: one theatre, JSON-LD events with stages, kinds and dates', async () => {
  const venue = { id: 'soho', name: 'Soho Theatre' };
  const found = read(structuredReader, await fixture('soho-jsonld.html'), [venue]);
  assert.deepEqual(found.map(f => [f.raw_title, f.start_date, f.end_date, f.kind, f.method, f.confidence]), [
    ['Example One & Friends', '2026-12-03', '2026-12-14', 'show', 'structured', 0.9],
    ['Example Comic: Work In Progress', '2026-11-20', null, 'show', 'structured', 0.8],
    ['Q&A with the Example Company', '2026-12-05', null, 'talk', 'structured', 0.8],
  ]);
  assert.ok(found.every(f => f.venue_id === 'soho'), 'a single-theatre site takes every event');
  assert.equal(found[0].stage_text, 'Soho Theatre Downstairs');
  assert.equal(found[0].date_text, '2026-12-03T19:30:00+00:00 to 2026-12-14');
  assert.ok(found[0].evidence.length <= 400);
  assert.equal(jsonLdBlocks(await fixture('soho-jsonld.html')).length, 1, 'a broken block is skipped');
  assert.equal(read(structuredReader, await fixture('plain-whats-on.html'), [venue]), null);
});

test('structured: a shared site matches stages to its theatres, keeps unmatched ones, drops repeats and retains archive dates', async () => {
  const venues = [{ id: 'oli', name: 'Olivier' }, { id: 'lyt', name: 'Lyttelton' }, { id: 'dor', name: 'Dorfman' }];
  const found = read(structuredReader, await fixture('nt-jsonld.html'), venues);
  assert.deepEqual(found.map(f => [f.raw_title, f.venue_id, f.stage_text]), [
    ['Example Play', 'oli', 'Olivier Theatre'],
    ['Example Musical', 'lyt', 'The Lyttelton'],
    ['Backstage Tour', null, 'Riverside Foyer'],
  ]);
  assert.equal(found[2].start_date, '1999-01-01', 'archive dates are retained');
  assert.equal(found[2].kind, 'talk');
  assert.equal(found[2].confidence, 0.8);
  assert.equal(matchStage('Studio', venues), null);
  assert.equal(matchStage(null, venues), null);
  assert.equal(matchStage('Anything', [venues[0]]), 'oli');
});

test('model: page text, answers become findings, dates need written backing', async () => {
  const html = await fixture('plain-whats-on.html');
  const text = pageText(html);
  assert.match(text, /Example Pantomime/);
  assert.doesNotMatch(text, /tracking|color:red/);
  const events = [
    { title: 'Example Pantomime', stage: 'Main House', start_date: '2026-12-12', end_date: '2027-01-04', date_text: '12 Dec - 4 Jan 2027', kind: 'show', evidence: '12 Dec - 4 Jan 2027, Main House' },
    { title: 'Late Night Jazz', stage: null, start_date: '2026-12-04', end_date: null, date_text: 'Fridays in December', kind: 'concert', evidence: 'Fridays in December' },
    { title: '', stage: null, start_date: null, end_date: null, date_text: '', kind: 'show', evidence: '' },
    { title: 'Example Pantomime', stage: 'Main House', start_date: '2026-12-12', end_date: '2027-01-04', date_text: '12 Dec - 4 Jan 2027', kind: 'show', evidence: 'again' },
  ];
  const found = findingsFromModel(events, { url: 'u', venues: [{ id: 'v1', name: 'Only Theatre' }], today: TODAY });
  assert.deepEqual(found.map(f => [f.raw_title, f.start_date, f.end_date, f.kind, f.confidence, f.venue_id]), [
    ['Example Pantomime', '2026-12-12', '2027-01-04', 'show', 0.7, 'v1'],
    ['Late Night Jazz', null, null, 'concert', 0.5, 'v1'],
  ]);
  assert.equal(found[1].date_text, 'Fridays in December', 'a date the page did not give is not invented');
});

const apiFetch = (events, usage = { input_tokens: 10_000, output_tokens: 500 }, status = 200) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ events }) }], usage }), { status });
  };
  fn.calls = calls;
  return fn;
};

test('model reader: only when the run allows it, within budget, with a known price', async () => {
  const html = await fixture('plain-whats-on.html');
  const venues = [{ id: 'v1', name: 'Only Theatre' }];
  const events = [{ title: 'Example Pantomime', stage: null, start_date: '2026-12-12', end_date: null, date_text: '12 Dec', kind: 'show', evidence: 'x' }];
  const call = (run, extra = {}) => {
    const ctx = { run, venues, today: TODAY, spend: { usd: 0 }, notes: [], apiKey: 'test-key', ...extra };
    return modelReader({ url: 'https://x.test/', html }, ctx).then(found => ({ found, ctx }));
  };

  assert.equal((await call({ method: 'rules', budget_usd: 5 }, { fetchFn: apiFetch(events) })).found, null, 'rules only: no call');
  const none = await call({ method: 'rules_model', budget_usd: 0 }, { fetchFn: apiFetch(events) });
  assert.deepEqual([none.found, none.ctx.notes], [null, ['budget used up, so the model was not used']]);
  assert.match((await call({ method: 'rules_model', model: 'mystery-1', budget_usd: 5 }, { fetchFn: apiFetch(events) })).ctx.notes[0], /no known price/);
  assert.match((await call({ method: 'rules_model', budget_usd: 5 }, { apiKey: '' })).ctx.notes[0], /ANTHROPIC_API_KEY/);
  const spent = await call({ method: 'rules_model', budget_usd: 1 }, { fetchFn: apiFetch(events), spend: { usd: 1 } });
  assert.equal(spent.found, null, 'a spent budget stops further calls');

  const cappedFetch = apiFetch(events);
  const capped = await call({ method: 'rules_model', budget_usd: 0.0001 }, { fetchFn: cappedFetch });
  assert.equal(capped.found, null);
  assert.equal(cappedFetch.calls.length, 0, 'reserve the maximum response bill before calling');
  const fetchFn = apiFetch(events);
  const ok = await call({ method: 'rules_model', budget_usd: 5, prompt: 'Custom prompt.' }, { fetchFn });
  assert.equal(ok.found[0].method, 'model');
  const sent = fetchFn.calls[0];
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'test-key');
  assert.equal(sent.body.model, 'claude-haiku-5-5');
  assert.equal(sent.body.system, 'Custom prompt.', 'the prompt comes from the run');
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.ok(!('tool_choice' in sent.body) && !('temperature' in sent.body));
  assert.ok(Math.abs(ok.ctx.spend.usd - (10_000 * 0.10 + 500 * 0.50) / 1e6) < 1e-12, 'cost is tokens times the price');

  const failed = await call({ method: 'rules_model', budget_usd: 5 }, { fetchFn: apiFetch(events, undefined, 500) });
  assert.deepEqual([failed.found, failed.ctx.notes], [null, ['the model call failed (500)']]);
  assert.equal(costUsd('mystery-1', { input_tokens: 5 }), 0);
  assert.ok(DEFAULT_PROMPT.includes('Never guess'));
  assert.deepEqual(Object.keys(MODEL_PRICES), ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
});

test('the full chain: structured first, model next, the stub last; the report says how each site was read', async () => {
  const html = {
    'https://soho.test/': await fixture('soho-jsonld.html'),
    'https://plain.test/': await fixture('plain-whats-on.html'),
    'https://empty.test/': await fixture('no-title.html'),
  };
  const sites = Object.keys(html).map((url, i) => ({ url, venues: [{ id: `v${i}`, name: `Theatre ${i}` }] }));
  const fetchPage = async url => ({ status: 'ok', html: html[url] });
  const events = [{ title: 'Example Pantomime', stage: null, start_date: '2026-12-12', end_date: null, date_text: '12 Dec 2026', kind: 'show', evidence: 'x' }];
  const spend = { usd: 0 };
  const run = { method: 'rules_model', budget_usd: 1 };
  const answer = apiFetch(events);
  // The model finds events only on the page that lists some.
  const fetchFn = async (url, init) => (JSON.parse(init.body).messages[0].content.includes('Pantomime') ? answer(url, init) : apiFetch([])(url, init));
  const results = await crawlSites({ sites, fetchPage, run, spend, readerList: READERS, readerContext: { today: TODAY, apiKey: 'k', fetchFn } });
  assert.deepEqual(results.map(r => [r.status, r.methods, r.findings]), [
    ['ok', ['structured'], 3], ['ok', [], 0], ['ok', [], 0],
  ]);
  assert.ok(spend.usd > 0);
  const text = renderReport({ run, sites: results, costUsd: spend.usd });
  assert.match(text, /\| structured data \|/);
  assert.match(text, /failed the page check/);

  assert.match(text, /Model cost: \$0\.00/);
  const noModel = await crawlSites({ sites: sites.slice(1, 2), fetchPage, run: { method: 'rules' }, readerList: READERS, readerContext: { today: TODAY } });
  assert.deepEqual(noModel[0].methods, ['stub'], 'rules only: a page with no structured data is the stub');
});

test('structured reader takes the event title and dates from scoped HTML metadata', async () => {
 const html = `<article itemscope itemtype="https://schema.org/Event">
  <div itemprop="location" itemscope><meta itemprop="name" content="Test Theatre"></div>
  <meta itemprop="name" content="Winter Play">
  <meta itemprop="startDate" content="2026-12-18 19:30">
  <meta itemprop="endDate" content="2027-01-23 19:30">
 </article>`;
 const findings = await readPage({url:'https://theatre.test/',html},{venues:[{id:'v',name:'Test Theatre'}]},[structuredReader]);
 assert.deepEqual(findings.map(f=>[f.raw_title,f.start_date,f.end_date,f.page_checked]),[
  ['Winter Play','2026-12-18','2027-01-23',true],
 ]);
});

test('Crazy Coqs feed keeps the calendar day attached to each performance', async () => {
 const url = 'https://www.brasseriezedel.com/api/get_calendar.php';
 const html = JSON.stringify({events:{'2026-11-07':[
  {name:'Example Cabaret',stream:false},
  {name:'Example Stream',stream:true},
 ]}});
 const findings = await readPage({url,html},{venues:[{id:'v',name:'Crazy Coqs'}]},[structuredReader]);
 assert.deepEqual(findings.map(f=>[f.raw_title,f.start_date,f.end_date,f.page_checked]),[
  ['Example Cabaret','2026-11-07','2026-11-07',true],
 ]);
});
