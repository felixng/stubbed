// Polite fetching for the crawler: robots.txt, one request at a time per host
// with a minimum gap, an identifying User-Agent, and conditional requests.
// No packages. Every failure comes back as a status (never a throw), so one
// bad site can't stop a run.
import { setTimeout as delay } from 'node:timers/promises';

export const USER_AGENT = 'Stubbed/1.0 (+https://getstubbed.app; what\'s-on research crawler)';
const ROBOTS_AGENT = 'stubbed';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 20_000;

// Rules for our agent if the file names it, otherwise for "*".
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let sawRule = true;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || sawRule) { current = { agents: [], allow: [], disallow: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      sawRule = false;
    } else if (current && (field === 'allow' || field === 'disallow')) {
      sawRule = true;
      if (value) current[field].push(value);
    } else if (current && field === 'crawl-delay') {
      sawRule = true;
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  const mine = groups.filter(g => g.agents.includes(ROBOTS_AGENT));
  const chosen = mine.length ? mine : groups.filter(g => g.agents.includes('*'));
  return {
    allow: chosen.flatMap(g => g.allow),
    disallow: chosen.flatMap(g => g.disallow),
    crawlDelay: chosen.map(g => g.crawlDelay).find(d => d !== null) ?? null,
  };
}

function ruleMatches(rule, path) {
  const anchored = rule.endsWith('$');
  const pattern = (anchored ? rule.slice(0, -1) : rule).split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

// The longest matching rule wins; allow wins a tie.
export function isAllowed(rules, path) {
  let best = { length: -1, allow: true };
  for (const [list, allow] of [[rules.disallow, false], [rules.allow, true]]) {
    for (const rule of list) {
      if (ruleMatches(rule, path) && (rule.length > best.length || (rule.length === best.length && allow))) {
        best = { length: rule.length, allow };
      }
    }
  }
  return best.allow;
}

// One site per what's-on URL, however many venues share it.
export function siteKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return (await response.text()).slice(0, MAX_BYTES);
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    text += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BYTES) { await reader.cancel(); break; }
  }
  return text;
}

// fetchPage(url) -> { status: 'ok' | 'not_modified' | 'blocked' | 'failed', html?, etag?, lastModified?, error? }
export function createFetcher({ fetchFn = fetch, minDelayMs = 2000, cache = {}, conditional = true, sleep = delay, now = Date.now } = {}) {
  const lastRequest = new Map();   // host -> time of the last request
  const robots = new Map();        // origin -> rules

  async function wait(host, gapMs) {
    const last = lastRequest.get(host);
    if (last !== undefined) {
      const remaining = last + gapMs - now();
      if (remaining > 0) await sleep(remaining);
    }
    lastRequest.set(host, now());
  }

  async function get(url, headers = {}) {
    return fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.5', ...headers },
      redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  async function robotsFor(u) {
    if (robots.has(u.origin)) return robots.get(u.origin);
    let rules = { allow: [], disallow: [], crawlDelay: null };
    try {
      await wait(u.host, minDelayMs);
      const res = await get(`${u.origin}/robots.txt`);
      if (res.status === 401 || res.status === 403) rules = { allow: [], disallow: ['/'], crawlDelay: null };
      else if (res.ok) rules = parseRobots(await readCapped(res));
    } catch { /* no robots.txt we can read: allowed, but still polite */ }
    robots.set(u.origin, rules);
    return rules;
  }

  return async function fetchPage(url) {
    const key = siteKey(url);
    if (!key) return { status: 'failed', error: 'Not an http or https URL' };
    const u = new URL(key);
    try {
      const rules = await robotsFor(u);
      if (!isAllowed(rules, u.pathname + u.search)) return { status: 'blocked', error: 'Disallowed by robots.txt' };
      await wait(u.host, Math.max(minDelayMs, (rules.crawlDelay ?? 0) * 1000));
      const known = conditional ? (cache[key] ?? {}) : {};
      const res = await get(key, {
        ...(known.etag ? { 'If-None-Match': known.etag } : {}),
        ...(known.lastModified ? { 'If-Modified-Since': known.lastModified } : {}),
      });
      if (res.status === 304) return { status: 'not_modified' };
      if (res.status === 401 || res.status === 403 || res.status === 429) return { status: 'blocked', error: `The site answered ${res.status}` };
      if (!res.ok) return { status: 'failed', error: `The site answered ${res.status}` };
      if (res.url && new URL(res.url).host !== u.host) return { status: 'failed', error: 'Redirected to another site' };
      const type = res.headers.get('content-type') ?? '';
      if (!/html|xml|json|text\//i.test(type)) return { status: 'failed', error: `Not a web page (${type || 'no content type'})` };
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      if (etag || lastModified) cache[key] = { etag, lastModified };
      return { status: 'ok', html: await readCapped(res), etag, lastModified };
    } catch (error) {
      return { status: 'failed', error: error?.name === 'TimeoutError' ? 'Timed out' : 'Could not fetch the page' };
    }
  };
}
