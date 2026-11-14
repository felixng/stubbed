import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { runFrontier } from './frontier.mjs';
import { sitesToSeed, seedOfficialSite } from './loop-store.mjs';
import { official } from './sources/official.mjs';

const archive = readFileSync(new URL('./fixtures/almeida-archive.html', import.meta.url), 'utf8');
const rules = readFileSync(new URL('./almeida-rules.json', import.meta.url), 'utf8');

test('a ready frontier site is seeded, read through the page queue and published; a failing page flags the site', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const dbUrl = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(dbUrl.hostname, '127.0.0.1', 'integration test needs a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = dbUrl.href;
  const store = createFrontierStore();
  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  try {
    await runPsql(`update public.crawl_sources set collection_enabled = true, paused_reason = null, operator_paused_at = null
      where source_key = 'official' returning to_jsonb(1)`);
    const setUp = async host => {
      const [venue] = await runPsql(`insert into public.venues (name, city, whats_on_url) values ('Engine ${host}', 'London', 'https://${host}/whats-on/')
        returning jsonb_build_object('id', id, 'site', crawl_site_id)`);
      await runPsql(`insert into public.crawl_rules (site_id, rules, author, status) values ('${venue.site}', '${rules}'::jsonb, 'test', 'active') returning to_jsonb(1)`);
      await runPsql(`update public.crawl_sites set engine = 'frontier', status = 'ready' where id = '${venue.site}' returning to_jsonb(1)`);
      return venue;
    };
    const read = async (venue, host, html) => {
      const rows = await sitesToSeed(100);
      const mine = rows.find(row => row.id === venue.site);
      assert.ok(mine, 'the ready frontier site is waiting to be seeded');
      await seedOfficialSite(mine, { refresh: false });
      assert.equal((await sitesToSeed(100)).some(row => row.id === venue.site), false, 'and is not listed again once seeded');
      return runFrontier({
        source: await store.source('official'), adapter: official, seeds: [], store, stage: 'venue', maxPages: 10,
        request: async url => url.hostname !== host ? new Response('wrong host', { status: 404 }) : url.pathname === '/robots.txt'
          ? new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } })
          : new Response(html, { headers: { 'content-type': 'text/html' } }),
      });
    };

    const goodHost = `e2e-good-${tag}.test`;
    const good = await setUp(goodHost);
    await read(good, goodHost, archive);
    await runPsql('select public.run_crawl_publication()');
    const [published] = await runPsql(`select jsonb_build_object(
      'findings', (select count(*) from public.crawl_findings f join public.crawl_runs r on r.id = f.run_id where r.pipeline = 'frontier' and f.venue_id = '${good.id}'),
      'runs', (select count(*) from public.runs where venue_id = '${good.id}'))`);
    assert.equal(published.findings, 5, 'the extraction became findings under a frontier run');
    assert.equal(published.runs, 5, 'and published runs');

    const badHost = `e2e-bad-${tag}.test`;
    const bad = await setUp(badHost);
    await read(bad, badHost, '<main>No cards here</main>');
    const [flag] = await runPsql(`select jsonb_build_object('flagged', repair_requested_at is not null, 'reason', repair_reason,
      'tasks', (select jsonb_agg(t.status) from public.crawl_tasks t join public.crawl_generations g on g.id = t.generation_id where g.site_id = '${bad.site}'))
      from public.crawl_sites where id = '${bad.site}'`);
    assert.equal(flag.flagged, true, 'a failed extraction flags the site for repair');
    assert.match(flag.reason, /^extraction: no_findings/);
    assert.deepEqual(flag.tasks, ['failed']);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = previous;
  }
});
