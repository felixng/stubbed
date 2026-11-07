import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicCrawlAddress } from './frontier-network.mjs';
import { runFrontier } from './frontier.mjs';

const root = 'https://fixture.test';
const source = { source_key: 'fixture', allowed_hosts: ['fixture.test', 'other.test'], collection_enabled: true, min_interval_ms: 0 };
const seed = { scope: 'fixture', stage: 'directory', url: root + '/' };
const adapter = {
  version: '2',
  parsers: {
    directory: () => ({ children: [{ stage: 'venue', url: '/venue?utm_source=fixture' }], observations: [] }),
    venue: () => ({ children: [{ stage: 'event', url: '/event' }], observations: [] }),
    event: () => ({ children: [], observations: [{ title: 'Fixture Show' }] }),
  },
};

function fixture(tasks) {
  const due = [...tasks];
  const writes = [];
  const seen = new Set(tasks.map(task => task.canonical_url));
  const requests = [];
  const store = {
    prepare: async (...args) => writes.push(['seed', ...args]),
    claim: async (_source, stage) => {
      const index = due.findIndex(task => stage === 'all' || task.stage === stage);
      return index < 0 ? null : due.splice(index, 1)[0];
    },
    renew: async () => true,
    reserve: async () => ({ token: 'fixture' }),
    release: async (...args) => writes.push(['release', ...args]),
    outcome: async (...args) => {
      writes.push(['outcome', ...args]);
      return true;
    },
    acknowledge: async (task, version, payload) => {
      writes.push(['ack', task, version, payload]);
      for (const child of payload.children ?? []) {
        if (!seen.has(child.url)) due.push({ stage: child.stage, canonical_url: child.url });
        seen.add(child.url);
      }
      return true;
    },
    preview: async () => [],
    hostState: async () => null,
  };
  return { writes, requests, due, store };
}

const html = () => new Response('<h1>Fixture</h1>', { headers: { 'content-type': 'text/html' } });
const robots = body => new Response(body, { headers: { 'content-type': 'text/plain' } });

test('a page budget checkpoints a discovered child and a fresh invocation continues by stage', async () => {
  const state = fixture([{ stage: 'directory', canonical_url: seed.url }]);
  const input = {
    source, seeds: [seed], adapter, store: state.store,
    request: async url => {
      state.requests.push(url.href);
      return url.pathname === '/robots.txt' ? robots('User-agent: *') : html();
    },
  };
  const first = await runFrontier({ ...input, maxPages: 1 });
  assert.equal(first.checkpoint, true);
  assert.equal(first.pages, 1);
  assert.deepEqual(state.due, [{ stage: 'venue', canonical_url: root + '/venue' }]);
  const eventEarly = await runFrontier({ ...input, stage: 'event' });
  assert.equal(eventEarly.pages, 0);
  const venue = await runFrontier({ ...input, stage: 'venue' });
  assert.equal(venue.statuses.succeeded, 1);
  assert.deepEqual(state.due, [{ stage: 'event', canonical_url: root + '/event' }]);
  const event = await runFrontier(input);
  assert.equal(event.statuses.succeeded, 1);
  assert.equal(event.checkpoint, false);
  assert.equal(state.writes.filter(([kind]) => kind === 'ack').length, 3);
});

test('304 only reuses validators and persisted extraction for the current parser', async () => {
  const tasks = [
    { stage: 'event', canonical_url: root + '/reuse', parser_version: '2', has_extraction: true, etag: '"one"' },
    { stage: 'event', canonical_url: root + '/changed', parser_version: '1', has_extraction: true, etag: '"old"' },
    { stage: 'event', canonical_url: root + '/missing', parser_version: '2', has_extraction: false, etag: '"lost"' },
  ];
  const state = fixture(tasks);
  const result = await runFrontier({
    source, adapter, seeds: [seed], store: state.store,
    request: async (url, { headers }) => {
      if (url.pathname === '/robots.txt') return robots('');
      state.requests.push([url.pathname, headers['If-None-Match']]);
      return url.pathname === '/changed' ? html() : new Response(null, { status: 304 });
    },
  });
  assert.deepEqual(result.statuses, { succeeded: 2, retry_wait: 1 });
  assert.deepEqual(state.requests.sort(), [['/changed', undefined], ['/missing', undefined], ['/reuse', '"one"']]);
  const ack = state.writes.filter(([kind]) => kind === 'ack');
  assert.equal(ack.find(([, task]) => task.canonical_url.endsWith('/reuse'))[3].unchanged, true);
  assert.match(ack.find(([, task]) => task.canonical_url.endsWith('/changed'))[3].hash, /^[0-9a-f]{64}$/);
});

test('a rate limit persists Retry-After while another host and an outage are independent', async () => {
  const state = fixture([
    { stage: 'event', canonical_url: root + '/limited' },
    { stage: 'event', canonical_url: 'https://other.test/healthy' },
    { stage: 'event', canonical_url: 'https://other.test/outage', consecutive_failures: 5 },
  ]);
  const now = () => Date.parse('2026-01-01T00:00:00Z');
  const result = await runFrontier({
    source, adapter, seeds: [], store: state.store, now,
    request: async url => {
      if (url.pathname === '/robots.txt') return robots('');
      if (url.pathname === '/limited') return new Response(null, { status: 429, headers: { 'Retry-After': '120' } });
      if (url.pathname === '/outage') return new Response(null, { status: 503 });
      return html();
    },
  });
  assert.deepEqual(result.statuses, { retry_wait: 1, failed: 1, succeeded: 1 });
  assert.ok(state.writes.some(([kind, host, , due]) =>
    kind === 'release' && host === 'fixture.test' && due === '2026-01-01T00:02:00.000Z'));
  assert.ok(state.writes.some(([kind, task, status, due, , counted]) =>
    kind === 'outcome' && task.canonical_url.endsWith('/limited') && status === 'retry_wait'
      && due === '2026-01-01T00:02:00.000Z' && !counted));
});

test('the deadline aborts an in-flight fetch and leaves its task pending', async () => {
  const state = fixture([{ stage: 'event', canonical_url: root + '/slow' }]);
  const controller = new AbortController();
  const result = await runFrontier({
    source, adapter, seeds: [], store: state.store, stopSignal: controller.signal,
    request: async (url, { signal }) => {
      if (url.pathname === '/robots.txt') return robots('');
      controller.abort();
      signal.throwIfAborted();
    },
  });
  assert.equal(result.checkpoint, true);
  assert.deepEqual(result.statuses, { pending: 1 });
  assert.equal(state.writes.some(([kind]) => kind === 'ack'), false);
});

test('dry run follows only allowed links and makes no state mutations', async () => {
  const state = fixture([]);
  const result = await runFrontier({
    source: { ...source, collection_enabled: false }, adapter, seeds: [seed], dryRun: true, store: state.store,
    request: async url => {
      state.requests.push(url.href);
      if (url.pathname === '/robots.txt') return robots('User-agent: *\nDisallow: /secret');
      if (url.pathname === '/venue') return new Response(null, { status: 301, headers: { location: '/secret' } });
      return html();
    },
  });
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.requests, [root + '/robots.txt', root + '/', root + '/venue']);
  assert.equal(result.statuses.blocked, 1);
  assert.equal(result.proposed[0].children[0].url, root + '/venue');
});

test('an off-host redirect is rejected before a connection, as are nonpublic addresses', async () => {
  const state = fixture([{ stage: 'venue', canonical_url: root + '/venue' }]);
  const result = await runFrontier({
    source, adapter, seeds: [], store: state.store,
    request: async url => {
      state.requests.push(url.href);
      if (url.pathname === '/robots.txt') return robots('');
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
    },
  });
  assert.deepEqual(result.statuses, { blocked: 1 });
  assert.deepEqual(state.requests, [root + '/robots.txt', root + '/venue']);
  for (const address of ['127.1.2.3', '10.0.0.1', '100.64.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fe80::1']) {
    assert.equal(isPublicCrawlAddress(address), false, address);
  }
  for (const address of ['1.1.1.1', '2606:4700::1111']) {
    assert.equal(isPublicCrawlAddress(address), true, address);
  }
});
