// Polite fetching for the crawler: robots.txt, one request at a time per host
// with a minimum gap, an identifying User-Agent, and conditional requests.
// No packages. Every failure comes back as a status (never a throw), so one
// bad site can't stop a run.
import { setTimeout as delay } from 'node:timers/promises';

export const USER_AGENT = 'Stubbed/1.0 (+https://getstubbed.app; what\'s-on research crawler)';
const ROBOTS_AGENT = 'stubbed';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 20_000;
// A whole page fetch: queueing for the shared host slot, robots, and each redirect hop.
// Current London Theatre shows redirect once, so with four workers and a 5 s host gap the
// old 40 s budget expired while waiting (live probe, 2026-11-08). Leases last 5 minutes.
const PAGE_BUDGET_MS = 120_000;

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

// example.com and www.example.com are the same site. Nothing else is.
export function sameHost(a, b) {
  return String(a).toLowerCase().replace(/^www\./, '') === String(b).toLowerCase().replace(/^www\./, '');
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

async function readCapped(response, strict = false, maxBytes = MAX_BYTES) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const body = await response.text();
    if (strict && Buffer.byteLength(body) > maxBytes) throw new Error('Response exceeded the byte limit');
    return body.slice(0, maxBytes);
  }
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    text += decoder.decode(value, { stream: true });
    if (strict && bytes > maxBytes) {
      await reader.cancel();
      throw new Error('Response exceeded the byte limit');
    }
    if (!strict && bytes >= maxBytes) { await reader.cancel(); break; }
  }
  return text;
}

// Shared by all four workers and all fetcher instances in a job. Requests to
// one host wait for the previous response and preserve its minimum start gap.
export function createHostGate({sleep=delay,now=Date.now}={}) {
 const queues=new Map(),last=new Map();
 return async(host,gap,fn)=>{
  const previous=queues.get(host)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{const wait=(last.get(host)??-Infinity)+gap-now();if(wait>0)await sleep(wait);last.set(host,now());return fn();});
  queues.set(host,next);try{return await next;}finally{if(queues.get(host)===next)queues.delete(host);}
 };
}

// fetchPage(url) -> { status: 'ok' | 'not_modified' | 'blocked' | 'failed', html?, etag?, lastModified?, error? }
export function createFetcher({ fetchFn = fetch, minDelayMs = 2000, cache = {}, conditional = true, gate = null, sleep = delay, now = Date.now } = {}) {
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
      const res = gate ? await gate(u.host,minDelayMs,()=>get(`${u.origin}/robots.txt`)) : await get(`${u.origin}/robots.txt`);
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
      const headers = {
        ...(known.etag ? { 'If-None-Match': known.etag } : {}),
        ...(known.lastModified ? { 'If-Modified-Since': known.lastModified } : {}),
      };
      const res = gate ? await gate(u.host,Math.max(minDelayMs,(rules.crawlDelay??0)*1000),()=>get(key,headers)) : await get(key,headers);
      if (res.status === 304) return { status: 'not_modified' };
      if (res.status === 401 || res.status === 403 || res.status === 429) return { status: 'blocked', error: `The site answered ${res.status}` };
      if (!res.ok) return { status: 'failed', error: `The site answered ${res.status}` };
      if (res.url && !sameHost(new URL(res.url).host, u.host)) return { status: 'failed', error: 'Redirected to another site' };
      const type = res.headers.get('content-type') ?? '';
      if (!/html|xml|json|text\//i.test(type)) return { status: 'failed', error: `Not a web page (${type || 'no content type'})` };
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      if (etag || lastModified) cache[key] = { etag, lastModified };
      return { status: 'ok', url: res.url || key, html: await readCapped(res), etag, lastModified };
    } catch (error) {
      return { status: 'failed', error: error?.name === 'TimeoutError' ? 'Timed out' : 'Could not fetch the page' };
    }
  };
}

// Bounded frontier requests check policy before every hop. The supplied gate
// covers reading the response as well as opening the connection.
export function createGuardedFetcher({ allowUrl, request, gate, minDelayMs, maxRedirects = 5, maxBytes = MAX_BYTES, onResponse = () => {} }) {
  const robots = new Map();
  const pendingRobots = new Map();
  const emptyRules = { allow: [], disallow: [], crawlDelay: null };

  async function readResponse(url, headers, signal, gapMs, context, wantsBody) {
    return gate(url.hostname, gapMs, signal, context, async () => {
      let response;
      try {
        response = await request(url, {
          headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity', ...headers },
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
      } catch (error) {
        onResponse({ url: url.href, status: 'request_error' });
        throw error;
      }
      onResponse({ url: url.href, status: response.status });
      const retryAfter = response.headers.get('retry-after');
      if (!wantsBody(response)) {
        await response.body?.cancel();
        return { status: response.status, headers: response.headers, retryAfter };
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new Error('Response exceeded the byte limit');
      }
      return { status: response.status, headers: response.headers, retryAfter, html: await readCapped(response, true, maxBytes) };
    });
  }

  async function readRobots(url, signal, context) {
    let target = new URL('/robots.txt', url);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const response = await readResponse(target, {}, signal, minDelayMs, context, r => r.ok);
      const redirect = redirectTarget(target, response);
      if (redirect) {
        if (redirect.origin !== url.origin || !allowUrl(redirect.href)) {
          return { status: 'blocked', error: 'Robots redirected outside its origin' };
        }
        target = redirect;
        continue;
      }
      if (response.status === 404 || response.status === 410) return { rules: emptyRules };
      if (response.status >= 200 && response.status < 300) return { rules: parseRobots(response.html) };
      return unavailable(response, 'robots.txt');
    }
    return { status: 'blocked', error: 'Robots redirect limit exceeded' };
  }

  async function rulesFor(url, signal, context) {
    if (robots.has(url.origin)) return robots.get(url.origin);
    if (pendingRobots.has(url.origin)) return pendingRobots.get(url.origin);
    const pending = readRobots(url, signal, context);
    pendingRobots.set(url.origin, pending);
    try {
      const result = await pending;
      if (result.rules) robots.set(url.origin, result);
      return result;
    } finally {
      pendingRobots.delete(url.origin);
    }
  }

  return async function fetchGuardedPage(value, { etag, lastModified, signal, context } = {}) {
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(PAGE_BUDGET_MS)]) : AbortSignal.timeout(PAGE_BUDGET_MS);
    let target = new URL(value);
    const headers = {
      Accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9',
      ...(etag ? { 'If-None-Match': etag } : {}),
      ...(lastModified ? { 'If-Modified-Since': lastModified } : {}),
    };
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!allowUrl(target.href)) return { status: 'blocked', error: 'URL outside the allowed hosts or schemes' };
      const { rules, ...unavailableRobots } = await rulesFor(target, requestSignal, context);
      if (!rules) return unavailableRobots;
      if (!isAllowed(rules, target.pathname + target.search)) return { status: 'blocked', error: 'Disallowed by robots.txt' };
      const gap = Math.max(minDelayMs, (rules.crawlDelay ?? 0) * 1000);
      const response = await readResponse(target, headers, requestSignal, gap, context,
        r => r.ok && /html|xml|json|text\//i.test(r.headers.get('content-type') ?? ''));
      const redirected = redirectTarget(target, response);
      if (redirected) { target = redirected; continue; }
      const validators = {
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
      };
      if (response.status === 304) return { status: 'not_modified', ...validators };
      if (response.status < 200 || response.status >= 300) return unavailable(response, 'Page');
      if (response.html === undefined) return { status: 'failed', error: 'Response is not a supported web page' };
      return { status: 'ok', url: target.href, html: response.html, ...validators };
    }
    return { status: 'failed', error: 'Page redirect limit exceeded' };
  };
}

function redirectTarget(url, response) {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  const location = response.headers.get('location');
  return location ? new URL(location, url) : null;
}

function unavailable(response, label) {
  const error = `${label} answered ${response.status}`;
  if (response.status === 429) return { status: 'rate_limited', error, retryAfter: response.retryAfter };
  if ([401, 403].includes(response.status)) return { status: 'blocked', error };
  return { status: 'failed', error };
}
