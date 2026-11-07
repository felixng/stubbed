import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { runFrontier } from './frontier.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { playbill } from './sources/playbill.mjs';
import { londonTheatre } from './sources/london-theatre.mjs';
import { jsonLiteral } from './load.mjs';

test('Playbill bounded resumes converge and cross-source identities remain unique', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const db = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(db.hostname, '127.0.0.1');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = db.href;
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const sourceList = ids.map((id, index) => ({
    id, source_key: 'fixture_' + id.replaceAll('-', ''),
    allowed_hosts: [index < 2 ? 'playbill.com' : 'www.londontheatre.co.uk'],
    collection_enabled: true, min_interval_ms: 1000,
  }));
  const venue = 'Fixture Lantern Hall ' + ids[0];
  const title = 'Fixture Pearl Telescope ' + ids[0];
  const response = body => new Response(body, { headers: { 'content-type': 'text/html' } });
  const store = createFrontierStore();
  const seed = playbill.seeds[0];
  const idsSql = ids.map(id => `'${id}'`).join(',');
  const request = async url => {
    if (url.pathname === '/robots.txt') return response('User-agent: *');
    if (url.pathname === '/broadway-theatres') {
      return response(`<div class="bsp-list-promo-title"><a href="/venue/fixture-hall">${venue}</a></div>`);
    }
    if (url.pathname === '/venue/fixture-hall') {
      return response(`<div class="bsp-bio"><h2 class="bsp-bio-title">${venue}</h2>
        <div class="bsp-bio-subtitle"><a class="map-link">4 Theatre Road, London, N7 0AB, GB</a></div></div>
        <div class="bsp-gallery-module-component"><h2 class="bsp-component-title">Previous Shows in This Building</h2>
        <div class="bsp-list-promo-title"><a href="/production/fixture-show">${title}</a></div></div>`);
    }
    if (url.pathname === '/production/fixture-show') {
      return response(`<div class="bsp-bio"><h2 class="bsp-bio-title">${title}</h2>
        <div class="bsp-bio-subtitle"><h5 class="bsp-bio-sub-text">Musical</h5></div>
        <div class="bsp-bio-links-top"><a href="/venue/fixture-hall">${venue}</a></div></div>
        <div class="bsp-gallery-module-component"><h2 class="bsp-component-title">Pro Info</h2>
        <dl><dt>Opening Date</dt><dd>Jan 2, 2019</dd><dt>Closing Date</dt><dd>Jan 30, 2019</dd></dl></div>`);
    }
    throw new Error('Unexpected fixture request');
  };

  async function state(source) {
    return runPsql(`select jsonb_build_object('url',t.canonical_url,'stage',t.stage,'status',t.status,'hash',t.content_hash)
      from public.crawl_tasks t where t.source_id = '${source.id}' order by t.canonical_url;`);
  }

  try {
    for (const source of sourceList) {
      await runPsql(`insert into public.crawl_sources (id,source_key,adapter_version,collection_enabled,publication_enabled,
        allowed_hosts,min_interval_ms) values ('${source.id}','${source.source_key}','fixture',true,true,
        array['${source.allowed_hosts[0]}'],1000);`);
    }
    const [restarted, continuous, london] = sourceList;
    const crawl = (source, stage, maxPages) =>
      runFrontier({ source, adapter: playbill, seeds: [seed], stage, maxPages, request });

    assert.equal((await crawl(restarted, 'directory', 1)).checkpoint, true);
    assert.equal((await crawl(restarted, 'venue', 1)).checkpoint, true);
    assert.equal((await crawl(restarted, 'event', 1)).statuses.succeeded, 1);
    assert.equal((await crawl(continuous, 'all', 20)).statuses.succeeded, 3);
    assert.deepEqual(await state(restarted), await state(continuous));

    const londonSeed = { scope: 'fixture', stage: 'venue', url: 'https://www.londontheatre.co.uk/venues/fixture-hall' };
    const generation = await store.prepare(london.source_key, londonSeed, false);
    await runPsql(`select to_jsonb(public.enqueue_crawl_task('${generation}','event','https://www.londontheatre.co.uk/show/99-fixture'));`);
    for (const stage of ['venue','event']) {
      const task = await store.claim(london.source_key, stage, null, 'fixture');
      const parsed = londonTheatre.parsers[stage]({
        url: task.canonical_url,
        html: stage === 'venue'
          ? `<main><h1>${venue}</h1><p data-test-id="venue-address">4 Theatre Road, London, GB, N7 0AB</p><p data-test-id="no-events">No events scheduled</p></main>`
          : `<main><h1 data-test-id="product-name">${title}</h1><h3 data-test-id="venue-name"><a href="/venues/fixture-hall">${venue}</a></h3>
            <dl><dt>Categories</dt><dd>Musical</dd><dt>Opening Date</dt><dd>2 January 2019</dd><dt>Closing Date</dt><dd>30 January 2019</dd></dl></main>`,
      });
      assert.ok(parsed.observations);
      await store.acknowledge(task, londonTheatre.version, { ...parsed, hash: 'f'.repeat(64) });
    }

    for (const source of sourceList) {
      assert.equal((await store.publishIdentities(source.source_key, 25)).failed, 0);
      assert.equal((await store.publishRuns(source.source_key, 25)).failed, 0);
    }
    const [counts] = await runPsql(`select jsonb_build_object(
      'venues', (select count(*) from public.venues where name = ${jsonLiteral(venue)} #>> '{}'),
      'shows', (select count(*) from public.shows where title = ${jsonLiteral(title)} #>> '{}'),
      'maps', (select count(*) from public.crawl_source_entities where source_id in (${idsSql}) and resolution_status = 'linked')
    );`);
    assert.deepEqual(counts, { venues: 1, shows: 1, maps: 6 });
    await runPsql(`select to_jsonb(public.set_crawl_source_withdrawal('${restarted.source_key}',true));`);
    const [kept] = await runPsql(`select to_jsonb(count(*)) from public.catalogue_effective_runs where title = ${jsonLiteral(title)} #>> '{}';`);
    assert.equal(kept, 2, 'withdrawal leaves independently observed runs and their shared canonical identities');
  } finally {
    try {
      await runPsql(`begin;
        delete from public.crawl_run_evidence where source_id in (${idsSql});
        delete from public.crawl_source_entities where source_id in (${idsSql});
        delete from public.show_candidates where title = ${jsonLiteral(title)} #>> '{}';
        delete from public.shows where title = ${jsonLiteral(title)} #>> '{}';
        delete from public.venues where name = ${jsonLiteral(venue)} #>> '{}';
        delete from public.crawl_publication_queue q using public.crawl_extractions e, public.crawl_tasks t
          where q.extraction_id=e.id and e.task_id=t.id and t.source_id in (${idsSql});
        delete from public.crawl_extractions e using public.crawl_tasks t where e.task_id=t.id and t.source_id in (${idsSql});
        delete from public.crawl_tasks where source_id in (${idsSql});
        delete from public.crawl_generations where source_id in (${idsSql});
        delete from public.crawl_sources where id in (${idsSql});
        delete from public.crawl_hosts where host = 'playbill.com';
        commit;`);
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_DB_URL;
      else process.env.SUPABASE_DB_URL = previous;
    }
  }
});
