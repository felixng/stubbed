#!/usr/bin/env node
import {readRun} from './load.mjs';
import {main as guided} from './loop.mjs';
import {main as legacy} from './index.mjs';
import {startWorkerRun,finishWorkerRun,triggerFor} from './worker-runs.mjs';
const id=process.env.CRAWL_RUN_ID;
// Start a crawl (admin): one worker run row, like every other execution. Recording never stops the crawl.
const workerRun=await startWorkerRun({trigger:triggerFor(process.env,{adminStart:true}),limits:{}}).catch(()=>null);
const finish=(stopReason,perSource={})=>workerRun?finishWorkerRun(workerRun,{perSource,stopReason}).catch(()=>{}):undefined;
try{
 const run=await readRun(id);
 if(!run)throw new Error('Run not found');
 if(run.pipeline==='discover'){
  const result=await guided(process.env,{runId:id});
  if(result?.allFailed)process.exitCode=1;
  await finish(result?.allFailed?'failed':'nothing_due',{official:{pages:result?.pages??0}});
 } else {
  await legacy(['--run-id',id]);
  await finish('nothing_due');
 }
}catch{console.error('Could not finish saved crawl; see Actions log.');process.exitCode=1;await finish('failed');}
