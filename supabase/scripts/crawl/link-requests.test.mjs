import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classifyShowPage, processLinkRequests } from './link-requests.mjs';
import { adapters } from './sources/index.mjs';
import { parseEvent, parseVenue } from './sources/web-links.mjs';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const page = html => async () => ({ status: 'ok', html });
const row = url => ({ id: 'r1', url });

test('a show page with schema.org event data reads as one event, a venue task and a venue observation', () => {
  const url = 'https://shows.example.test/whats-on/the-long-interval';
  const event = parseEvent({ url, html: fixture('web-links/event.html') });
  assert.deepEqual(event.children, [{ stage: 'venue', url }]);
  const [show] = event.observations;
  assert.equal(show.observation_kind, 'event');
  assert.equal(show.raw_title, 'The Long Interval');
  assert.deepEqual(show.dates.map(d => [d.kind, d.date]), [['start', '2026-12-01'], ['end', '2027-01-23']]);
  assert.equal(show.date_status, 'supported');
  assert.equal(show.venue.external_key, 'shows.example.test:riverside-rooms');
  const [venue] = parseVenue({ url, html: fixture('web-links/venue.html') }).observations;
  assert.equal(venue.external_key, show.venue.external_key, 'the event points at the venue observation');
  assert.deepEqual([venue.name, venue.street, venue.city, venue.postcode, venue.country, venue.lat, venue.lng],
    ['Riverside Rooms', '14 Wharf Road', 'London', 'N1 7GU', 'GB', 51.5322, -0.0931]);
});

test('a page without event data, or with a listing of many events, is not a show page', () => {
  assert.equal(parseEvent({ url: 'https://x.test/a', html: '<h1>Hello</h1>' }).status, 'invalid');
  const many = Array.from({ length: 6 }, (_, i) => `{"@type":"TheaterEvent","name":"Show ${i}"}`).join(',');
  const listing = parseEvent({ url: 'https://x.test/a', html: `<script type="application/ld+json">[${many}]</script>` });
  assert.match(listing.reason, /listing of many events/);
  assert.equal(parseVenue({ url: 'https://x.test/a', html: '<script type="application/ld+json">{"@type":"TheaterEvent","name":"A"}</script>' }).status, 'invalid');
});

test('an unknown site is read by the generic reader; a known site by its own adapter', async () => {
  const unknown = await classifyShowPage(row('https://shows.example.test/whats-on/the-long-interval'), { adapters, fetchPage: page(fixture('web-links/event.html')) });
  assert.deepEqual(unknown, { outcome: 'show_page', source: 'web_links' });
  const playbill = await classifyShowPage(row('https://playbill.com/production/fixture-past'), { adapters, fetchPage: page(fixture('playbill/event.html')) });
  assert.deepEqual(playbill, { outcome: 'show_page', source: 'playbill' });
});

test('a page that is not a show page waits; a refusal or a failure is said plainly', async () => {
  const leave = await classifyShowPage(row('https://playbill.com/venue/fixture-east'), { adapters, fetchPage: page(fixture('playbill/venue.html')) });
  assert.equal(leave.outcome, 'leave');
  assert.match(leave.reason, /not a show page of Playbill/);
  const none = await classifyShowPage(row('https://shows.example.test/x'), { adapters, fetchPage: page('<h1>Directory</h1>') });
  assert.equal(none.reason, 'no event data on the page');
  const blocked = await classifyShowPage(row('https://shows.example.test/x'), { adapters, fetchPage: async () => ({ status: 'blocked', error: 'Disallowed by robots.txt' }) });
  assert.equal(blocked.outcome, 'unsupported');
  const failed = await classifyShowPage(row('https://shows.example.test/x'), { adapters, fetchPage: async () => ({ status: 'failed' }) });
  assert.equal(failed.outcome, 'failed');
});

test('each new request is handled once and a queueing error fails only that request', async () => {
  const calls = [];
  const store = {
    linkRequestsToProcess: async () => [{ id: 'a', url: 'https://shows.example.test/a' }, { id: 'b', url: 'https://shows.example.test/b' }, { id: 'c', url: 'https://shows.example.test/c' }],
    queuePastedShowPage: async (id, source) => { calls.push(['queue', id, source]); if (id === 'b') throw new Error('source off'); },
    finishLinkRequest: async (...args) => calls.push(['finish', ...args.slice(0, 4)]),
  };
  const pages = { a: fixture('web-links/event.html'), b: fixture('web-links/event.html'), c: '<h1>Nothing</h1>' };
  const handled = await processLinkRequests({ store, adapters, fetchPage: async url => ({ status: 'ok', html: pages[url.at(-1)] }) });
  assert.deepEqual(handled.map(item => item.outcome), ['show_page', 'failed', 'leave']);
  assert.deepEqual(calls, [['queue', 'a', 'web_links'], ['queue', 'b', 'web_links'], ['finish', 'b', 'failed', null, 'it could not be queued'], ['finish', 'c', 'new', null, null]]);
});
