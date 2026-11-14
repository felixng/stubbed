import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { runFrontier } from './frontier.mjs';
import { processLinkRequests } from './link-requests.mjs';
import { adapters } from './sources/index.mjs';

const html = readFileSync(new URL('./fixtures/web-links/event.html', import.meta.url), 'utf8');

test('a pasted show page jumps the queue, is read with its venue, and publishes without failures', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const dbUrl = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(dbUrl.hostname, '127.0.0.1', 'integration test needs a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = dbUrl.href;
  const store = createFrontierStore();
  const host = `shows-${randomUUID().slice(0, 8)}.test`;
  const url = `https://${host}/whats-on/the-long-interval`;
  try {
    await store.syncSources(Object.values(adapters));
    await runPsql(`update public.crawl_sources set collection_enabled = true, publication_enabled = true, paused_reason = null, operator_paused_at = null where source_key = 'web_links' returning to_jsonb(1)`);
    const [request] = await runPsql(`insert into public.crawl_link_requests (url, host) values ('${url}', '${host}') returning to_jsonb(id)`);
    // An older, ordinary page already waits in the same source.
    await runPsql(`select to_jsonb(public.start_crawl_generation('web_links', 'older', 'event', 'https://${host}/older'))`).catch(() => {});

    const handled = await processLinkRequests({ store, adapters, fetchPage: async () => ({ status: 'ok', html }) });
    assert.ok(handled.some(item => item.id === request && item.outcome === 'show_page'));
    const [state] = await runPsql(`select jsonb_build_object('status', status, 'kind', kind,
      'hosts', (select allowed_hosts from public.crawl_sources where source_key = 'web_links'),
      'priority', (select t.priority from public.crawl_tasks t where t.canonical_url = '${url}'))
      from public.crawl_link_requests where id = '${request}'`);
    assert.equal(state.status, 'done');
    assert.equal(state.kind, 'show_page');
    assert.equal(state.priority, 3);
    assert.ok(state.hosts.includes(host) && state.hosts.includes(`www.${host}`));

    // It is the first page the reading lane claims, ahead of the older one.
    const claimed = await store.claim('web_links', 'all', null, 'worker', 'web-links-v1');
    assert.equal(claimed.canonical_url, url);
    await runPsql(`update public.crawl_tasks set status = 'pending', lease_owner = null, lease_token = null, lease_expires_at = null where id = '${claimed.id}' returning to_jsonb(1)`);

    const [source] = await runPsql(`select to_jsonb(s) from public.crawl_sources s where source_key = 'web_links'`);
    const request_ = async u => u.pathname === '/robots.txt'
      ? new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
      : new Response(html, { headers: { 'content-type': 'text/html' } });
    for (let round = 0; round < 3; round++) {
      await runFrontier({ source, adapter: adapters.web_links, seeds: [], store, stage: 'all', maxPages: 10, request: request_ });
    }
    const [read] = await runPsql(`select jsonb_build_object('tasks', (select jsonb_agg(t.stage || ':' || t.status order by t.stage) from public.crawl_tasks t where t.canonical_url = '${url}'),
      'queued', (select count(*) from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id join public.crawl_tasks t on t.id = e.task_id where t.canonical_url = '${url}'))`);
    assert.deepEqual(read.tasks, ['event:succeeded', 'venue:succeeded']);
    assert.equal(read.queued, 2);

    const [published] = await runPsql(`select public.publish_crawl_identities('web_links', 100)`);
    assert.equal(published.failed, 0);
    const [entities] = await runPsql(`select jsonb_object_agg(m.entity_kind, m.resolution_status) from public.crawl_source_entities m join public.crawl_sources s on s.id = m.source_id and s.source_key = 'web_links' where m.external_key like '${host}%'`);
    assert.ok(entities.venue && entities.event, 'the venue and the show both reached identity matching');
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = previous;
  }
});
