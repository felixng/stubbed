import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseDirectory, parseVenue, parseEvent } from './sources/london-theatre.mjs';
import { sourceDateRange } from './sources/source-dates.mjs';

const origin = 'https://www.londontheatre.co.uk';
const venue = origin + '/venues/strand-theatre';
const event = origin + '/show/101-one-night';
const fixture = name => readFileSync(new URL(`./fixtures/london-theatre/${name}.html`, import.meta.url), 'utf8');

test('directory scopes labelled venues and observed pagination', () => {
  const result = parseDirectory({ url: origin + '/venues', html: fixture('directory') });
  assert.deepEqual(result.children.map(link => [link.stage, link.url.slice(origin.length)]), [
    ['venue', '/venues/strand-theatre'], ['venue', '/venues/east-london-arts'],
    ['venue', '/venues/riverside-rooms'], ['directory', '/venues?page=2'],
  ]);
  assert.equal(result.observations[1].name, 'East London Arts');
  assert.equal(result.observations[0].external_key, 'strand-theatre');
});

test('venue stages current, future and past event links without prose or recommendations', () => {
  const result = parseVenue({ url: venue, html: fixture('venue') });
  assert.deepEqual(result.children, [
    { stage: 'event', url: event },
    { stage: 'event', url: origin + '/show/102-future' },
    { stage: 'event', url: origin + '/show/103-old-play' },
    { stage: 'venue', url: venue + '?page=2&locale=en-GB' },
  ]);
  const [details, link] = result.observations;
  assert.deepEqual([details.street, details.city, details.country, details.postcode], ['1 Strand', 'London', 'GB', 'WC2R 0NS']);
  assert.deepEqual(link.listings, ['All events at Strand Theatre', 'Past events at Strand Theatre']);
  assert.equal(Object.hasOwn(link, 'venue_id'), false);
});

test('layout change is distinguished from explicitly empty venue, retaining auditorium uncertainty', () => {
  const broken = `<main><h1>Riverside Rooms</h1><p data-test-id="venue-address">2 River St, London, UK</p></main>`;
  assert.equal(parseVenue({ url: origin + '/venues/riverside-rooms', html: broken }).status, 'invalid');
  const empty = broken.replace('</main>', `<div data-test-id="no-events">No upcoming events</div>
    <div data-auditorium="Main Hall"></div><div data-auditorium="Studio"></div></main>`);
  const result = parseVenue({ url: origin + '/venues/riverside-rooms', html: empty });
  assert.deepEqual(result.children, []);
  assert.equal(result.observations[0].listing_state, 'explicitly_empty');
  assert.deepEqual(result.observations[0].auditoria, ['Main Hall', 'Studio']);
  assert.equal(result.observations[0].resolution_reason, 'multiple_auditoria');
  assert.equal(parseDirectory({ url: origin + '/venues', html: '<main><h1>Changed</h1></main>' }).status, 'invalid');
});

test('one-night historical details retain corroboration and exclude a recommended event', () => {
  const [show] = parseEvent({ url: event, html: fixture('event') }).observations;
  assert.equal(show.external_key, '101');
  assert.equal(show.raw_title, 'One Night');
  assert.equal(show.show_type, 'play');
  assert.equal(show.venue.external_key, 'strand-theatre');
  assert.equal(show.date_status, 'supported');
  assert.deepEqual([...new Set(show.dates.map(claim => claim.date))], ['2019-11-11']);
  assert.ok(show.dates.some(claim => claim.evidence.field === 'json_ld.Event.startDate'));
  assert.ok(show.dates.some(claim => claim.evidence.field === 'detail.start date'));
});

test('missing dates and excluded activities are staged with reasons', () => {
  const html = `<main><h1 data-test-id="product-name">Backstage Tour tickets</h1>
    <section data-test-id="markdown-content">From 12 July 2027.</section>
    <dl><dt>Opening date</dt><dd>July 2027</dd></dl></main>`;
  const [show] = parseEvent({ url: origin + '/show/203-backstage-tour', html }).observations;
  assert.equal(show.event_kind, 'building_tour');
  assert.equal(show.date_status, 'missing');
  assert.deepEqual(show.reasons, ['missing_supported_start', 'missing_venue_identity']);
  assert.deepEqual(show.dates.map(({ kind, date }) => [kind, date]), [['unknown', null]]);
});

test('conflicts stay visible and booking, previews and press night remain distinct', () => {
  const html = fixture('event').replace('11th November, 2019', '12th November, 2019')
    .replace('</div>\n</main>', `<dl>
      <dt>Previews from</dt><dd>10 November 2019</dd>
      <dt>Press night</dt><dd>11 November 2019</dd>
      <dt>Booking until</dt><dd>9 Jan 2020</dd>
    </dl></div></main>`);
  const [show] = parseEvent({ url: event, html }).observations;
  assert.equal(show.date_status, 'conflicting');
  assert.ok(show.dates.some(claim => claim.kind === 'preview' && claim.date === '2019-11-10'));
  assert.ok(show.dates.some(claim => claim.kind === 'opening' && claim.date === '2019-11-11'));
  assert.ok(show.dates.some(claim => claim.kind === 'booking_until' && claim.date === '2020-01-09'));
  assert.equal(show.dates.some(claim => claim.kind === 'closing'), false);
  assert.equal(show.dates.filter(claim => claim.kind === 'start').length, 2);
});

test('explicit range rollover, open endings, missing year and invalid calendar dates', () => {
  assert.deepEqual(sourceDateRange('30 Dec – 2 Jan 2027'), { start: '2026-12-30', end: '2027-01-02', precision: 'range' });
  assert.deepEqual(sourceDateRange('12–15 June 2026'), { start: '2026-06-12', end: '2026-06-15', precision: 'range' });
  assert.deepEqual(sourceDateRange('Feb 12, 2027 -'), { start: '2027-02-12', end: null, precision: 'open' });
  for (const date of ['29 Feb 2025', '12 July', 'July 2027', 'December 2018 - January 2019']) {
    assert.equal(sourceDateRange(date).precision, 'unknown');
  }
});


test('explicit nonconsecutive performance dates remain discrete evidence', () => {
  const html = `<main><h1 data-test-id="product-name">Two Sundays</h1>
    <dl><dt>Performance dates</dt><dd>11 July 2027 and 25 July 2027</dd></dl></main>`;
  const [show] = parseEvent({ url: origin + '/show/204-two-sundays', html }).observations;
  assert.equal(show.date_status, 'supported');
  assert.deepEqual(show.dates.map(({ kind, date }) => [kind, date]), [
    ['performance', '2027-07-11'], ['performance', '2027-07-25'],
  ]);
});

const eventPage = (categories, jsonLd = '') => `<!doctype html>${jsonLd}<main><h1 data-test-id="product-name">Hamilton tickets</h1>
  <div data-test-id="main-content"><div><h2 data-test-id="title-Start date">Start date</h2><p>6th December, 2017</p></div>
  <div><h2 data-test-id="title-Categories">Categories</h2><p>${categories.map(c => `<span><a href="/whats-on/x">${c}</a>, </span>`).join('')}</p></div>
  <h3 data-test-id="venue-name"><a href="/venues/strand-theatre">Strand Theatre</a></h3></div></main>`;
const classify = (categories, jsonLd) =>
  parseEvent({ url: origin + '/show/201-hamilton', html: eventPage(categories, jsonLd) }).observations[0];

test('multi-category pages take the first category that names a type', () => {
  assert.equal(classify(['Musicals', 'Biography', 'Drama', 'Award winners']).show_type, 'musical');
  assert.equal(classify(['Drama', 'History']).show_type, 'play');
  assert.equal(classify(['Plays', 'Comedy']).show_type, 'play');
  assert.equal(classify(['Musicals', 'Romance', 'Comedy', 'West End']).show_type, 'musical');
  assert.equal(classify(['Comedy Shows', 'West End']).show_type, 'comedy');
  assert.equal(classify(['Plays', 'Comedy']).event_kind, 'show');
  assert.deepEqual(
    (({ event_kind, show_type }) => ({ event_kind, show_type }))(classify(['Concerts', 'Classical', 'West End'])),
    { event_kind: 'concert', show_type: 'concert' });
  assert.equal(classify(['West End', 'Family / Kid-friendly']).event_kind, 'unknown');
  assert.equal(classify(['Musicals', 'Workshop']).event_kind, 'workshop');
});

test('a JSON-LD endDate on a long run is a scheduled end, never a closing', () => {
  const ld = `<script type="application/ld+json">{"@type":"TheaterEvent","url":"/show/201-hamilton","name":"Matilda",
    "startDate":"2011-11-25","endDate":"2027-09-05"}</script>`;
  const dates = classify(['Musicals'], ld).dates;
  assert.ok(dates.some(claim => claim.date === '2027-09-05' && claim.kind === 'end'));
  assert.equal(dates.some(claim => claim.kind === 'closing'), false);
});
