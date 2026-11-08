#!/usr/bin/env node
import {readRun} from './load.mjs';
import {main as guided} from './loop.mjs';
import {main as legacy} from './index.mjs';
const id=process.env.CRAWL_RUN_ID;
try{
 const run=await readRun(id);
 if(!run)throw new Error('Run not found');
 if(run.pipeline==='discover'){
  const result=await guided(process.env,{runId:id});
  if(result?.allFailed)process.exitCode=1;
 } else await legacy(['--run-id',id]);
}catch{console.error('Could not finish saved crawl; see Actions log.');process.exitCode=1;}
