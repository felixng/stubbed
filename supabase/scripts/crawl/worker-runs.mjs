// One row per crawl worker execution (public.crawl_worker_runs): when it ran, what started it,
// what it did per source and why it stopped. The admin's schedule card and run history read it,
// and the daily page cap counts the last 24 hours of it.
import {appendFile} from 'node:fs/promises';
import {runPsql} from './db.mjs';
import {jsonLiteral,uuidLiteral} from './load.mjs';

export function triggerFor(env=process.env,{adminStart=false}={}){
 if(adminStart)return 'admin_start';
 return env.GITHUB_EVENT_NAME==='schedule'?'schedule':'manual';
}

export async function startWorkerRun({trigger,filters={},limits={}},env=process.env,db=runPsql){
 const run=env.GITHUB_RUN_ID??null;
 const log=run?`https://github.com/${env.GITHUB_REPOSITORY??'felixng/stubbed'}/actions/runs/${run}`:null;
 const [id]=await db(`insert into public.crawl_worker_runs(trigger,github_run_id,log_url,source_filter,stage_filter,scope_filter,limits)
  select j->>'trigger',j->>'run',j->>'log',nullif(j->>'source',''),nullif(j->>'stage',''),nullif(j->>'scope',''),j->'limits'
  from (select ${jsonLiteral({trigger,run,log,source:filters.source??null,stage:filters.stage??null,scope:filters.scope??null,limits})} j) x
  returning to_jsonb(id)`);
 if(env.GITHUB_ENV)await appendFile(env.GITHUB_ENV,`CRAWL_WORKER_RUN_ID=${id}\n`);
 return id;
}

// Only closes a row that is still open, so a late "interrupted" step never overwrites a finished run.
export async function finishWorkerRun(id,{perSource={},stopReason,modelSpendUsd=0},db=runPsql){
 await db(`update public.crawl_worker_runs set finished_at=now(),per_source=${jsonLiteral(perSource)},stop_reason=${jsonLiteral(stopReason)}#>>'{}',model_spend_usd=${Number(modelSpendUsd)||0}
  where id=${uuidLiteral(id)} and finished_at is null`);
}

export async function closeOpenWorkerRun(id,jobStatus,db=runPsql){
 if(!id)return;
 await db(`update public.crawl_worker_runs set finished_at=now(),stop_reason=${jsonLiteral(jobStatus==='cancelled'?'cancelled':'failed')}#>>'{}'
  where id=${uuidLiteral(id)} and finished_at is null`);
}

// Pages per source in the last 24 hours (from this table) and model spend in the same window
// (from the existing AI spend records, so manual runs count too).
export async function usedLast24h(db=runPsql){
 const [used]=await db(`select jsonb_build_object(
  'pages',coalesce((select jsonb_object_agg(k,n) from (
    select e.key k,sum(coalesce((e.value->>'pages')::int,0)) n
    from public.crawl_worker_runs r cross join lateral jsonb_each(r.per_source) e
    where r.started_at>now()-interval '24 hours' group by e.key) q),'{}'::jsonb),
  'spend_usd',(select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) from public.crawl_ai_reservations where created_at>now()-interval '24 hours'))`);
 return {pages:used?.pages??{},spendUsd:Number(used?.spend_usd??0)};
}
