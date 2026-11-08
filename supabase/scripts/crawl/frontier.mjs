import { appendFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { mapFour } from './concurrent.mjs';
import { createGuardedFetcher } from './fetch.mjs';
import { requestPublicPage } from './frontier-network.mjs';
import { createGeocodeCache, createGeocoder, geocodeVenueObservations, backfillVenueGeocodes } from './geocode.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { canonicalTaskUrl } from './frontier-url.mjs';
import { structuredReader } from './sources/theatre-site.mjs';
import { londonTheatre } from './sources/london-theatre.mjs';
import { playbill } from './sources/playbill.mjs';

const STAGES = ['directory', 'venue', 'event'];
const RETRIES = [60, 300, 1800, 7200, 43200];
const CLEANUP_MS = 90_000;
const HEARTBEAT_MS = 60_000;

export class HostDeferred extends Error {
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

export function hostGate({ store, now, dryRun, onRequest }) {
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
  now = Date.now, random = Math.random, request = requestPublicPage, geocoder = null,
  stopSignal = AbortSignal.timeout(maxMinutes * 60_000 - CLEANUP_MS),
}) {
  const result = { source: source.source_key, pages: 0, requests: 0, statuses: {}, proposed: [], responses: [] };
  if (source.paused_reason || source.operator_paused_at || (!dryRun && !source.collection_enabled)) {
    return { ...result, inactive: source.paused_reason || source.operator_paused_at ? 'paused' : 'collection disabled' };
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
      if (stopSignal.aborted) break;
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
        // Venue pages without coordinates get a cached free geocode (worker only; failure leaves them as parsed).
        if (geocoder && task.stage === 'venue' && parsed?.observations) {
          parsed.observations = await geocodeVenueObservations(parsed.observations, geocoder);
        }
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
      // Keep the cause (no URLs or credentials): an operator can tell a timeout from a parser error.
      return fail(task, `Fetch or parse failed (${safeError(error, 120)})`.slice(0, 300));
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
        task = dryRun ? pending.shift() : await store.claim(source.source_key, stage, scope, owner, adapter.version);
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

const adapters = { official, london_theatre: londonTheatre, playbill };
export const scheduledSources = ['london_theatre', 'playbill'];

const defaultGeocoder = () => createGeocoder({ cache: createGeocodeCache() });

// "Class: message" with URLs, connection strings and token-like strings removed. Safe for logs and summaries.
export function safeError(error, max = 300) {
  const cause = String(error?.cause?.code ?? error?.code ?? error?.name ?? 'Error');
  const message = String(error?.message ?? '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/\beyJ[\w-]{10,}(\.[\w-]+)*/g, '<token>')
    .replace(/\b(?:sk|pk|sbp|ghp|gho|ghs)[-_][\w-]{8,}/gi, '<token>')
    .replace(/\s+/g, ' ');
  return `${cause}: ${message}`.slice(0, max);
}

export async function runScheduledSource(source, options, store = createFrontierStore()) {
  const key = source.source_key;
  const adapter = adapters[key];
  const geocoder = options.geocoder === undefined ? defaultGeocoder() : options.geocoder;
  const result = await runFrontier({ ...options, source, adapter, seeds: adapter.seeds, store, geocoder });
  if (source.publication_enabled && options.stage === 'all') {
    // Publication errors must not hide the fetch results already saved; report the cause and fail the run visibly.
    try { result.identities = await store.publishIdentities(key, 100); }
    catch (error) { result.publishError = `identities: ${safeError(error, 140)}`; }
    try { result.runs = await store.publishRuns(key, 100); }
    catch (error) { result.publishError = `${result.publishError ? result.publishError + '; ' : ''}runs: ${safeError(error, 140)}`.slice(0, 300); }
  }
  return result;
}

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
    'publish-runs': { type: 'boolean' },
    'backfill-geocodes': { type: 'boolean' },
    progress: { type: 'boolean' }, scan: { type: 'string' }, status: { type: 'string' },
    page: { type: 'string', default: '1' },
    'max-publications': { type: 'string', default: '25' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node supabase/scripts/crawl/loop.mjs --source <key> [--scope <key>] [--stage directory|venue|event|all] [--max-pages 25] [--max-minutes 10] [--dry-run | --refresh | --reparse]');
    console.log('       node supabase/scripts/crawl/loop.mjs --source <key> (--publish-identities | --publish-runs) [--max-publications 25]');
    console.log('       node supabase/scripts/crawl/loop.mjs --source <key> --backfill-geocodes   (geocode crawler-created venues that have a postcode but no coordinates)');
    console.log('       node supabase/scripts/crawl/loop.mjs --source <key> --progress [--scan <uuid>] [--stage venue] [--status blocked] [--page 1]');
    return;
  }
  const key = values.source;
  if (values.progress) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key ?? '')) throw new Error('Select a valid source key');
    if (values.stage !== 'all' && !STAGES.includes(values.stage)) throw new Error('Unknown crawl stage');
    if (values.status && !['pending','leased','succeeded','retry_wait','blocked','failed'].includes(values.status)) {
      throw new Error('Unknown task status');
    }
    const page = integer(values.page, '--page', 1, 1_000_000);
    const progress = await store.progress(key, values.scan, values.stage === 'all' ? null : values.stage, values.status, (page - 1) * 25);
    console.log(JSON.stringify(progress, null, 2));
    return;
  }
  if (!Object.hasOwn(adapters, key)) throw new Error('No installed frontier adapter for that source');
  if (values['backfill-geocodes']) {
    console.log(JSON.stringify(await backfillVenueGeocodes(defaultGeocoder())));
    return;
  }
  if (values['publish-identities'] || values['publish-runs']) {
    if (values['publish-identities'] && values['publish-runs']) throw new Error('Choose one publication stage');
    if (values.scope || values.stage !== 'all' || values.refresh || values.reparse || values['dry-run']) {
      throw new Error('Publication is a source-level operation separate from fetch stages');
    }
    const limit = integer(values['max-publications'], '--max-publications', 1, 100);
    const publish = values['publish-identities'] ? store.publishIdentities : store.publishRuns;
    console.log(JSON.stringify(await publish(key, limit)));
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
    geocoder: values['dry-run'] ? null : defaultGeocoder(),
  });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY && !values['dry-run']) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, await formatFrontierProgress(store, key, values.scope));
  }
}

export async function formatFrontierProgress(store, key, scope) {
  const first = await store.progress(key, null, null, null);
  if (!first.stages) return '';
  const current = first.scans.filter(scan => scan.is_current && (!scope || scan.scope_key === scope));
  const scans = current.length ? current : [first.scan];
  const sections = [];
  for (const scan of scans) {
    const progress = scan?.id === first.scan?.id ? first : await store.progress(key, scan.id, null, null);
    const counts = Object.entries(progress.stages).map(([stage, row]) =>
      `- ${stage}: ${row.processed} of ${row.discovered} discovered pages processed · ${row.pending} queued · ${row.leased} in flight · ${row.retry_wait} retrying · ${row.blocked} blocked · ${row.failed} failed`);
    sections.push([
      `## Crawl progress · ${key}`,
      `Scope: ${progress.scan?.scope_key ?? 'no scan'} · ${progress.scan?.enumeration_status ?? 'no enumeration recorded'}`,
      ...counts,
      `${progress.attempts} task attempts · ${progress.http_requests} reserved HTTP requests`,
      '',
    ].join('\n'));
  }
  return sections.join('\n');
}
