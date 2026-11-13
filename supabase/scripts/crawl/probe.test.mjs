import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createFetcher } from './fetch.mjs';
import { classifyShapes, collectLinks, fitOf, linkShape, pageSignals, planSamples, runProbe, siteHosts } from './probe.mjs';

const origin = 'https://playbill.com';
const read = path => readFileSync(new URL(`./fixtures/${path}.html`, import.meta.url), 'utf8');
const hosts = siteHosts(origin);

// A small fake site served from fixtures; every request is recorded.
function fakeSite(pages, robots = 'User-agent: *\nAllow: /') {
  const requested = [];
  const fetchFn = async url => {
    const { pathname, search } = new URL(url);
    requested.push(pathname + search);
    if (pathname === '/robots.txt') return new Response(robots, { headers: { 'content-type': 'text/plain' } });
    const html = pages(pathname);
    return html === undefined ? new Response('missing', { status: 404 }) : new Response(html, { headers: { 'content-type': 'text/html' } });
  };
  const fetchPage = createFetcher({ fetchFn, minDelayMs: 0, sleep: async () => {}, conditional: false });
  return { fetchPage, requested };
}
const site = pathname => {
  if (pathname === '/broadway-theatres') return read('playbill/directory');
  if (pathname.startsWith('/venue/')) return read('probe/venue');
  if (pathname.startsWith('/production/')) return read('probe/event');
  return undefined;
};

test('link shapes keep the first segment and star the rest', () => {
  assert.equal(linkShape('https://x.test/venue/apollo-theatre'), '/venue/*');
  assert.equal(linkShape('https://x.test/shows/london'), '/shows/*');
  assert.equal(linkShape('https://x.test/'), '/');
  assert.equal(linkShape('https://x.test/about'), '/about');
  assert.equal(linkShape('https://x.test/venue/a/b?page=2'), '/venue/*/*');
});

test('links in header, footer, nav and aside and off-site links are ignored', () => {
  const html = `<header><a href="/venue/nav">n</a></header><nav><a href="/venue/menu">m</a></nav>
    <main><a href="/venue/one">1</a><a href="https://other.test/venue/x">x</a><a href="/venue/one#top">dup</a><a href="mailto:a@b.c">m</a>
    <a href="https://www.playbill.com/production/two">2</a></main><footer><a href="/venue/foot">f</a></footer><aside><a href="/venue/side">s</a></aside>`;
  assert.deepEqual(collectLinks(html, origin + '/x', hosts).map(link => link.url), [origin + '/venue/one', 'https://www.playbill.com/production/two']);
});

test('page signals count dates and addresses and see pagination', () => {
  const signals = pageSignals(read('probe/venue'), origin + '/venue/fixture-east');
  assert.equal(signals.address_signals, true);
  assert.equal(signals.has_pagination, true);
  assert.equal(pageSignals(read('probe/event'), origin + '/production/x').date_signals, 2);
  assert.equal(pageSignals('<body>On 2026-03-12 and 12 March 2026 and March 12, 2026</body>', origin).date_signals, 3);
  assert.deepEqual(pageSignals('<script type="application/ld+json">{"@type":"Event"}</script>', origin).jsonld_types, ['Event']);
  assert.equal(pageSignals('<script type="application/ld+json">{"@type":"Place","address":{"@type":"PostalAddress"}}</script>', origin).address_signals, true);
});

test('the sample plan starts with the shapes most linked from the seed and respects the page budget', () => {
  const seedLinks = collectLinks(read('playbill/directory'), origin + '/broadway-theatres', hosts);
  const seed = { url: origin + '/broadway-theatres', shape: '/broadway-theatres', links: seedLinks, next: origin + '/broadway-theatres?page=2&locale=en-US' };
  assert.deepEqual(planSamples({ pages: [seed], maxPages: 12 }), [
    origin + '/venue/fixture-square', origin + '/venue/fixture-east', origin + '/production/editorial', origin + '/broadway-theatres?page=2&locale=en-US',
  ]);
  assert.equal(planSamples({ pages: [seed], maxPages: 3 }).length, 2, 'two pages fit beside the seed');
  assert.deepEqual(planSamples({ pages: [seed], maxPages: 1 }), []);
});

test('the Playbill fixtures read as a venue shape, an event shape and a likely fit', async () => {
  const { fetchPage } = fakeSite(site);
  const logs = [];
  const out = await mkdtemp(`${tmpdir()}/probe-`);
  const { exitCode, report } = await runProbe({ url: origin + '/broadway-theatres', key: 'fixture_site', maxPages: 8, fetchPage, outDir: out, log: line => logs.push(line) });
  assert.equal(exitCode, 0);
  assert.equal(report.shapes['/venue/*'].venue_candidate, true);
  assert.equal(report.shapes['/production/*'].event_candidate, true);
  assert.equal(report.shapes['/broadway-theatres'].directory_candidate, true);
  assert.equal(report.fit, 'likely');
  assert.ok(report.pages.length <= 8);
  assert.equal(JSON.parse(await readFile(`${out}/fixture_site/report.json`, 'utf8')).fit, 'likely');
  assert.ok((await readFile(`${out}/fixture_site/pages/1.html`, 'utf8')).includes('bsp-list-promo'));
  assert.ok(logs.at(-1).includes('likely'));
});

test('a site with only event pages has no venue pages', async () => {
  const { fetchPage } = fakeSite(pathname => pathname === '/shows/london' ? read('playbill/listing') : pathname.startsWith('/production/') ? read('probe/event-no-venue') : undefined);
  const { report } = await runProbe({ url: origin + '/shows/london', key: 'events_only', maxPages: 6, fetchPage, log: () => {} });
  assert.equal(report.fit, 'no_venue_pages');
  assert.equal(fitOf({}), 'unclear');
});

test('a robots.txt disallow on the seed ends with a failure and never fetches the seed', async () => {
  const { fetchPage, requested } = fakeSite(site, 'User-agent: *\nDisallow: /broadway-theatres');
  const { exitCode, report } = await runProbe({ url: origin + '/broadway-theatres', key: 'closed_site', fetchPage, log: () => {} });
  assert.equal(exitCode, 1);
  assert.equal(report.fit, 'blocked');
  assert.deepEqual(requested, ['/robots.txt']);
});

test('bad input is refused before any request', async () => {
  const never = async () => { throw new Error('no request expected'); };
  await assert.rejects(runProbe({ url: origin, key: 'Bad Key', fetchPage: never }), /--key/);
  await assert.rejects(runProbe({ url: 'ftp://x.test', key: 'ok_key', fetchPage: never }), /--url/);
  await assert.rejects(runProbe({ url: origin, key: 'ok_key', maxPages: 2, fetchPage: never }), /--max-pages/);
  await assert.rejects(runProbe({ url: origin, key: 'ok_key', maxPages: 21, fetchPage: never }), /--max-pages/);
});

test('classification names the seed shape a directory even before venues are found', () => {
  assert.equal(classifyShapes([{ url: origin + '/', shape: '/', signals: { jsonld_types: [], date_signals: 0, address_signals: false }, links: [] }], '/')['/'].directory_candidate, true);
});
