import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseDirectory, parseVenue, parseEvent, playbill } from './sources/playbill.mjs';

const origin = 'https://playbill.com';
const fixture = name => readFileSync(new URL(`./fixtures/playbill/${name}.html`, import.meta.url), 'utf8');

test('observed Broadway directory pagination and the supplied venues have separate scopes', () => {
  const result = parseDirectory({ url: origin + '/broadway-theatres', html: fixture('directory') });
  assert.deepEqual(result.children, [
    { stage: 'venue', url: origin + '/venue/fixture-square' },
    { stage: 'venue', url: origin + '/venue/fixture-east' },
    { stage: 'directory', url: origin + '/broadway-theatres?page=2&locale=en-US' },
  ]);
  assert.equal(new Set(playbill.seeds.map(seed => seed.scope)).size, 4);
});

test('the London show listing queues each production once, ignoring header, footer and ticket links', () => {
  const result = parseDirectory({ url: origin + '/shows/london', html: fixture('listing') });
  assert.deepEqual(result.children, [
    { stage: 'event', url: origin + '/production/fixture-one-london-fixture-theatre-2026' },
    { stage: 'event', url: origin + '/production/fixture-two-london-other-stage-2012-2013' },
  ]);
  assert.deepEqual(result.observations.map(row => [row.observation_kind, row.external_key, row.name]), [
    ['event_link', 'fixture-one-london-fixture-theatre-2026', 'Fixture One'],
    ['event_link', 'fixture-two-london-other-stage-2012-2013', null],
  ]);
  assert.ok(playbill.seeds.some(seed => seed.scope === 'london-listing' && seed.url === origin + '/shows/london'));
  assert.match(parseDirectory({ url: origin + '/shows/london', html: '<main></main>' }).reason, /no production cards/);
});

test('non-Broadway venue keeps all labelled current, future and historical links', () => {
  const url = origin + '/venue/fixture-east';
  const result = parseVenue({ url, html: fixture('venue') });
  assert.deepEqual(result.children, [
    { stage: 'event', url: origin + '/production/fixture-past' },
    { stage: 'event', url: origin + '/production/fixture-upcoming' },
    { stage: 'event', url: origin + '/production/fixture-current' },
    { stage: 'venue', url: url + '?page=2' },
  ]);
  const [venue] = result.observations;
  assert.deepEqual([venue.city, venue.country, venue.street], ['London', 'GB', '10 Theatre Road, Stratford']);
  const broadway = parseVenue({ url: origin + '/venue/fixture-square',
    html: fixture('venue').replace('10 Theatre Road, Stratford, London, London, EN', '10 Broadway, New York, NY') });
  assert.deepEqual([broadway.observations[0].city, broadway.observations[0].country], ['New York', 'US']);
});

test('historical production distinguishes preview, opening, close and count statistics', () => {
  const [show] = parseEvent({ url: origin + '/production/fixture-past', html: fixture('event') }).observations;
  assert.equal(show.venue.external_key, 'fixture-east');
  assert.equal(show.show_type, 'musical');
  assert.equal(show.date_status, 'supported');
  assert.deepEqual(show.dates.map(({ kind, date }) => [kind, date]), [
    ['preview', '2018-12-28'], ['opening', '2019-01-02'], ['closing', '2019-02-10'],
  ]);
  assert.equal(Object.hasOwn(show, 'wikidata_work_id'), false);
});

test('currently running is unknown closing evidence and never a confirmed date', () => {
  const html = fixture('event').replace('<span>Feb</span><span>10</span><span>2019</span>', '<span>Currently Running</span>');
  const [show] = parseEvent({ url: origin + '/production/fixture-current', html }).observations;
  assert.equal(show.date_status, 'supported');
  assert.equal(show.dates.some(claim => claim.kind === 'closing'), false);
  assert.ok(show.dates.some(claim => claim.intended_kind === 'closing' && claim.date === null));
});

test('explicit transfer segments retain venue and dates without assuming shared work IDs', () => {
  const html = fixture('event').replace('</ul>\n</div>\n<footer>', `</ul>
    <section data-engagement-id="first"><a href="/venue/fixture-east">Fixture East</a>
      <dl><dt>Opening Date</dt><dd>Jan 2, 2019</dd></dl></section>
    <section data-engagement-id="transfer"><a href="/venue/fixture-square">Fixture Square</a>
      <dl><dt>Opening Date</dt><dd>Mar 3, 2019</dd></dl></section>
    </div><footer>`);
  const result = parseEvent({ url: origin + '/production/fixture-past', html });
  const [show] = result.observations;
  assert.equal(show.venue.external_key, null);
  assert.deepEqual(show.dates, []);
  assert.deepEqual(show.segments.map(segment => [segment.segment_key, segment.venue.external_key, segment.dates[0].date]), [
    ['first', 'fixture-east', '2019-01-02'], ['transfer', 'fixture-square', '2019-03-03'],
  ]);
  assert.equal(result.children.length, 2);
});

test('unsupported render and layout loss produce an actionable failure', () => {
  assert.match(parseDirectory({ url: origin + '/broadway-theatres', html: '<script>loadList()</script>' }).reason, /no labelled venue cards/);
  assert.match(parseEvent({ url: origin + '/production/fixture-current', html: '<h2>News</h2>' }).reason, /Pro Info missing/);
});
