import { readRun, finishRun } from './load.mjs';
const run = await readRun(process.env.CRAWL_RUN_ID);
if (run && ['queued', 'running'].includes(run.status)) {
  await finishRun(run.id, { status: 'failed', costUsd: run.cost_usd, summary: { ...run.summary, error: 'Actions job interrupted; see Actions log' } });
}
