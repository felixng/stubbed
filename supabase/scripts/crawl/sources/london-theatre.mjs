import { load } from 'cheerio';
import { canonicalTaskUrl } from '../frontier-url.mjs';
import { eventsFromJsonLd, jsonLdBlocks } from './theatre-site.mjs';
import { sourceDateClaims } from './source-dates.mjs';

const ORIGIN = 'https://www.londontheatre.co.uk';
const HOSTS = ['www.londontheatre.co.uk', 'londontheatre.co.uk'];
const VENUE_PATH = /^\/venues\/([a-z0-9-]+)\/?$/i;
const EVENT_PATH = /^\/show\/(\d+)(?:-[a-z0-9-]+)?\/?$/i;
const EMPTY_LIST = /\b(?:no (?:current |upcoming |past )?(?:events|shows)(?: found| scheduled| available| at this venue)?|there are no events)\b/i;

const clean = (value, limit = 300) => typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, limit) || null : null;
const evidence = (field, value) => ({ field, text: clean(value, 400) });
const invalid = reason => ({ status: 'invalid', reason });
const parsed = (children, observations) => ({ children, observations });

function sourceUrl(value, base = ORIGIN) {
  return canonicalTaskUrl(value, { base, allowedHosts: HOSTS });
}

function identity(url, pattern) {
  return url ? pattern.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? null : null;
}

function listLinks($, container, url, pattern, selector = 'a[href]') {
  const links = new Map();
  for (const element of container.find(selector).toArray()) {
    const link = $(element);
    if (link.closest('aside, header, footer, [data-ad], [data-recommendations]').length) continue;
    const target = sourceUrl(link.attr('href'), url);
    const key = identity(target, pattern);
    if (!key) continue;
    const label = clean(link.text());
    if (!links.has(target) || label) links.set(target, { url: target, key, label });
  }
  return [...links.values()];
}

function pagination($, container, url) {
  const path = new URL(url).pathname.replace(/\/$/, '');
  const links = container.find('nav[aria-label*="pagination" i] a[href], a[rel~="next"][href], a[rel~="prev"][href]');
  return [...new Set(links.toArray().map(link => sourceUrl($(link).attr('href'), url)).filter(target => {
    if (!target || target === url) return false;
    const next = new URL(target);
    return next.pathname.replace(/\/$/, '') === path && next.searchParams.has('page');
  }))];
}

function schemaNodes(html) {
  return jsonLdBlocks(html).flatMap(value => Array.isArray(value) ? value : value?.['@graph'] ?? [value]).filter(Boolean);
}

function coordinates(place) {
  const latitude = place?.geo?.latitude;
  const longitude = place?.geo?.longitude;
  const lat = latitude === '' ? NaN : Number(latitude ?? NaN);
  const lng = longitude === '' ? NaN : Number(longitude ?? NaN);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : { lat: null, lng: null };
}

function addressFrom(place, visible) {
  const raw = place?.address;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      street: clean(raw.streetAddress), city: clean(raw.addressLocality),
      country: clean(typeof raw.addressCountry === 'object' ? raw.addressCountry?.name : raw.addressCountry),
      postcode: clean(raw.postalCode),
    };
  }
  const parts = (clean(visible ?? raw) ?? '').split(',').map(part => part.trim());
  const postcode = parts.length > 1 && /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(parts.at(-1)) ? parts.pop() : null;
  const country = /^(?:United Kingdom|England|UK|GB)$/i.test(parts.at(-1) ?? '') ? parts.pop() : null;
  const city = parts.length >= 2 ? parts.pop() : null;
  return { street: parts.join(', ') || null, city, country, postcode };
}

export function parseDirectory({ url, html }) {
  const $ = load(html);
  const list = $('main [data-test-id="article-list-grid"]');
  if (list.length !== 1) return invalid('London venue list container missing or ambiguous');
  const venues = listLinks($, list, url, VENUE_PATH, 'li > article a[href]').filter(link => link.label);
  if (!venues.length && !EMPTY_LIST.test(list.text())) return invalid('London venue list layout produced no labelled venue links');
  const next = pagination($, list, url);
  return parsed(
    [...venues.map(link => ({ stage: 'venue', url: link.url })), ...next.map(link => ({ stage: 'directory', url: link }))],
    venues.map(link => ({
      observation_kind: 'venue_link', external_key: link.key, name: link.label, source_url: link.url,
      evidence: evidence('directory.venue_label', link.label),
    })),
  );
}

export function parseVenue({ url, html }) {
  const key = identity(url, VENUE_PATH);
  const $ = load(html);
  const main = $('main');
  const name = clean(main.find('h1').first().text());
  if (!key || !name) return invalid('London venue detail identity missing');
  const place = schemaNodes(html).find(item => [].concat(item['@type'] ?? []).some(type =>
    ['EventVenue', 'PerformingArtsTheater', 'Place'].includes(type)) &&
    identity(sourceUrl(item.url, url), VENUE_PATH) === key);
  const addressLabel = clean(main.find('[data-test-id="venue-address"]').first().text());
  if (!place && !addressLabel) return invalid('London venue details missing');

  const headings = main.find('h2,h3').filter((_, heading) =>
    /^(?:all|current|upcoming|past|previous)(?: and upcoming)? (?:events|shows)(?: at\b|$)/i.test($(heading).text().trim()));
  const eventLinks = new Map();
  const next = new Set();
  let empty = main.find('[data-test-id="no-events"]').toArray().some(el => EMPTY_LIST.test($(el).text()));
  for (const heading of headings.toArray()) {
    const section = $(heading).closest('section');
    if (!section.length) continue;
    const listing = clean($(heading).text());
    empty ||= EMPTY_LIST.test(section.text());
    for (const link of listLinks($, section, url, EVENT_PATH)) {
      const item = eventLinks.get(link.url) ?? { ...link, listings: new Set() };
      item.label ??= link.label;
      item.listings.add(listing);
      eventLinks.set(link.url, item);
    }
    for (const link of pagination($, section, url)) next.add(link);
  }
  if (!eventLinks.size && !empty) return invalid('London venue event lists missing or changed');

  const address = addressFrom(place, addressLabel);
  const auditoria = [...new Set(main.find('[data-auditorium], [data-test-id="auditorium-name"]')
    .toArray().map(el => clean($(el).attr('data-auditorium') || $(el).text())).filter(Boolean))];
  const observation = {
    observation_kind: 'venue', external_key: key, source_url: url, name, ...address, ...coordinates(place),
    auditorium: auditoria.length === 1 ? auditoria[0] : null, auditoria,
    resolution_reason: auditoria.length > 1 ? 'multiple_auditoria' : null,
    listing_state: eventLinks.size ? 'linked_events' : 'explicitly_empty',
    evidence: {
      name: evidence('venue.heading', name),
      address: evidence(place?.address ? 'json_ld.EventVenue.address' : 'venue.address',
        place?.address ? JSON.stringify(place.address) : addressLabel),
      coordinates: place?.geo ? evidence('json_ld.EventVenue.geo', JSON.stringify(place.geo)) : null,
    },
  };
  return parsed(
    [...eventLinks.values()].map(link => ({ stage: 'event', url: link.url }))
      .concat([...next].map(link => ({ stage: 'venue', url: link }))),
    [observation, ...[...eventLinks.values()].map(link => ({
      observation_kind: 'event_link', external_key: link.key, source_url: link.url,
      label: link.label, referring_venue_key: key, listings: [...link.listings].sort(),
      evidence: evidence('venue.event_card', link.label),
    }))],
  );
}

const DATE_LABELS = {
  'start date': 'start', 'first performance': 'start', 'from': 'start',
  'previews': 'preview', 'preview date': 'preview', 'previews from': 'preview',
  'opening date': 'opening', 'opening night': 'opening', 'press night': 'opening',
  'closing date': 'closing', 'closing night': 'closing', 'final performance': 'closing',
  'end date': 'end', 'booking until': 'booking_until', 'booking to': 'booking_until',
  'booking through': 'booking_until', 'dates': 'performance', 'performance date': 'performance', 'performance dates': 'performance',
};

function detailFields($, main) {
  const fields = new Map();
  for (const label of main.find('[data-test-id^="title-"], dt').toArray()) {
    if ($(label).closest('[data-test-id="markdown-content"], aside, [data-recommendations]').length) continue;
    const field = clean($(label).text())?.toLowerCase();
    if (!field) continue;
    const content = $(label).next();
    const labels = content.find('a, [data-category], time').toArray().map(el => clean($(el).text())).filter(Boolean);
    const text = clean(content.text(), 400);
    if (text) fields.set(field, [...fields.get(field) ?? [], { text, labels }]);
  }
  return fields;
}

function eventType(fields, structured, title) {
  const categories = (fields.get('categories') ?? []).flatMap(({ labels, text }) =>
    labels.length ? labels : text.split(/[,/|]/));
  const types = structured.flatMap(item => [].concat(item['@type'] ?? []));
  const typeEvidence = categories.map(value => clean(value)?.toLowerCase()).filter(Boolean);
  const sourceKind = [title, ...typeEvidence].join(' ');
  if (/\bworkshops?\b/i.test(sourceKind)) return { event_kind: 'workshop', show_type: null };
  if (typeEvidence.some(value => /^(?:master)?classes?$/.test(value)) || /\bmasterclass\b/i.test(title)) {
    return { event_kind: 'class', show_type: null };
  }
  if (typeEvidence.some(value => /^(?:building |theatre |guided )?tours?$/.test(value)) ||
      /\b(?:backstage|building|theatre|guided) tour\b/i.test(title)) {
    return { event_kind: 'building_tour', show_type: null };
  }
  // Categories are multi-valued ("Musicals, Biography, Drama"). "Drama" and "Plays & drama" are generic tags that
  // co-occur with musicals, so they only decide the type when nothing more specific is present. Two different
  // specific types (a comedy musical) stay unknown rather than guess.
  const specific = new Map([
    ['musical', 'musical'], ['musicals', 'musical'], ['play', 'play'], ['plays', 'play'], ['opera', 'opera'],
    ['ballet', 'dance'], ['dance', 'dance'], ['comedy', 'comedy'], ['stand up', 'standup'], ['stand-up', 'standup'],
  ]);
  const generic = new Set(['drama', 'plays & drama']);
  const known = [...new Set(typeEvidence.map(value => specific.get(value)).filter(Boolean))];
  if (known.length === 1) return { event_kind: 'show', show_type: known[0] };
  if (known.length > 1) return { event_kind: 'show', show_type: null };
  if (typeEvidence.some(value => generic.has(value))) return { event_kind: 'show', show_type: 'play' };
  if (types.includes('MusicEvent') || typeEvidence.some(value => /^concerts?$/.test(value))) {
    return { event_kind: 'concert', show_type: null };
  }
  if (types.includes('DanceEvent')) return { event_kind: 'show', show_type: 'dance' };
  if (types.includes('ComedyEvent')) return { event_kind: 'show', show_type: 'comedy' };
  return { event_kind: 'unknown', show_type: null };
}

export function parseEvent({ url, html }) {
  const key = identity(url, EVENT_PATH);
  const $ = load(html);
  const main = $('main');
  const title = clean(main.find('[data-test-id="product-name"]').first().text())?.replace(/\s+tickets$/i, '');
  if (!key || !title) return invalid('London event detail identity missing');
  const product = main.find('[data-test-id="main-content"]').first();
  const fields = detailFields($, product.length ? product : main);
  const structured = eventsFromJsonLd(jsonLdBlocks(html)).filter(item =>
    identity(sourceUrl(item.url, url), EVENT_PATH) === key);
  const dates = structured.flatMap(item => [
    ...(item.startDate ? sourceDateClaims(item.startDate, 'start', 'json_ld.Event.startDate') : []),
    ...(item.endDate ? sourceDateClaims(item.endDate, 'end', 'json_ld.Event.endDate') : []),
  ]);
  for (const [label, kind] of Object.entries(DATE_LABELS)) {
    for (const value of fields.get(label) ?? []) dates.push(...sourceDateClaims(value.text, kind, `detail.${label}`));
  }

  const competing = kind => new Set(dates.filter(claim => claim.kind === kind && claim.date).map(claim => claim.date));
  const inconsistent = Object.values(DATE_LABELS).some(kind => kind !== 'performance' && competing(kind).size > 1);
  const starts = dates.filter(claim => ['start', 'preview', 'opening', 'performance'].includes(claim.kind) && claim.date);
  const ends = dates.filter(claim => ['end', 'closing'].includes(claim.kind) && claim.date);
  const conflicted = inconsistent || ends.some(end => starts.some(start => end.date < start.date));
  const venueLink = main.find('[data-test-id="venue-name"] a[href]').first();
  const linkUrl = sourceUrl(venueLink.attr('href'), url);
  const locations = structured.flatMap(item => [].concat(item.location ?? [])).filter(location => typeof location === 'object');
  const locationUrls = [...new Set([linkUrl, ...locations.map(place => sourceUrl(place.url, url))]
    .filter(value => identity(value, VENUE_PATH)))];
  const venueKeys = [...new Set(locationUrls.map(value => identity(value, VENUE_PATH)))];
  const location = locations.find(place => identity(sourceUrl(place.url, url), VENUE_PATH) === venueKeys[0]);
  const venueName = clean(venueLink.text()) ?? clean(location?.name) ?? fields.get('venue')?.[0]?.text ?? null;

  return parsed(locationUrls.map(link => ({ stage: 'venue', url: link })), [{
    observation_kind: 'event', external_key: key, source_url: url, raw_title: title,
    ...eventType(fields, structured, title),
    venue: {
      external_key: venueKeys.length === 1 ? venueKeys[0] : null,
      source_url: venueKeys.length === 1 ? locationUrls[0] : null,
      name: venueName, auditorium: fields.get('auditorium')?.[0]?.text ?? null,
      ...addressFrom(location, main.find('[data-test-id="venue-address"]').first().text()),
    },
    dates, date_status: conflicted ? 'conflicting' : starts.length ? 'supported' : 'missing',
    reasons: [
      ...(conflicted ? ['conflicting_date_statements'] : starts.length ? [] : ['missing_supported_start']),
      ...(venueKeys.length > 1 ? ['conflicting_venue_links'] : venueKeys.length ? [] : ['missing_venue_identity']),
    ],
    evidence: {
      title: evidence('event.heading', title),
      venue: evidence('event.venue_label', venueName),
      categories: (fields.get('categories') ?? []).map(value => evidence('event.categories', value.text)),
    },
  }]);
}

export const londonTheatre = {
  version: 'london-theatre-v3',
  maxBytes: 6_000_000,
  seeds: [{ scope: 'venue-directory', stage: 'directory', url: ORIGIN + '/venues' }],
  parsers: { directory: parseDirectory, venue: parseVenue, event: parseEvent },
};
