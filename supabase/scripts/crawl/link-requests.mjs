import { createGuardedFetcher, createHostGate } from './fetch.mjs';
import { requestPublicPage } from './frontier-network.mjs';
import { canonicalTaskUrl } from './frontier-url.mjs';

// Pasted links (#562). A request is a row an admin created in Backstage; this reads each new one once and acts:
// a show page is queued to be read on the next run, ahead of everything else. Anything else stays "Waiting"
// (a later step sets up directories). The page is fetched politely and only from its own host.

const twin = host => (host.startsWith('www.') ? host.slice(4) : `www.${host}`);

// Fetches one pasted page: robots.txt, 5 s gap, public addresses only, redirects stay on the site.
export function makeLinkFetcher({ request = requestPublicPage, gate = createHostGate() } = {}) {
  return async url => {
    const host = new URL(url).hostname;
    const hosts = [host, twin(host)];
    const fetchPage = createGuardedFetcher({
      allowUrl: value => canonicalTaskUrl(value, { allowedHosts: hosts }), request, minDelayMs: 5000,
      gate: (name, gap, _signal, _context, perform) => gate(name, gap, perform),
    });
    return fetchPage(url, { context: 'link-request' });
  };
}

const hasEvent = parsed => Array.isArray(parsed?.observations) && parsed.observations.some(row => row.observation_kind === 'event');

// Is this one show page? A known site is read by its own adapter; any other site by the generic reader.
export async function classifyShowPage(row, { adapters, fetchPage }) {
  const host = new URL(row.url).hostname;
  const owners = Object.values(adapters).filter(adapter =>
    adapter.kind === 'aggregate' && Array.isArray(adapter.hosts) && adapter.hosts.includes(host) && adapter.parsers?.event);
  const page = await fetchPage(row.url);
  if (page.status === 'blocked') return { outcome: 'unsupported', note: 'the site does not allow automated reading' };
  if (page.status !== 'ok') return { outcome: 'failed', note: 'the page could not be fetched' };
  for (const adapter of owners.length ? owners : [adapters.web_links]) {
    let parsed;
    try { parsed = await adapter.parsers.event({ url: page.url ?? row.url, html: page.html }); } catch { continue; }
    if (hasEvent(parsed)) return { outcome: 'show_page', source: adapter.key };
  }
  return { outcome: 'leave', reason: owners.length ? `not a show page of ${owners[0].displayName}` : 'no event data on the page' };
}

export async function processLinkRequests({ store, adapters, fetchPage, limit = 10 }) {
  const rows = await store.linkRequestsToProcess(limit);
  const handled = [];
  for (const row of rows) {
    try {
      const result = await classifyShowPage(row, { adapters, fetchPage });
      if (result.outcome === 'show_page') await store.queuePastedShowPage(row.id, result.source);
      else if (result.outcome === 'unsupported') await store.finishLinkRequest(row.id, 'unsupported', 'unsupported', result.note);
      else if (result.outcome === 'failed') await store.finishLinkRequest(row.id, 'failed', null, result.note);
      else await store.finishLinkRequest(row.id, 'new', null, null, { checked: true, reason: result.reason });
      handled.push({ id: row.id, ...result });
    } catch {
      await store.finishLinkRequest(row.id, 'failed', null, 'it could not be queued').catch(() => {});
      handled.push({ id: row.id, outcome: 'failed' });
    }
  }
  return handled;
}
