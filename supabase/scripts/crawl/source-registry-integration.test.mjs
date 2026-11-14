import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { adapters } from './sources/index.mjs';

test('syncing the adapters copies static facts and never touches a switch', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const url = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(url.hostname, '127.0.0.1');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = url.href;
  const key = 'registry_fixture';
  const fixture = { key, displayName: 'Registry Fixture', kind: 'aggregate', hosts: ['registry-fixture.test'], minIntervalMs: 5000, authority: 1, version: 'registry-fixture-v1' };
  try {
    await runPsql(`update public.crawl_sources set collection_enabled = false where source_key = 'playbill'; select 'null'::jsonb;`);
    const store = createFrontierStore();
    await store.syncSources([...Object.values(adapters), fixture]);
    const rows = Object.fromEntries((await runPsql(`select jsonb_build_object('k', source_key, 'v', to_jsonb(s)) from public.crawl_sources s`)).map(row => [row.k, row.v]));
    for (const adapter of Object.values(adapters)) {
      assert.equal(rows[adapter.key].adapter_version, adapter.version);
      assert.equal(rows[adapter.key].display_name, adapter.displayName);
      assert.equal(rows[adapter.key].authority, adapter.authority);
      if (adapter.hosts) assert.deepEqual(rows[adapter.key].allowed_hosts, adapter.hosts);
    }
    assert.equal(rows[key].collection_enabled, false, 'a new source arrives switched off');
    assert.equal(rows[key].publication_enabled, false);
    assert.equal(rows.playbill.collection_enabled, false, 'an existing switch is left as it was');
  } finally {
    await runPsql(`delete from public.crawl_sources where source_key = '${key}'; update public.crawl_sources set collection_enabled = false where source_key = 'playbill'; select 'null'::jsonb;`);
    if (previous === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = previous;
  }
});
