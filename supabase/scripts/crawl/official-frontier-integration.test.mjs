import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { runFrontier } from './frontier.mjs';
import { official } from './sources/official.mjs';

const archive = readFileSync(new URL('./fixtures/almeida-archive.html', import.meta.url), 'utf8');
const rules = readFileSync(new URL('./almeida-rules.json', import.meta.url), 'utf8');

test('the page queue reads an official site with its rules, and a page that fails its checks fails at once', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const dbUrl = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(dbUrl.hostname, '127.0.0.1', 'integration test needs a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = dbUrl.href;
  const store = createFrontierStore();
  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  try {
    const sources = await runPsql(`update public.crawl_sources set collection_enabled = true, paused_reason = null, operator_paused_at = null
      where source_key = 'official' returning to_jsonb(1)`);
    assert.equal(sources.length, 1);
    const read = async (host, html) => {
      const [site] = await runPsql(`with s as (insert into public.crawl_sites (whats_on_url) values ('https://${host}/whats-on/') returning id),
        r as (insert into public.crawl_rules (site_id, rules, author, status) select id, '${rules}'::jsonb, 'test', 'active' from s),
        v as (insert into public.venues (name, city, whats_on_url) values ('Almeida ${tag}', 'London', 'https://${host}/whats-on/') returning id)
        select jsonb_build_object('id', s.id, 'venue', (select id from v)) from s`);
      const [generation] = await runPsql(`select to_jsonb(public.start_crawl_generation('official', '${site.id}', 'venue',
        'https://${host}/whats-on/', '${site.id}'::uuid))`);
      const result = await runFrontier({
        source: await store.source('official'), adapter: official, seeds: [], store, scope: site.id, stage: 'venue', maxPages: 5,
        request: async url => url.pathname === '/robots.txt'
          ? new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
          : new Response(html, { headers: { 'content-type': 'text/html' } }),
      });
      const [facts] = await runPsql(`select jsonb_build_object(
        'tasks', (select jsonb_agg(jsonb_build_object('status', t.status, 'attempts', t.attempts)) from public.crawl_tasks t where t.generation_id = '${generation}'),
        'findings', (select coalesce(sum(jsonb_array_length(e.observations)), 0) from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id where t.generation_id = '${generation}'),
        'official', (select count(*) from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id,
          jsonb_array_elements(e.observations) o where t.generation_id = '${generation}' and o->>'observation_kind' = 'official_finding'),
        'queued', (select count(*) from public.crawl_publication_queue q join public.crawl_extractions e on e.id = q.extraction_id
          join public.crawl_tasks t on t.id = e.task_id where t.generation_id = '${generation}'))`);
      return { result, facts };
    };

    const good = await read(`good-${tag}.test`, archive);
    assert.deepEqual(good.facts.tasks, [{ status: 'succeeded', attempts: 1 }]);
    assert.equal(good.facts.official, 5);
    assert.equal(good.facts.queued, 1);

    const bad = await read(`bad-${tag}.test`, '<main>No cards here</main>');
    assert.deepEqual(bad.facts.tasks, [{ status: 'failed', attempts: 1 }], 'failed after one attempt, not retry_wait');
    assert.equal(bad.facts.queued, 0);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = previous;
  }
});
