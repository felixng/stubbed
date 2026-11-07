import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { runPsql } from './db.mjs';

test('new DB sessions recover an interrupted acknowledgement and replay a committed one', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const dbUrl = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(dbUrl.hostname, '127.0.0.1', 'integration test needs a disposable local database');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = dbUrl.href;
  const source = randomUUID();
  const key = 'fixture_' + source.replaceAll('-', '');
  const token = randomUUID();
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
  } finally {
    try {
      await runPsql(`
        begin;
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
