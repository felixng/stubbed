import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { runFrontier } from './frontier.mjs';
import { createRun, jsonLiteral } from './load.mjs';
import { reserveSpend, settleSpend, reserveRepair } from './loop-store.mjs';

test('scheduled refresh, fair claims, host leases and AI budgets persist across workers', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const url = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(url.hostname, '127.0.0.1');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = url.href;
  const id = randomUUID();
  const key = 'fixture_' + id.replaceAll('-', '');
  const host = key.replaceAll('_', '-') + '.test';
  const origin = 'https://' + host;
  const seed = { scope: 'clock', stage: 'directory', url: origin + '/' };
  const version = 'fixture-v1';
  const local = createFrontierStore();
  let run, site;
  try {
    await runPsql(`insert into public.crawl_sources(id,source_key,adapter_version,collection_enabled,allowed_hosts,min_interval_ms)
      values ('${id}','${key}','${version}',true,array['${host}'],1000);`);
    const policy = async (stage, observations) => (await runPsql(`select to_jsonb(p)
      from public.crawl_refresh_policy('${stage}', ${jsonLiteral(observations)}, '2026-11-07') p`))[0];
    const dates = (...pairs) => [{ dates: pairs.map(([kind, date]) => ({ kind, date })) }];
    assert.deepEqual(await policy('directory', []), { priority: 2, delay: '30 days' });
    assert.deepEqual(await policy('venue', [{ listings: ['Current productions'] }]), { priority: 2, delay: '1 day' });
    assert.deepEqual(await policy('venue', [{ listings: ['Archive'] }]), { priority: 2, delay: '7 days' });
    assert.deepEqual(await policy('event', dates(['start', '2026-11-14'])), { priority: 3, delay: '1 day' });
    assert.deepEqual(await policy('event', dates(['start', '2026-03-14'], ['booking_until', '2026-11-14'])), { priority: 3, delay: '1 day' });
    assert.deepEqual(await policy('event', dates(['start', '2027-03-14'])), { priority: 2, delay: '7 days' });
    assert.deepEqual(await policy('event', dates(['start', '2026-03-14'])), { priority: 1, delay: '30 days' });
    assert.deepEqual(await policy('event', dates(['closing', '2023-03-14'])), { priority: 0, delay: '180 days' });
    assert.deepEqual(await policy('event', [{ dates: null, segments: null }]), { priority: 2, delay: '7 days' });
    assert.deepEqual(await policy('event', [{ segments: [
      dates(['closing', '2023-03-14'])[0], dates(['start', '2026-11-14'])[0],
    ] }]), { priority: 3, delay: '1 day' });

    const scan = await local.prepare(key, seed, false);
    const directory = await local.claim(key, 'directory', seed.scope, 'first', version);
    const history = origin + '/old';
    const children = [
      { stage: 'event', url: history },
      ...Array.from({ length: 8 }, (_, i) => ({ stage: 'event', url: origin + '/current-' + i })),
    ];
    await local.acknowledge(directory, version, { hash: 'a'.repeat(64), children });
    for (let i = 0; i < children.length; i++) {
      const detail = await local.claim(key, 'event', seed.scope, 'backfill', version);
      const observations = detail.canonical_url === history
        ? dates(['closing', '2023-03-14'])
        : dates(['start', new Date(Date.now() + 86400000).toISOString().slice(0, 10)]);
      assert.equal(await local.acknowledge(detail, version, { hash: 'b'.repeat(64), observations }), true);
    }
    assert.equal(await local.claim(key, 'event', seed.scope, 'before due', version), null);
    const [historyDelay] = await runPsql(`select to_jsonb(extract(day from refresh_at-last_success_at)::integer)
      from public.crawl_tasks where generation_id='${scan}' and canonical_url='${history}'`);
    assert.equal(historyDelay, 180);
    await runPsql(`update public.crawl_tasks set refresh_at=now()-interval '1 second'
      where generation_id='${scan}' and stage='event';
      update public.crawl_tasks set discovered_at=now()-interval '90 days'
      where generation_id='${scan}' and canonical_url='${history}';
      update public.crawl_sources set claim_sequence=0 where id='${id}';`);
    for (let i = 0; i < 5; i++) {
      const next = await local.claim(key, 'event', seed.scope, 'fair', version);
      assert.equal(next.canonical_url === history, i === 4, 'one in five claims reserves old work');
    }
    assert.equal(await local.claim(key, 'directory', seed.scope, 'before month', version), null);
    const upgrade = await local.claim(key, 'directory', seed.scope, 'new parser', 'fixture-v2');
    assert.equal(upgrade.id, directory.id);
    const page2 = { stage: 'directory', url: origin + '/page/2' };
    assert.equal(await local.acknowledge(upgrade, 'fixture-v2', { hash: 'c'.repeat(64), children: [page2] }), true);
    const [enumerating] = await runPsql(`select to_jsonb(enumeration_status) from public.crawl_generations where id='${scan}'`);
    assert.equal(enumerating, 'enumerating');
    const second = await local.claim(key, 'directory', seed.scope, 'next page', 'fixture-v2');
    assert.equal(second.canonical_url, page2.url);
    await runPsql(`update public.crawl_sources set operator_paused_at=now() where id='${id}'`);
    assert.equal(await local.claim(key, 'all', seed.scope, 'paused', 'fixture-v2'), null);
    await runPsql(`update public.crawl_sources set operator_paused_at=null where id='${id}'`);

    run = await createRun({ venueIds: [], method: 'rules', budgetUsd: 1 });
    const [official] = await runPsql("select to_jsonb(s.collection_enabled) from public.crawl_sources s where source_key='official'");
    assert.equal(official, true);
    const officialLease = await local.reserveOfficial(run.id, host, 100);
    assert.ok(officialLease.token);
    assert.deepEqual(await local.reserve(second, host, 100), { busy: true });
    const until = new Date(Date.now()+600000).toISOString();
    assert.equal(await local.release(host, officialLease.token, until), true);
    assert.ok(Date.parse((await local.reserve(second, host, 100)).retry_at) >= Date.parse(until));

    const oneSite = await Promise.all(Array.from({length: 4}, () => reserveSpend(run.id, 'same', 0.10, 0.20)));
    assert.equal(oneSite.filter(Boolean).length, 2);
    await settleSpend(oneSite.find(Boolean), 0.01);
    assert.ok(await reserveSpend(run.id, 'same', 0.09, 0.20));
    const manySites = await Promise.all(Array.from({length: 8}, (_, i) => reserveSpend(run.id, 'site' + i, 0.20, 0.20)));
    assert.equal(manySites.filter(Boolean).length, 4);

    [site] = await runPsql(`insert into public.crawl_sites(whats_on_url) values ('${origin}/official') returning to_jsonb(id)`);
    const repairs = await Promise.all(Array.from({length: 5}, () => reserveRepair(site, 'hash:parser')));
    assert.deepEqual(repairs.sort(), [0, 0, 1, 2, 3]);
    assert.equal(await reserveRepair(site, 'changed:parser'), 1);

    // The same fixture is fetched across three fresh worker/store invocations
    // and compared against an unbounded visit to a separate generation.
    await runPsql(`delete from public.crawl_hosts where host='${host}'`);
    const fixtureAdapter = { version, parsers: {
      directory: ({url: value}) => ({
        children: [1, 2].map(i => ({stage:'event',url:new URL('event-' + i, value).href})),
        observations: [],
      }),
      event: ({html}) => ({ children: [], observations: [{ raw_title: html }] }),
    } };
    const request = async value => new Response(value.pathname === '/robots.txt' ? 'User-agent: *' : value.pathname.split('/').at(-1), {
      headers: { 'content-type': 'text/html' },
    });
    const execute = async (scope, maxPages) => {
      const fresh = createFrontierStore();
      return runFrontier({
        source: await fresh.source(key), adapter: fixtureAdapter, store: fresh, request,
        seeds: [{scope,stage:'directory',url:origin + '/' + scope + '/'}], scope, maxPages,
      });
    };
    for(let i=0;i<3;i++) assert.equal((await execute('bounded',1)).statuses.succeeded,1);
    assert.equal((await execute('once',50)).statuses.succeeded,3);
    const [same] = await runPsql(`with outputs as (
      select g.scope_key, jsonb_agg(jsonb_build_array(t.stage, t.status, e.observations)
        order by t.stage, e.observations) as evidence
      from public.crawl_tasks t join public.crawl_generations g on g.id=t.generation_id
      join public.crawl_extractions e on e.task_id=t.id
      where t.source_id='${id}' and g.scope_key in ('bounded','once') group by g.scope_key
    ) select to_jsonb((select count(distinct evidence)=1 and count(*)=2 from outputs))`);
    assert.equal(same,true);
  } finally {
    try {
      await runPsql(`
        delete from public.crawl_publication_queue q using public.crawl_extractions e, public.crawl_tasks t
          where q.extraction_id=e.id and e.task_id=t.id and t.source_id='${id}';
        delete from public.crawl_extractions e using public.crawl_tasks t where e.task_id=t.id and t.source_id='${id}';
        delete from public.crawl_task_edges e using public.crawl_tasks t where e.parent_id=t.id and t.source_id='${id}';
        delete from public.crawl_tasks where source_id='${id}';
        delete from public.crawl_generations where source_id='${id}';
        delete from public.crawl_sources where id='${id}';
        delete from public.crawl_hosts where host='${host}';
        ${site ? `delete from public.crawl_sites where id='${site}';` : ''}
        ${run ? `delete from public.crawl_runs where id='${run.id}';` : ''}
      `);
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_DB_URL;
      else process.env.SUPABASE_DB_URL = previous;
    }
  }
});
