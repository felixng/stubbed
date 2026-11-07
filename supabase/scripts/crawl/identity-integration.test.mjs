import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { jsonLiteral } from './load.mjs';

test('two identity publishers converge on one canonical show and venue', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const url = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(url.hostname, '127.0.0.1', 'fixture needs a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = url.href;
  const source = randomUUID();
  const key = 'fixture_' + source.replaceAll('-', '');
  const venueName = 'Arena ' + source;
  const title = 'Glass Moth ' + source;
  const store = createFrontierStore();
  try {
    await runPsql(`insert into public.crawl_sources (id, source_key, adapter_version,
      collection_enabled, publication_enabled, allowed_hosts)
      values ('${source}', '${key}', '1', true, true, array['identity.test']);`);
    const generation = await store.prepare(key, { scope: 'identity', stage: 'venue', url: 'https://identity.test/venue' }, false);
    await runPsql(`select to_jsonb(public.enqueue_crawl_task('${generation}', 'event', 'https://identity.test/event'));`);

    const venue = await store.claim(key, 'venue', null, 'fixture');
    const event = await store.claim(key, 'event', null, 'fixture');
    assert.equal(await store.acknowledge(venue, '1', {
      hash: 'a'.repeat(64),
      observations: [{ observation_kind: 'venue', external_key: 'venue', name: venueName,
        city: 'London', country: 'GB', street: '1 Fixture Road' }],
    }), true);
    assert.equal(await store.acknowledge(event, '1', {
      hash: 'b'.repeat(64),
      observations: [{ observation_kind: 'event', external_key: 'event', raw_title: title,
        event_kind: 'show', show_type: 'play', venue: { external_key: 'venue' },
        date_status: 'supported', dates: [{ kind: 'start', date: '2026-11-10' }] }],
    }), true);

    const reports = await Promise.all([store.publishIdentities(key, 25), store.publishIdentities(key, 25)]);
    assert.equal(reports.reduce((sum, report) => sum + (report.processed ?? 0), 0), 2);
    assert.equal(reports.reduce((sum, report) => sum + (report.failed ?? 0), 0), 0);
    const [counts] = await runPsql(`select jsonb_build_object(
      'shows', (select count(*) from public.shows where title = ${jsonLiteral(title)} #>> '{}'),
      'venues', (select count(*) from public.venues where name = ${jsonLiteral(venueName)} #>> '{}'),
      'mappings', (select count(*) from public.crawl_source_entities where source_id = '${source}' and resolution_status = 'linked')
    );`);
    assert.deepEqual(counts, { shows: 1, venues: 1, mappings: 2 });
    assert.deepEqual(await store.publishIdentities(key, 25), { processed: 0, deferred: 0, failed: 0 });
  } finally {
    try {
      await runPsql(`begin;
        delete from public.crawl_source_entities where source_id = '${source}';
        delete from public.show_candidates where source_ref like 'venue-first:${key}:%';
        delete from public.shows where title = ${jsonLiteral(title)} #>> '{}';
        delete from public.venues where name = ${jsonLiteral(venueName)} #>> '{}';
        delete from public.crawl_publication_queue q using public.crawl_extractions e, public.crawl_tasks t
          where q.extraction_id = e.id and e.task_id = t.id and t.source_id = '${source}';
        delete from public.crawl_extractions e using public.crawl_tasks t
          where e.task_id = t.id and t.source_id = '${source}';
        delete from public.crawl_tasks where source_id = '${source}';
        delete from public.crawl_generations where source_id = '${source}';
        delete from public.crawl_sources where id = '${source}';
        commit;`);
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_DB_URL;
      else process.env.SUPABASE_DB_URL = previous;
    }
  }
});
