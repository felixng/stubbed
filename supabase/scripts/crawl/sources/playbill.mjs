import { load } from 'cheerio';
import { canonicalTaskUrl } from '../frontier-url.mjs';
import { sourceDateClaims } from './source-dates.mjs';
import { eventsFromJsonLd, jsonLdBlocks } from './theatre-site.mjs';

const ORIGIN = 'https://playbill.com';
const HOSTS = ['playbill.com', 'www.playbill.com'];
const VENUE_PATH = /^\/venue\/([a-z0-9][a-z0-9-]+)\/?$/i;
const EVENT_PATH = /^\/production\/([a-z0-9][a-z0-9-]+)\/?$/i;
const titleLink = '.bsp-list-promo-title a[href]';
const nonContent = 'header, footer, aside, [data-ad], [data-recommendations]';

function clean(value, limit = 300) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) || null : null;
}

function sourceUrl(value, base = ORIGIN) {
  return canonicalTaskUrl(value, { base, allowedHosts: HOSTS });
}

function identity(url, path) {
  const key = url ? path.exec(new URL(url).pathname)?.[1]?.toLowerCase() : null;
  return key && key !== 'view-more' ? key : null;
}

const evidence = (field, value) => ({ field, text: clean(value, 400) });
const invalid = reason => ({ status: 'invalid', reason });

function links($, selection, base, path) {
  const rows = new Map();
  for (const element of selection.toArray()) {
    const anchor = $(element);
    if (anchor.closest(nonContent).length) continue;
    const url = sourceUrl(anchor.attr('href'), base);
    const key = identity(url, path);
    const label = clean(anchor.text());
    if (key && (!rows.has(url) || label)) rows.set(url, { url, key, label });
  }
  return [...rows.values()];
}

function pagination($, container, url) {
  const pathname = new URL(url).pathname.replace(/\/$/, '');
  const anchors = container.find('a[rel~="next"], a[rel~="prev"], nav[aria-label*="pagination" i] a, .pagination a');
  return [...new Set(anchors.toArray().map(anchor => sourceUrl($(anchor).attr('href'), url)).filter(link => {
    if (!link || link === url) return false;
    const next = new URL(link);
    return next.pathname.replace(/\/$/, '') === pathname
      && ['page', 'offset', 'start'].some(key => next.searchParams.has(key));
  }))];
}

export function parseDirectory({ url, html }) {
  const $ = load(html);
  // The directory's labelled theatre cards are separate from the production
  // links in each theatre's editorial description.
  const venueLinks = links($, $(titleLink), url, VENUE_PATH).filter(link => link.label);
  if (!venueLinks.length) return invalid('Playbill directory produced no labelled venue cards');
  const pages = pagination($, $('body'), url);
  return {
    children: [...venueLinks.map(link => ({ stage: 'venue', url: link.url })),
      ...pages.map(link => ({ stage: 'directory', url: link }))],
    observations: venueLinks.map(link => ({
      observation_kind: 'venue_link', external_key: link.key, name: link.label, source_url: link.url,
      evidence: evidence('directory.venue_card', link.label),
    })),
  };
}

function venueAddress(raw) {
  const parts = (raw ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const last = parts.at(-1);
  let country = null;
  if (/^(?:EN|GB|UK|England|United Kingdom)$/i.test(last ?? '')) {
    country = 'GB';
    parts.pop();
  } else if (/^(?:US|USA|United States)$/i.test(last ?? '')) {
    country = 'US';
    parts.pop();
  }
  const postcode = /^(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{5}(?:-\d{4})?)$/i.test(parts.at(-1) ?? '')
    ? parts.pop() : null;
  // Playbill uses the conventional New York, NY address notation on Broadway.
  if (parts.at(-1) === 'NY' && parts.at(-2) === 'New York') {
    parts.pop();
    country ??= 'US';
  }
  const city = parts.length > 1 && (country || parts.length === 2) ? parts.pop() : null;
  if (parts.at(-1) === city) parts.pop();
  return { street: parts.join(', ') || null, city, country, postcode };
}

export function parseVenue({ url, html }) {
  const $ = load(html);
  const key = identity(url, VENUE_PATH);
  const bio = $('.bsp-bio').first();
  const name = clean(bio.find('.bsp-bio-title').first().text());
  if (!key || !name) return invalid('Playbill venue identity missing');
  const rawAddress = clean(bio.find('.bsp-bio-subtitle .map-link').first().text());
  const eventLinks = new Map();
  const pageLinks = new Set(pagination($, $('body'), url));
  let explicitlyEmpty = false;
  for (const module of $('.bsp-gallery-module-component, [data-production-list]').toArray()) {
    const listing = $(module);
    const label = clean(listing.find('.bsp-component-title, h2, h3').first().text());
    if (!label || !/^(?:(?:previous|past|upcoming|current|future) (?:shows|productions)|productions at)\b/i.test(label)) continue;
    for (const link of links($, listing.find(titleLink), url, EVENT_PATH)) eventLinks.set(link.url, { ...link, labelGroup: label });
    for (const next of pagination($, listing, url)) pageLinks.add(next);
    explicitlyEmpty ||= /\bno (?:shows|productions) (?:found|listed|scheduled)\b/i.test(listing.text());
  }
  for (const link of links($, $('.tour-widget-box a[href]'), url, EVENT_PATH)) {
    if (!eventLinks.has(link.url)) eventLinks.set(link.url, { ...link, labelGroup: 'Current production' });
  }
  if (!eventLinks.size && !explicitlyEmpty) return invalid('Playbill venue production lists missing or changed');

  const address = venueAddress(rawAddress);
  const auditoria = [...new Set(bio.find('[data-auditorium]').toArray()
    .map(el => clean($(el).attr('data-auditorium') || $(el).text())).filter(Boolean))];
  return {
    children: [...eventLinks.values()].map(link => ({ stage: 'event', url: link.url }))
      .concat([...pageLinks].map(link => ({ stage: 'venue', url: link }))),
    observations: [{
      observation_kind: 'venue', external_key: key, source_url: url, name, ...address,
      auditorium: auditoria.length === 1 ? auditoria[0] : null, auditoria,
      resolution_reason: auditoria.length > 1 ? 'multiple_auditoria' : address.country ? null : 'incomplete_address',
      evidence: { name: evidence('venue.bio_title', name), address: evidence('venue.map_address', rawAddress) },
    }, ...[...eventLinks.values()].map(link => ({
      observation_kind: 'event_link', external_key: link.key, source_url: link.url,
      label: link.label, referring_venue_key: key, listings: [link.labelGroup],
      evidence: evidence('venue.production_card', link.label),
    }))],
  };
}

const DATE_LABELS = {
  'first preview': 'preview', 'preview date': 'preview', 'opening date': 'opening', 'press opening': 'opening',
  'start date': 'start', 'first performance': 'start', 'closing date': 'closing', 'final performance': 'closing',
  'booking until': 'booking_until', 'end date': 'end', 'performance date': 'performance', 'performance dates': 'performance',
};

function facts($, container) {
  return container.find('.bsp-list-promo-title, dt').toArray().flatMap(element => {
    const title = $(element);
    const label = clean(title.text())?.toLowerCase().replace(/:$/, '');
    const kind = DATE_LABELS[label];
    if (!kind) return [];
    const value = title.is('dt') ? title.next('dd').text()
      : title.closest('li').find('.info-circular').children().toArray().map(el => clean($(el).text())).filter(Boolean).join(' ');
    return clean(value) ? sourceDateClaims(value, kind, `detail.${label}`) : [];
  });
}

function dateState(claims) {
  for (const kind of ['start','preview','opening','closing','booking_until','end']) {
    if (new Set(claims.filter(claim => claim.kind === kind && claim.date).map(claim => claim.date)).size > 1) return 'conflicting';
  }
  const starts = claims.filter(claim => ['start','preview','opening','performance'].includes(claim.kind) && claim.date);
  const ends = claims.filter(claim => ['end','closing'].includes(claim.kind) && claim.date);
  if (ends.some(end => starts.some(start => end.date < start.date))) return 'conflicting';
  return starts.length ? 'supported' : 'missing';
}

const TYPES = new Map([
  ['musical','musical'], ['play','play'], ['opera','opera'], ['dance','dance'], ['ballet','dance'],
  ['comedy','comedy'], ['stand-up','standup'],
]);

function eventType(labels, structured, title) {
  const kinds = new Set(labels.map(value => TYPES.get(value.toLowerCase())).filter(Boolean));
  const tags = labels.join(' ') + ' ' + title;
  if (/\bworkshop\b/i.test(tags)) return { event_kind: 'workshop', show_type: null };
  if (/\b(?:masterclass|acting class|dance class)\b/i.test(tags) || labels.some(label => /^class$/i.test(label))) return { event_kind: 'class', show_type: null };
  if (/\b(?:guided|theatre|backstage|building) tour\b/i.test(tags)) return { event_kind: 'building_tour', show_type: null };
  if (labels.some(label => /^concert$/i.test(label)) || structured.some(item => [].concat(item['@type']).includes('MusicEvent'))) {
    return { event_kind: 'concert', show_type: null };
  }
  return { event_kind: 'show', show_type: kinds.size === 1 ? [...kinds][0] : null };
}

function venueLink(link) {
  return { external_key: link?.key ?? null, source_url: link?.url ?? null, name: link?.label ?? null };
}

export function parseEvent({ url, html }) {
  const $ = load(html);
  const key = identity(url, EVENT_PATH);
  const bio = $('.bsp-bio').first();
  const title = clean(bio.find('.bsp-bio-title').first().text());
  const detail = $('.bsp-gallery-module-component').filter((_, el) =>
    /^pro info$/i.test($(el).find('.bsp-component-title').first().text().trim())).first();
  if (!key || !title || !detail.length) return invalid('Playbill production identity or Pro Info missing');

  const explicitVenues = links($, bio.find('.bsp-bio-links-top a[href]'), url, VENUE_PATH);
  const knownVenue = explicitVenues.length === 1 ? explicitVenues[0] : null;
  const structured = eventsFromJsonLd(jsonLdBlocks(html))
    .filter(item => identity(sourceUrl(item.url ?? item['@id'], url), EVENT_PATH) === key);
  const dateClaims = facts($, detail);
  const segmentLinks = new Map(explicitVenues.map(link => [link.url, link]));
  const segments = [];
  const explicitSegments = detail.find('[data-engagement-id]');
  if (explicitSegments.length) {
    for (const element of explicitSegments.toArray()) {
      const block = $(element);
      const segmentKey = clean(block.attr('data-engagement-id'), 200);
      const venues = links($, block.find('a[href]'), url, VENUE_PATH);
      if (!segmentKey || venues.length !== 1) continue;
      segmentLinks.set(venues[0].url, venues[0]);
      segments.push({ segment_key: segmentKey, venue: venueLink(venues[0]), dates: facts($, block) });
    }
  } else {
    for (const item of structured) {
      const locations = [].concat(item.location ?? []).flatMap(location => {
        const target = sourceUrl(location?.url, url);
        const key = identity(target, VENUE_PATH);
        return key ? [{ url: target, key, label: clean(location.name) }] : [];
      });
      for (const location of locations) segmentLinks.set(location.url, location);
      const structuredDates = [
        ...(item.startDate ? sourceDateClaims(item.startDate, 'start', 'json_ld.Event.startDate') : []),
        ...(item.endDate ? sourceDateClaims(item.endDate, 'end', 'json_ld.Event.endDate') : []),
      ];
      if (knownVenue && locations.length === 1 && locations[0].key === knownVenue.key) dateClaims.push(...structuredDates);
      else if (locations.length === 1 && item.eventSeries) {
        const segmentKey = clean(item.identifier, 200);
        if (segmentKey) segments.push({ segment_key: segmentKey, venue: venueLink(locations[0]), dates: structuredDates });
      }
    }
  }

  const labels = bio.find('.bsp-bio-subtitle').first().find('.bsp-bio-sub-text').toArray().map(el => clean($(el).text())).filter(Boolean);
  const selectedVenue = segmentLinks.size === 1 ? [...segmentLinks.values()][0] : null;
  const state = segments.length ? (segments.some(segment => dateState(segment.dates) === 'conflicting') ? 'conflicting'
    : segments.some(segment => dateState(segment.dates) === 'supported') ? 'supported' : 'missing') : dateState(dateClaims);
  return {
    children: [...segmentLinks.values()].map(link => ({ stage: 'venue', url: link.url })),
    observations: [{
      observation_kind: 'event', external_key: key, source_url: url, raw_title: title,
      ...eventType(labels, structured, title), venue: venueLink(selectedVenue), dates: segments.length ? [] : dateClaims,
      ...(segments.length ? { segments } : {}),
      date_status: state,
      reasons: [
        ...(state === 'missing' ? ['missing_supported_start'] : state === 'conflicting' ? ['conflicting_date_statements'] : []),
        ...(!selectedVenue && !segments.length ? ['unresolved_venue_identity'] : []),
      ],
      evidence: { title: evidence('production.bio_title', title),
        categories: labels.map(label => evidence('production.category', label)) },
    }],
  };
}

export const playbill = {
  version: 'playbill-v1',
  seeds: [
    { scope: 'broadway-directory', stage: 'directory', url: ORIGIN + '/broadway-theatres' },
    { scope: 'supplied-stratford-east', stage: 'venue', url: ORIGIN + '/venue/theatre-royal-stratford-east-london-en' },
    { scope: 'supplied-circle-in-the-square', stage: 'venue', url: ORIGIN + '/venue/circle-in-the-square-theatre-vault-0000000092' },
  ],
  parsers: { directory: parseDirectory, venue: parseVenue, event: parseEvent },
};
