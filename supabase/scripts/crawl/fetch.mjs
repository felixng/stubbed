// Polite fetching for the crawler: one request at a time per host
// with a minimum gap, an identifying User-Agent, and conditional requests.
// No packages. Every failure comes back as a status (never a throw), so one
// bad site can't stop a run.
import { setTimeout as delay } from 'node:timers/promises';

export const USER_AGENT = 'Stubbed/1.0 (+https://getstubbed.app; what\'s-on research crawler)';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 20_000;

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

  return async function fetchPage(url) {
    const key = siteKey(url);
    if (!key) return { status: 'failed', error: 'Not an http or https URL' };
    const u = new URL(key);
    try {
      const known = conditional ? (cache[key] ?? {}) : {};
      const headers = {
        ...(known.etag ? { 'If-None-Match': known.etag } : {}),
        ...(known.lastModified ? { 'If-Modified-Since': known.lastModified } : {}),
      };
      let res;
      if (gate) {
        res = await gate(u.host, minDelayMs, () => get(key, headers));
      } else {
        await wait(u.host, minDelayMs);
        res = await get(key, headers);
      }
      if (res.status === 304) return { status: 'not_modified' };
      if (res.status === 401 || res.status === 403 || res.status === 429) return { status: 'blocked', error: `The site answered ${res.status}` };
      if (!res.ok) return { status: 'failed', error: `The site answered ${res.status}` };
      if (res.url && new URL(res.url).host.replace(/^www\./, '') !== u.host.replace(/^www\./, '')) return { status: 'failed', error: 'Redirected to another site' };
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
