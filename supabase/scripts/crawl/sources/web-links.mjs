import { createHash } from 'node:crypto';
import { eventKind, eventsFromJsonLd, isoDate, jsonLdBlocks } from './theatre-site.mjs';

// Pasted links (#562): single show pages from any site whose page carries schema.org event data. The hosts are not
// fixed: the database adds a host to this source when an admin pastes a link on it (hosts: null keeps what is there).
// A show page is read as an `event` task, which queues a `venue` task on the same page for the place named in the data.

const clean = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const invalid = reason => ({ status: 'invalid', reason });
const evidence = (field, text) => ({ field, text: clean(String(text ?? '')).slice(0, 400) });
const MAX_TITLES = 5;

const TYPES = [[/DanceEvent/, 'dance'], [/ComedyEvent/, 'comedy'], [/MusicEvent/, 'concert']];
function showType(event) {
  const types = [].concat(event['@type'] ?? []).join(' ');
  return TYPES.find(([pattern]) => pattern.test(types))?.[1] ?? null;
}

function placeOf(event) {
  const raw = [].concat(event.location ?? []).find(item => item && (typeof item === 'string' || clean(item.name)));
  if (!raw) return null;
  return typeof raw === 'string' ? { name: clean(raw) } : raw;
}
const slug = text => clean(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const hostOf = url => new URL(url).hostname.replace(/^www\./, '');
const venueKey = (url, name) => `${hostOf(url)}:${slug(name)}`;
const eventKey = url => {
  const { hostname, pathname } = new URL(url);
  const key = `${hostname.replace(/^www\./, '')}${pathname.replace(/\/+$/, '')}`;
  return key.length <= 200 ? key : `${hostname}:${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
};

function titled(html) {
  const byTitle = new Map();
  for (const event of eventsFromJsonLd(jsonLdBlocks(html))) {
    const title = clean(event.name).slice(0, 300);
    if (!title) continue;
    byTitle.set(title, [...(byTitle.get(title) ?? []), event]);
  }
  return byTitle;
}

export function parseEvent({ url, html }) {
  const byTitle = titled(html);
  if (!byTitle.size) return invalid('No schema.org event data on this page');
  if (byTitle.size > MAX_TITLES) return invalid('This looks like a listing of many events, not one show');
  const children = [];
  const observations = [...byTitle].map(([title, events]) => {
    const starts = events.map(event => isoDate(event.startDate)).filter(Boolean).sort();
    const ends = events.map(event => isoDate(event.endDate) ?? isoDate(event.startDate)).filter(Boolean).sort();
    const start = starts[0] ?? null;
    const end = ends.at(-1) && ends.at(-1) !== start ? ends.at(-1) : null;
    const place = events.map(placeOf).find(Boolean);
    if (place && !children.length) children.push({ stage: 'venue', url });
    const kind = events.map(eventKind).find(item => item !== 'show') ?? 'show';
    return {
      observation_kind: 'event', external_key: eventKey(url), source_url: url, raw_title: title,
      event_kind: kind, show_type: events.map(showType).find(Boolean) ?? null,
      venue: { external_key: place ? venueKey(url, place.name) : null, source_url: place ? url : null, name: place?.name ?? null },
      dates: start ? [{ kind: 'start', date: start, evidence: evidence('jsonld.startDate', events[0].startDate) },
        ...(end ? [{ kind: 'end', date: end, evidence: evidence('jsonld.endDate', end) }] : [])] : [],
      date_status: start ? 'supported' : 'missing',
      reasons: [...(start ? [] : ['missing_supported_start']), ...(place ? [] : ['unresolved_venue_identity'])],
      evidence: { title: evidence('jsonld.name', title) },
    };
  });
  return { children, observations };
}

export function parseVenue({ url, html }) {
  const place = [...titled(html).values()].flat().map(placeOf).find(Boolean);
  if (!place?.name) return invalid('No venue named in the event data');
  const raw = place.address;
  const object = raw && typeof raw === 'object' && !Array.isArray(raw);
  const address = object
    ? { street: clean(raw.streetAddress), city: clean(raw.addressLocality),
      country: clean(typeof raw.addressCountry === 'object' ? raw.addressCountry?.name : raw.addressCountry), postcode: clean(raw.postalCode) }
    : { street: clean(raw) || null, city: null, country: null, postcode: null };
  const lat = Number(place.geo?.latitude ?? NaN);
  const lng = Number(place.geo?.longitude ?? NaN);
  const located = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    children: [],
    observations: [{
      observation_kind: 'venue', external_key: venueKey(url, place.name), source_url: url, name: clean(place.name), ...address,
      lat: located ? lat : null, lng: located ? lng : null, auditorium: null, auditoria: [],
      resolution_reason: address.country || address.postcode ? null : 'incomplete_address',
      evidence: { name: evidence('jsonld.location.name', place.name), address: evidence('jsonld.location.address', JSON.stringify(raw ?? '')) },
    }],
  };
}

export const webLinks = {
  key: 'web_links', displayName: 'Pasted links', kind: 'aggregate',
  hosts: null, dynamicHosts: true, minIntervalMs: 5000, authority: 1, scheduled: true, fixtures: 'web-links',
  fixtureUrls: { event: 'https://shows.example.test/whats-on/the-long-interval', venue: 'https://shows.example.test/whats-on/the-long-interval' },
  version: 'web-links-v1', seeds: [],
  parsers: { event: parseEvent, venue: parseVenue },
};
