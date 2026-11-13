import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adapterSource, dryRunStoreWithoutRow, runFrontier, runFrontierCli } from './frontier.mjs';

const adapter = {
  key: 'new_site', hosts: ['new-site.test'], minIntervalMs: 1000, version: 'new-site-v1',
  seeds: [{ scope: 'home', stage: 'directory', url: 'https://new-site.test/' }],
  parsers: { directory: () => ({ children: [], observations: [{ observation_kind: 'venue', external_key: 'a', name: 'A' }] }) },
};

// Every store call except the source lookup throws: a dry run for an adapter with no row must not use the database.
const throwing = new Proxy({ source: async () => undefined, syncSources: async () => {} }, {
  get: (target, name) => name in target ? target[name] : () => { throw new Error(`database call: ${String(name)}`); },
});

test('a dry run builds its source from the adapter and makes no database call', async () => {
  const source = adapterSource(adapter);
  assert.deepEqual(source, { source_key: 'new_site', allowed_hosts: ['new-site.test'], min_interval_ms: 1000, collection_enabled: false });
  const result = await runFrontier({
    source, adapter, seeds: adapter.seeds, dryRun: true, store: dryRunStoreWithoutRow, maxPages: 3,
    request: async url => url.pathname === '/robots.txt'
      ? new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
      : new Response('<html><body>hello</body></html>', { headers: { 'content-type': 'text/html' } }),
  });
  assert.equal(result.proposed.length, 1);
  assert.equal(result.proposed[0].observations[0].name, 'A');
});

test('without --dry-run a missing source row is still an error', async () => {
  await assert.rejects(runFrontierCli(['--source', 'playbill'], throwing), /Crawl source missing/);
});
