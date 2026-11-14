import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { adapters, scheduledSources } from './sources/index.mjs';

const STAGES = ['directory', 'venue', 'event'];
const onHosts = (url, hosts) => hosts === null || hosts.includes(new URL(url).hostname);

test('the index lists every adapter once, keyed by its own key', () => {
  for (const [key, adapter] of Object.entries(adapters)) assert.equal(adapter.key, key);
  assert.deepEqual(scheduledSources, Object.values(adapters).filter(adapter => adapter.scheduled).map(adapter => adapter.key));
  assert.ok(!scheduledSources.includes('official'), 'official stays a separate lane');
});

for (const adapter of Object.values(adapters)) {
  test(`${adapter.key}: static facts are valid`, () => {
    assert.match(adapter.key, /^[a-z][a-z0-9_]{0,63}$/);
    assert.ok(adapter.displayName?.trim(), 'display name');
    assert.ok(['aggregate', 'official'].includes(adapter.kind));
    assert.match(adapter.version, /^[a-z0-9-]+-v[0-9]+$/);
    // A source with dynamic hosts (pasted links) has them added by the database; its adapter states none.
    if (adapter.dynamicHosts) assert.equal(adapter.hosts, null); else assert.ok(Array.isArray(adapter.hosts));
    for (const host of adapter.hosts ?? []) assert.equal(host, host.toLowerCase());
    assert.ok(Number.isInteger(adapter.minIntervalMs) && adapter.minIntervalMs >= 1000);
    assert.ok(Number.isInteger(adapter.authority) && adapter.authority >= 1 && adapter.authority <= 3);
    assert.equal(typeof adapter.scheduled, 'boolean');
    if (adapter.runPages !== undefined) assert.ok(Number.isInteger(adapter.runPages) && adapter.runPages >= 0);
    if (adapter.kind === 'aggregate' && !adapter.dynamicHosts) {
      assert.ok(adapter.hosts.length > 0);
      assert.ok(adapter.seeds.length > 0);
      for (const seed of adapter.seeds) {
        assert.ok(STAGES.includes(seed.stage), `seed stage ${seed.stage}`);
        assert.ok(onHosts(seed.url, adapter.hosts), `seed ${seed.url} is on the adapter's hosts`);
      }
    }
  });

  if (!adapter.fixtures) continue;
  test(`${adapter.key}: fixture pages parse into valid children and observations`, () => {
    for (const stage of STAGES.filter(name => adapter.parsers[name])) {
      const file = new URL(`./fixtures/${adapter.fixtures}/${stage}.html`, import.meta.url);
      assert.ok(existsSync(file), `fixtures/${adapter.fixtures}/${stage}.html exists`);
      const input = { url: adapter.fixtureUrls[stage], html: readFileSync(file, 'utf8') };
      const result = adapter.parsers[stage](input);
      assert.ok(Array.isArray(result.children) && Array.isArray(result.observations), `${stage} returns both arrays`);
      assert.ok(result.children.length + result.observations.length > 0, `${stage} finds something`);
      assert.deepEqual(adapter.parsers[stage](input), result, `${stage} is deterministic`);
      for (const child of result.children) {
        assert.ok(STAGES.includes(child.stage), `child stage ${child.stage}`);
        assert.ok(onHosts(child.url, adapter.hosts), `child ${child.url} is on the adapter's hosts`);
      }
      for (const row of result.observations) {
        if (row.observation_kind === 'event') {
          assert.ok(row.external_key, 'event external_key');
          assert.ok(row.raw_title, 'event raw_title');
          assert.ok(Array.isArray(row.dates), 'event dates array');
          for (const date of row.dates) {
            assert.ok(date.kind, 'date kind');
            assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(date.date ?? '') || date.precision, 'date is ISO or has a precision');
          }
        } else if (row.observation_kind === 'venue') {
          assert.ok(row.external_key, 'venue external_key');
          assert.ok(row.name, 'venue name');
        }
      }
    }
  });
}
