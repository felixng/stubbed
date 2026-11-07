import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { createFrontierStore } from './frontier-store.mjs';

test('new DB sessions recover interruptions, reject stale workers and reuse committed evidence', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const dbUrl = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(dbUrl.hostname, '127.0.0.1', 'integration test needs a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = dbUrl.href;
  const source = randomUUID();
  const key = 'fixture_' + source.replaceAll('-', '');
  const token = randomUUID();
  const otherHosts = Array.from({ length: 5 }, (_, index) => `slot-${index}-${source}.test`);
  try {
    const [, parent] = await runPsql(`
      begin;
      insert into public.crawl_sources (id, source_key, adapter_version, collection_enabled, allowed_hosts)
      values ('${source}', '${key}', '1', true, array['frontier.test']);
      select to_jsonb(public.start_crawl_generation('${key}', 'fixture', 'directory', 'https://frontier.test/'));
      update public.crawl_tasks set status = 'leased', attempts = 1, lease_owner = 'fixture',
        lease_token = '${token}', lease_expires_at = now() + interval '5 minutes'
      where source_id = '${source}' returning to_jsonb(id);
      commit;`);

    const acknowledgement = `select to_jsonb(public.acknowledge_crawl_task(
      '${parent}', '${token}', '1', repeat('a', 64),
      '[{"stage":"venue","url":"https://frontier.test/venue/a"}]', '[{"external_key":"fixture"}]'
    ));`;
    const snapshot = () => runPsql(`
      select jsonb_build_object(
        'state', (select status from public.crawl_tasks where id = '${parent}'),
        'tasks', (select count(*) from public.crawl_tasks where source_id = '${source}'),
        'edges', (select count(*) from public.crawl_task_edges where parent_id = '${parent}'),
        'observations', (select count(*) from public.crawl_extractions where task_id = '${parent}'),
        'publication', (select count(*) from public.crawl_publication_queue q
          join public.crawl_extractions e on e.id = q.extraction_id where e.task_id = '${parent}')
      );`);

    // End the database session before COMMIT. The next process sees the
    // original lease and can retry without trusting any local progress.
    assert.deepEqual(await runPsql('begin; ' + acknowledgement), [true]);
    assert.deepEqual(await snapshot(), [{ state: 'leased', tasks: 1, edges: 0, observations: 0, publication: 0 }]);
    await runPsql('begin; ' + acknowledgement + 'commit;');
    assert.deepEqual(await runPsql(acknowledgement), [false]);
    assert.deepEqual(await snapshot(), [{ state: 'succeeded', tasks: 2, edges: 1, observations: 1, publication: 1 }]);
    const store = createFrontierStore();
    const claims = await Promise.all([
      store.claim(key, 'venue', null, 'worker A'),
      store.claim(key, 'venue', null, 'worker B'),
    ]);
    assert.equal(claims.filter(Boolean).length, 1, 'one worker wins a racing claim');
    const old = claims.find(Boolean);
    assert.equal(await store.renew(old), true);
    await runPsql(`update public.crawl_tasks set lease_expires_at = clock_timestamp() - interval '1 sec'
      where id = '${old.id}';`);
    const current = await store.claim(key, 'venue', null, 'replacement');
    assert.equal(current.id, old.id);
    assert.notEqual(current.lease_token, old.lease_token);
    assert.equal(await store.renew(old), false);
    assert.deepEqual(await store.reserve(old, 'frontier.test', 1000), { stale: true });
    assert.equal(await store.outcome(old, 'failed', null, 'Stale failure', true), false);

    const parsed = {
      hash: 'b'.repeat(64), etag: '"fixture"',
      children: [{ stage: 'event', url: 'https://frontier.test/event/a' }],
      observations: [{ external_key: 'venue-a' }],
    };
    assert.equal(await store.acknowledge(old, '1', parsed), false);
    assert.equal(await store.acknowledge(current, '1', parsed), true);

    // A conditional response after restart reuses the complete extraction and
    // its children. A different parser must get a fresh body.
    await runPsql(`update public.crawl_tasks set status = 'pending' where id = '${current.id}';`);
    const conditional = await store.claim(key, 'venue', null, 'conditional');
    assert.equal(conditional.has_extraction, true);
    assert.equal(conditional.etag, '"fixture"');
    await assert.rejects(store.acknowledge(conditional, '2', { unchanged: true }));
    assert.equal(await store.acknowledge(conditional, '1', { unchanged: true }), true);
    const [counts] = await runPsql(`select jsonb_build_object(
      'edges', (select count(*) from public.crawl_task_edges where parent_id = '${current.id}'),
      'publications', (select count(*) from public.crawl_publication_queue q join public.crawl_extractions e
        on q.extraction_id = e.id where e.task_id = '${current.id}')
    );`);
    assert.deepEqual(counts, { edges: 1, publications: 1 });

    assert.equal(await store.reparse(key, 'fixture'), 3);
    const tasks = await Promise.all([
      store.claim(key, 'venue', null, 'reparse'),
      store.claim(key, 'event', null, 'event'),
    ]);
    assert.equal(tasks[0].generation_id, current.generation_id);
    assert.equal(tasks[0].etag, null);
    assert.equal(tasks[0].has_extraction, true, 'reparse preserves last-good evidence');

    const slots = await Promise.all(tasks.map(task => store.reserve(task, 'frontier.test', 1000)));
    assert.equal(slots.filter(slot => slot.token).length, 1, 'one request wins on the shared host');
    const active = slots.find(slot => slot.token);
    assert.equal(await store.release('frontier.test', randomUUID(), null), false);
    const until = new Date(Date.now() + 600_000).toISOString();
    assert.equal(await store.release('frontier.test', active.token, until), true);
    assert.ok(Date.parse((await store.reserve(tasks[0], 'frontier.test', 1000)).retry_at) >= Date.parse(until));
    assert.equal(await store.claim(key, 'directory', null, 'cooled host'), null);

    await runPsql(`update public.crawl_sources set allowed_hosts = allowed_hosts ||
      array[${otherHosts.map(host => `'${host}'`).join(',')}] where id = '${source}';`);
    const activeRequests = [];
    for (const [index, host] of otherHosts.entries()) {
      const scope = `global-slot-${index}`;
      await store.prepare(key, { scope, stage: 'event', url: `https://${host}/` }, false);
      const task = await store.claim(key, 'event', scope, scope);
      const request = await store.reserve(task, host, 1000);
      if (index < 4) {
        assert.ok(request.token);
        activeRequests.push([host, request.token]);
      } else {
        assert.deepEqual(request, { busy: true }, 'the fifth active request must wait');
      }
    }
    for (const [host, requestToken] of activeRequests) await store.release(host, requestToken, null);


  } finally {
    try {
      await runPsql(`
        begin;
        delete from public.crawl_publication_queue q using public.crawl_extractions e, public.crawl_tasks t
          where q.extraction_id = e.id and e.task_id = t.id and t.source_id = '${source}';
        delete from public.crawl_extractions e using public.crawl_tasks t
          where e.task_id = t.id and t.source_id = '${source}';
        delete from public.crawl_hosts where host = 'frontier.test' or host in (${otherHosts.map(host => `'${host}'`).join(',')});
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
