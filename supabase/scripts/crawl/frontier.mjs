import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { mapFour } from './concurrent.mjs';
import { createGuardedFetcher } from './fetch.mjs';
import { requestPublicPage } from './frontier-network.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { canonicalTaskUrl } from './frontier-url.mjs';
import { structuredReader } from './sources/theatre-site.mjs';
import { londonTheatre } from './sources/london-theatre.mjs';

const STAGES = ['directory', 'venue', 'event'];
const RETRIES = [60, 300, 1800, 7200, 43200];
const CLEANUP_MS = 90_000;
const HEARTBEAT_MS = 60_000;

class HostDeferred extends Error {
  constructor(retryAt) {
    super('Host is cooling down');
    this.retryAt = retryAt;
  }
}

function retryAt(header, now) {
  const candidate = /^\d+$/.test(header ?? '') ? now + Number(header) * 1000 : Date.parse(header);
  return new Date(Number.isFinite(candidate) && candidate >= now && candidate < 8.64e15
    ? candidate
    : now + 3_600_000).toISOString();
}

function hostGate({ store, now, dryRun, onRequest }) {
  const lastStarts = new Map();
  return async (host, gapMs, signal, task, perform) => {
    if (dryRun) {
      const state = await store.hostState(host);
      const activeUntil = Date.parse(state?.request_expires_at) || 0;
      const due = Math.max(Date.parse(state?.available_at) || 0, activeUntil,
        (lastStarts.get(host) ?? -Infinity) + gapMs);
      if (due - now() > 20_000) throw new HostDeferred(new Date(due).toISOString());
      await sleep(Math.max(0, due - now()), undefined, { signal });
      lastStarts.set(host, now());
      onRequest();
      return perform();
    }

    for (;;) {
      signal.throwIfAborted();
      const lease = await store.reserve(task, host, gapMs);
      if (lease.stale) throw new Error('Task lease or source policy changed');
      if (lease.token) {
        let cooldown = null;
        try {
          signal.throwIfAborted();
          onRequest();
          const response = await perform();
          if (response.status === 429) cooldown = retryAt(response.retryAfter, now());
          return response;
        } finally {
          await store.release(host, lease.token, cooldown);
        }
      }
      const wait = lease.retry_at ? Math.max(0, Date.parse(lease.retry_at) - now()) : 300;
      if (wait > 20_000) throw new HostDeferred(lease.retry_at);
      await sleep(wait || 50, undefined, { signal });
    }
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function sortedUnique(values) {
  const serialised = [...new Set(values.map(value => JSON.stringify(stable(value))))].sort();
  return serialised.map(value => JSON.parse(value));
}

function extraction(result, url, allowedHosts, stage) {
  if (!Array.isArray(result?.children) || !Array.isArray(result?.observations)) {
    throw new Error('Parser did not produce a valid extraction');
  }
  const children = sortedUnique(result.children.flatMap(child => {
    if (!STAGES.includes(child.stage) || (child.stage === 'directory' && stage !== 'directory')) {
      throw new Error('Parser returned an invalid child stage');
    }
    const canonical = canonicalTaskUrl(child.url, { base: url, allowedHosts });
    return canonical ? [{ stage: child.stage, url: canonical }] : [];
  }));
  const observations = sortedUnique(result.observations);
  const data = { children, observations };
  return { ...data, hash: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}

function startHeartbeat(store, task, controller) {
  let refreshing = false;
  const timer = setInterval(async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      if (!await store.renew(task)) controller.abort();
    } catch {
      controller.abort();
    } finally {
      refreshing = false;
    }
  }, HEARTBEAT_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export async function runFrontier({
  source, adapter, seeds, stage = 'all', scope, maxPages = 25, maxMinutes = 10,
  dryRun = false, refresh = false, reparse = false, store = createFrontierStore(),
  now = Date.now, random = Math.random, request = requestPublicPage,
  stopSignal = AbortSignal.timeout(maxMinutes * 60_000 - CLEANUP_MS),
}) {
  const result = { source: source.source_key, pages: 0, requests: 0, statuses: {}, proposed: [], responses: [] };
  if (source.paused_reason || (!dryRun && !source.collection_enabled)) {
    return { ...result, inactive: source.paused_reason ? 'paused' : 'collection disabled' };
  }
  const allowedHosts = source.allowed_hosts;
  const policy = value => canonicalTaskUrl(value, { allowedHosts });
  const relevantSeeds = seeds.filter(seed => !scope || seed.scope === scope)
    .map(seed => ({ ...seed, url: policy(seed.url) }));
  if (relevantSeeds.some(seed => !seed.url)) throw new Error('A seed URL is outside source policy');

  const pending = [];
  const seen = new Set();
  function propose(task) {
    if (stage !== 'all' && task.stage !== stage) return;
    const key = `${task.stage} ${task.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      pending.push({ canonical_url: task.url, stage: task.stage });
    }
  }

  if (dryRun) {
    for (const task of await store.preview(source.source_key, stage, scope, maxPages)) propose(task);
    relevantSeeds.forEach(propose);
  } else {
    for (const seed of relevantSeeds) {
      stopSignal.throwIfAborted();
      await store.prepare(source.source_key, seed, refresh);
    }
    if (reparse && !stopSignal.aborted) await store.reparse(source.source_key, scope);
  }

  const fetchPage = createGuardedFetcher({
    allowUrl: policy, request, minDelayMs: source.min_interval_ms, maxBytes: adapter.maxBytes,
    onResponse: dryRun ? response => result.responses.push(response) : undefined,
    gate: hostGate({ store, now, dryRun, onRequest: () => result.requests++ }),
  });
  const owner = randomUUID();

  async function finishAttempt(task, outcome, nextAt, reason, countFailure = false) {
    if (dryRun) return outcome;
    return await store.outcome(task, outcome, nextAt, reason, countFailure) ? outcome : 'stale';
  }

  async function fail(task, reason) {
    const delay = RETRIES[task.consecutive_failures ?? 0];
    if (!delay) return finishAttempt(task, 'failed', null, reason, true);
    const due = now() + Math.round(delay * 1000 * (0.9 + random() * 0.2));
    return finishAttempt(task, 'retry_wait', new Date(due).toISOString(), reason, true);
  }

  async function process(task) {
    const lease = new AbortController();
    const signal = AbortSignal.any([stopSignal, lease.signal]);
    const stopHeartbeat = dryRun ? () => {} : startHeartbeat(store, task, lease);
    try {
      const prior = task.has_extraction && task.parser_version === adapter.version;
      const page = await fetchPage(task.canonical_url, {
        etag: prior ? task.etag : null, lastModified: prior ? task.last_modified : null, signal, context: task,
      });
      signal.throwIfAborted();
      if (page.status === 'blocked') return await finishAttempt(task, 'blocked', null, page.error);
      if (page.status === 'rate_limited') {
        return await finishAttempt(task, 'retry_wait', retryAt(page.retryAfter, now()), page.error);
      }
      if (page.status === 'failed') return await fail(task, page.error);

      let payload;
      if (page.status === 'not_modified') {
        if (!prior || !(task.etag || task.last_modified)) return await fail(task, '304 without a current parser checkpoint');
        payload = { unchanged: true, etag: page.etag, lastModified: page.lastModified };
      } else {
        const parse = adapter.parsers[task.stage];
        if (!parse) return await fail(task, 'Adapter does not support this stage');
        const parsed = await parse({ url: page.url, html: page.html });
        if (parsed?.status === 'invalid') return await fail(task, parsed.reason ?? 'Parser did not recognise the page');
        payload = { ...extraction(parsed, page.url, allowedHosts, task.stage), etag: page.etag, lastModified: page.lastModified };
      }
      signal.throwIfAborted();
      if (dryRun) {
        result.proposed.push({ url: task.canonical_url, stage: task.stage, ...payload });
        payload.children?.forEach(propose);
        return 'succeeded';
      }
      return await store.acknowledge(task, adapter.version, payload) ? 'succeeded' : 'stale';
    } catch (error) {
      if (lease.signal.aborted) return 'stale';
      if (stopSignal.aborted) return finishAttempt(task, 'pending', null, null);
      if (error instanceof HostDeferred) return finishAttempt(task, 'pending', error.retryAt, error.message);
      return fail(task, 'Fetch or parse failed');
    } finally {
      stopHeartbeat();
    }
  }

  let claiming = 0;
  async function worker() {
    while (!stopSignal.aborted && result.pages + claiming < maxPages) {
      claiming++;
      let task;
      try {
        task = dryRun ? pending.shift() : await store.claim(source.source_key, stage, scope, owner);
      } finally {
        claiming--;
      }
      if (!task) return;
      result.pages++;
      let status;
      try {
        status = await process(task);
      } catch {
        // A database outage may leave a lease active. Expiry lets a new
        // process recover without assuming the attempt committed.
        status = 'unconfirmed';
      }
      result.statuses[status] = (result.statuses[status] ?? 0) + 1;
      if (dryRun && status === 'blocked') return;
    }
  }

  await mapFour(Array.from({ length: dryRun ? 1 : 4 }), worker);
  return { ...result, checkpoint: stopSignal.aborted || result.pages === maxPages };
}

const official = {
  version: 'official-structured-v1',
  parsers: {
    venue({ url, html }) {
      const observations = structuredReader({ url, html }, { venues: [] });
      if (!observations) return { status: 'invalid', reason: 'No recognised structured events' };
      return { children: [], observations: observations.map(finding => ({ ...finding, observation_kind: 'official_finding' })) };
    },
  },
};

const adapters = { official, london_theatre: londonTheatre };

function integer(value, name, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${name} must be ${min}–${max}`);
  return number;
}

export async function runFrontierCli(args = process.argv.slice(2), store = createFrontierStore()) {
  const { values } = parseArgs({ args, options: {
    source: { type: 'string' }, scope: { type: 'string' }, stage: { type: 'string', default: 'all' },
    'max-pages': { type: 'string', default: '25' }, 'max-minutes': { type: 'string', default: '10' },
    'dry-run': { type: 'boolean' }, refresh: { type: 'boolean' }, reparse: { type: 'boolean' },
    'publish-identities': { type: 'boolean' },
    'max-publications': { type: 'string', default: '25' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node supabase/scripts/crawl/loop.mjs --source <key> [--scope <key>] [--stage directory|venue|event|all] [--max-pages 25] [--max-minutes 10] [--dry-run | --refresh | --reparse]');
    console.log('       node supabase/scripts/crawl/loop.mjs --source <key> --publish-identities [--max-publications 25]');
    return;
  }
  const key = values.source;
  if (!Object.hasOwn(adapters, key)) throw new Error('No installed frontier adapter for that source');
  if (values['publish-identities']) {
    if (values.scope || values.stage !== 'all' || values.refresh || values.reparse || values['dry-run']) {
      throw new Error('--publish-identities is a source-level operation separate from fetch stages');
    }
    const limit = integer(values['max-publications'], '--max-publications', 1, 100);
    console.log(JSON.stringify(await store.publishIdentities(key, limit)));
    return;
  }

  if (values.stage !== 'all' && !STAGES.includes(values.stage)) throw new Error('Unknown crawl stage');
  if ([values.refresh, values.reparse, values['dry-run']].filter(Boolean).length > 1) {
    throw new Error('Choose at most one of --dry-run, --refresh and --reparse');
  }
  const maxPages = integer(values['max-pages'], '--max-pages', 1, 1000);
  const maxMinutes = integer(values['max-minutes'], '--max-minutes', 2, 55);
  const source = await store.source(key);
  if (!source) throw new Error('Crawl source missing in the database');
  const adapter = adapters[key];
  let seeds = adapter.seeds;
  if (key === 'official') {
    if (!values.scope) throw new Error('Official frontier preview requires an explicit crawl site UUID in --scope');
    const site = await store.officialSite(values.scope);
    if (!site) throw new Error('Official site not found');
    source.allowed_hosts = [new URL(site.url).hostname];
    seeds = [{ scope: site.id, stage: 'venue', url: site.url, site: site.id }];
  }
  const result = await runFrontier({
    source, adapter, seeds, stage: values.stage, scope: values.scope,
    dryRun: values['dry-run'], refresh: values.refresh, reparse: values.reparse, maxPages, maxMinutes, store,
  });
  console.log(JSON.stringify(result, null, 2));
}
