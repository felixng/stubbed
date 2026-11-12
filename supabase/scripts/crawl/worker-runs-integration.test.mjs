import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPsql } from './db.mjs';
import { closeOpenWorkerRun, finishWorkerRun, startWorkerRun, usedLast24h } from './worker-runs.mjs';

test('a worker run is opened, finished, closed when interrupted, and counted for the daily cap', {
  skip: !process.env.CRAWL_INTEGRATION_DB_URL,
}, async () => {
  const url = new URL(process.env.CRAWL_INTEGRATION_DB_URL);
  assert.equal(url.hostname, '127.0.0.1');
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = url.href;
  const ids = [];
  const row = async id => (await runPsql(`select to_jsonb(r) from public.crawl_worker_runs r where id = '${id}'`))[0];
  try {
    const before = (await usedLast24h()).pages.fixture_source ?? 0;
    const id = await startWorkerRun(
      { trigger: 'manual', filters: { source: 'playbill', stage: 'all' }, limits: { page_allowance: 100, daily_spend_usd: 2 } },
      { GITHUB_RUN_ID: '4242', GITHUB_REPOSITORY: 'owner/repo' },
    );
    ids.push(id);
    const open = await row(id);
    assert.equal(open.trigger, 'manual');
    assert.equal(open.finished_at, null, 'a run is open while it is working');
    assert.equal(open.log_url, 'https://github.com/owner/repo/actions/runs/4242');
    assert.equal(open.source_filter, 'playbill');
    assert.equal(open.stage_filter, 'all');
    assert.equal(open.scope_filter, null, 'no scope means null, not an empty string');
    assert.deepEqual(open.limits, { page_allowance: 100, daily_spend_usd: 2 });

    await finishWorkerRun(id, { perSource: { fixture_source: { pages: 12 } }, stopReason: 'page_allowance', modelSpendUsd: 0.3 });
    const done = await row(id);
    assert.ok(done.finished_at);
    assert.equal(done.stop_reason, 'page_allowance');
    assert.equal(Number(done.model_spend_usd), 0.3);
    assert.equal((await usedLast24h()).pages.fixture_source, before + 12, 'finished runs count toward the daily page cap');

    // A late "interrupted" step never overwrites a finished run.
    await closeOpenWorkerRun(id, 'cancelled');
    assert.equal((await row(id)).stop_reason, 'page_allowance');
    await finishWorkerRun(id, { perSource: { fixture_source: { pages: 999 } }, stopReason: 'failed' });
    assert.equal((await row(id)).stop_reason, 'page_allowance', 'finishing twice keeps the first result');

    const cancelled = await startWorkerRun({ trigger: 'schedule', limits: {} }, {});
    const failed = await startWorkerRun({ trigger: 'admin_start', limits: {} }, {});
    ids.push(cancelled, failed);
    await closeOpenWorkerRun(cancelled, 'cancelled');
    await closeOpenWorkerRun(failed, 'failure');
    assert.equal((await row(cancelled)).stop_reason, 'cancelled');
    assert.equal((await row(failed)).stop_reason, 'failed');
    assert.ok((await row(failed)).finished_at);
    await closeOpenWorkerRun(undefined, 'failure');
  } finally {
    if (ids.length) await runPsql(`delete from public.crawl_worker_runs where id in (${ids.map(id => `'${id}'`).join(',')})`);
    if (previous === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = previous;
  }
});
