// A deterministic look at a candidate source site (#541). No model: it fetches a few pages politely and
// reports their structure so a person or the add-source skill can judge whether the site fits
// directory -> venue -> show. Usage:
//   node supabase/scripts/crawl/probe.mjs --url <seed URL> --key <source_key> [--max-pages 12]
// Output goes to supabase/scripts/crawl/.probe/<key>/ (never committed).
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { load } from 'cheerio';
import { createFetcher } from './fetch.mjs';
import { jsonLdBlocks } from './sources/theatre-site.mjs';

const KEY = /^[a-z][a-z0-9_]{0,63}$/;
const CHROME = 'header, footer, nav, aside';
const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? (?:${MONTHS}) \\d{4}\\b`, 'gi'),
  new RegExp(`\\b(?:${MONTHS}) \\d{1,2}(?:st|nd|rd|th)?, \\d{4}\\b`, 'gi'),
];
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/;
const US_ZIP = /\b[A-Z]{2},? \d{5}(?:-\d{4})?\b/;

// "/venue/apollo-theatre" -> "/venue/*", "/shows/london" -> "/shows/*", "/" -> "/". The query is dropped.
export function linkShape(url) {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return segments.length ? '/' + [segments[0], ...segments.slice(1).map(() => '*')].join('/') : '/';
}

// The hosts a probe stays on: the seed's and its www. twin.
export function siteHosts(seedUrl) {
  const host = new URL(seedUrl).hostname.toLowerCase();
  return [host, host.startsWith('www.') ? host.slice(4) : `www.${host}`];
}

// Same-site links outside header, footer, nav and aside, in document order, without fragments.
export function collectLinks(html, pageUrl, hosts) {
  const $ = load(html ?? '');
  const links = [];
  const seen = new Set();
  for (const element of $('a[href]').toArray()) {
    if ($(element).closest(CHROME).length) continue;
    let target;
    try { target = new URL($(element).attr('href'), pageUrl); } catch { continue; }
    if (!/^https?:$/.test(target.protocol) || !hosts.includes(target.hostname.toLowerCase())) continue;
    target.hash = '';
    if (seen.has(target.href)) continue;
    seen.add(target.href);
    links.push({ url: target.href, shape: linkShape(target.href) });
  }
  return links;
}

function jsonLdTypes(blocks) {
  const types = new Set();
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const type of [].concat(node['@type'] ?? [])) types.add(String(type));
    Object.values(node).forEach(value => { if (value && typeof value === 'object') walk(value); });
  };
  walk(blocks);
  return [...types];
}

// What one page offers, counted from its HTML.
export function pageSignals(html, pageUrl) {
  const $ = load(html ?? '');
  const types = jsonLdTypes(jsonLdBlocks(html));
  $('script, style, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ');
  const dateSignals = DATE_PATTERNS.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0);
  const addressSignals = types.some(type => /PostalAddress|Place/.test(type)) || $('[itemprop="address"]').length > 0
    || UK_POSTCODE.test(text) || US_ZIP.test(text);
  const here = new URL(pageUrl);
  const hasPagination = $('a[rel~="next"]').length > 0 || $('a[href]').toArray().some(element => {
    try {
      const target = new URL($(element).attr('href'), pageUrl);
      return target.pathname === here.pathname && ['page', 'offset', 'start'].some(name => target.searchParams.has(name));
    } catch { return false; }
  });
  return { title: $('title').first().text().replace(/\s+/g, ' ').trim() || null, jsonld_types: types,
    date_signals: dateSignals, address_signals: addressSignals, has_pagination: hasPagination };
}

const countShapes = links => links.reduce((counts, link) => ({ ...counts, [link.shape]: (counts[link.shape] ?? 0) + 1 }), {});

// Deterministic hints, not a verdict. `pages` are fetched pages: { url, shape, signals, links }.
export function classifyShapes(pages, seedShape) {
  const shapes = [...new Set(pages.map(page => page.shape))];
  const of = shape => pages.filter(page => page.shape === shape);
  const venues = new Set(shapes.filter(shape => of(shape).some(page => page.signals.address_signals
    && Object.entries(countShapes(page.links)).some(([other, count]) => other !== shape && count >= 3))));
  const events = new Set(shapes.filter(shape => of(shape).some(page => page.signals.jsonld_types.some(type => /Event/.test(type))
    || (page.signals.date_signals >= 1 && page.links.some(link => venues.has(link.shape))))));
  const directories = new Set(shapes.filter(shape => shape === seedShape || (of(shape).length > 0
    && of(shape).filter(page => page.links.some(link => venues.has(link.shape))).length / of(shape).length > 0.5)));
  return Object.fromEntries(shapes.map(shape => [shape, {
    pages: of(shape).length,
    venue_candidate: venues.has(shape), event_candidate: events.has(shape), directory_candidate: directories.has(shape),
  }]));
}

export function fitOf(classes) {
  const rows = Object.values(classes);
  const venue = rows.some(row => row.venue_candidate);
  const event = rows.some(row => row.event_candidate);
  return venue && event ? 'likely' : event && !venue ? 'no_venue_pages' : 'unclear';
}

// The next URLs to fetch, given the pages fetched so far (the seed first). At most `maxPages` pages in all.
// First round: the three shapes with the most links on the seed, two pages each, then one pagination link.
// After that: shapes not yet sampled, in the order their links appear, two pages each.
export function planSamples({ pages, maxPages }) {
  const room = maxPages - pages.length;
  if (room <= 0) return [];
  const fetched = new Set(pages.map(page => page.url));
  const sampled = new Set(pages.map(page => page.shape));
  const picks = [];
  const take = url => { if (!fetched.has(url) && !picks.includes(url)) picks.push(url); };
  // Two different pages per shape: links that differ only by query string are the same page.
  const byPath = links => links.filter((link, index) => links.findIndex(other => new URL(other.url).pathname === new URL(link.url).pathname) === index);
  const firstTwo = (links, shape) => byPath(links.filter(link => link.shape === shape)).slice(0, 2).forEach(link => take(link.url));
  if (pages.length === 1) {
    const [seed] = pages;
    const ranked = Object.entries(countShapes(byPath(seed.links))).filter(([shape]) => !sampled.has(shape))
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([shape]) => shape);
    ranked.forEach(shape => firstTwo(seed.links, shape));
    if (seed.next) take(seed.next);
  } else {
    const links = pages.flatMap(page => page.links);
    for (const shape of [...new Set(links.map(link => link.shape))].filter(shape => !sampled.has(shape))) firstTwo(links, shape);
  }
  return picks.slice(0, room);
}

function nextLink(html, pageUrl, hosts) {
  const $ = load(html ?? '');
  const here = new URL(pageUrl);
  for (const element of $('a[href]').toArray()) {
    if ($(element).closest(CHROME).length && !$(element).is('[rel~="next"]')) {
      // Pagination often sits in a nav; only an explicit rel=next is trusted there.
      continue;
    }
    try {
      const target = new URL($(element).attr('href'), pageUrl);
      if (!hosts.includes(target.hostname.toLowerCase())) continue;
      target.hash = '';
      const paged = target.pathname === here.pathname && ['page', 'offset', 'start'].some(name => target.searchParams.has(name));
      if ($(element).is('[rel~="next"]') || paged) return target.href;
    } catch { /* ignore a bad href */ }
  }
  return null;
}

// Runs the probe with an injected fetcher. Returns { exitCode, report }.
export async function runProbe({ url, key, maxPages = 12, fetchPage, outDir, log = console.log }) {
  if (!KEY.test(key ?? '')) throw new Error('--key must match ^[a-z][a-z0-9_]{0,63}$');
  if (!/^https?:\/\//i.test(url ?? '')) throw new Error('--url must be an http or https URL');
  if (!Number.isInteger(maxPages) || maxPages < 3 || maxPages > 20) throw new Error('--max-pages must be 3 to 20');
  const hosts = siteHosts(url);
  const pages = [];
  const record = [];

  const empty = { title: null, jsonld_types: [], date_signals: 0, address_signals: false, has_pagination: false };
  async function visit(target) {
    const result = await fetchPage(target);
    const n = pages.length + 1;
    const shape = linkShape(target);
    const row = { n, url: target, shape, status: result.status, bytes: result.html ? Buffer.byteLength(result.html) : 0 };
    if (result.status !== 'ok') {
      Object.assign(row, { error: result.error ?? result.status });
      record.push(row);
      pages.push({ n, url: target, shape, signals: empty, links: [], next: null, html: null });
      return result;
    }
    const base = result.url ?? target;
    const links = collectLinks(result.html, base, hosts);
    const signals = pageSignals(result.html, base);
    Object.assign(row, { title: signals.title, jsonld_types: signals.jsonld_types, link_shapes: countShapes(links),
      has_pagination: signals.has_pagination, date_signals: signals.date_signals, address_signals: signals.address_signals });
    record.push(row);
    pages.push({ n, url: target, shape, signals, links, next: nextLink(result.html, base, hosts), html: result.html });
    return result;
  }

  const seed = await visit(url);
  if (seed.status === 'blocked') {
    log(`The seed is not available to us (${seed.error}). Do not crawl this site; tell the owner.`);
    return { exitCode: 1, report: { key, seed: url, fit: 'blocked', pages: record } };
  }
  if (seed.status !== 'ok') {
    log(`The seed could not be fetched (${seed.error}).`);
    return { exitCode: 1, report: { key, seed: url, fit: 'unclear', pages: record } };
  }
  for (;;) {
    const next = planSamples({ pages, maxPages });
    if (!next.length) break;
    for (const target of next) await visit(target);
  }

  const classes = classifyShapes(pages, linkShape(url));
  const report = { key, seed: url, max_pages: maxPages, fit: fitOf(classes), shapes: classes, pages: record };
  if (outDir) {
    await mkdir(`${outDir}/${key}/pages`, { recursive: true });
    await writeFile(`${outDir}/${key}/report.json`, JSON.stringify(report, null, 2));
    for (const page of pages.filter(page => page.html)) await writeFile(`${outDir}/${key}/pages/${page.n}.html`, page.html);
  }
  log(['shape', 'pages', 'venue', 'event', 'directory'].join('\t'));
  for (const [shape, row] of Object.entries(classes)) log([shape, row.pages, row.venue_candidate ? 'yes' : '-', row.event_candidate ? 'yes' : '-', row.directory_candidate ? 'yes' : '-'].join('\t'));
  log(`fit: ${report.fit}`);
  return { exitCode: 0, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { url: { type: 'string' }, key: { type: 'string' }, 'max-pages': { type: 'string', default: '12' } } });
  runProbe({
    url: values.url, key: values.key, maxPages: Number(values['max-pages']),
    fetchPage: createFetcher({ minDelayMs: 5000, conditional: false }),
    outDir: new URL('./.probe', import.meta.url).pathname,
  }).then(result => { process.exitCode = result.exitCode; }).catch(error => { console.error(error.message); process.exitCode = 2; });
}
