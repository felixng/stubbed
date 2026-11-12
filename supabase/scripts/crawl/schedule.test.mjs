import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runScheduled} from './loop.mjs';
import {CRON,CRON_MINUTES,RETRY_DELAYS_SECONDS,dailyLimits,modelBudget,pageAllowance,stopReason} from './schedule.mjs';
import {triggerFor} from './worker-runs.mjs';

test('the workflow cron is the one the admin shows, twice an hour and off the hour',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/catalogue-crawl.yml',import.meta.url),'utf8');
 assert.equal(workflow.match(/cron:\s*"([^"]+)"/)?.[1],CRON);
 assert.equal(CRON,`${CRON_MINUTES.join(',')} * * * *`);
 assert.deepEqual(CRON_MINUTES,[17,47]);
 assert.deepEqual(RETRY_DELAYS_SECONDS,[60,300,1800,7200,43200]);
});

test('daily limits default to $2 and 1,000 pages and ignore bad values',()=>{
 assert.deepEqual(dailyLimits({}),{dailySpendUsd:2,sourceDailyPages:1000});
 assert.deepEqual(dailyLimits({CRAWL_DAILY_SPEND_USD:'0.5',CRAWL_SOURCE_DAILY_PAGES:'300'}),{dailySpendUsd:0.5,sourceDailyPages:300});
 assert.deepEqual(dailyLimits({CRAWL_DAILY_SPEND_USD:'lots',CRAWL_SOURCE_DAILY_PAGES:'-4'}),{dailySpendUsd:2,sourceDailyPages:1000});
});

test('the model gets the smaller of the run cap and what is left of the day',()=>{
 assert.deepEqual(modelBudget({runBudgetUsd:1,dailySpendUsd:2,spentLast24hUsd:0}),{budgetUsd:1,capReached:false});
 assert.deepEqual(modelBudget({runBudgetUsd:1,dailySpendUsd:2,spentLast24hUsd:1.5}),{budgetUsd:0.5,capReached:false});
 assert.deepEqual(modelBudget({runBudgetUsd:1,dailySpendUsd:2,spentLast24hUsd:2}),{budgetUsd:0,capReached:true});
 assert.deepEqual(modelBudget({runBudgetUsd:1,dailySpendUsd:2,spentLast24hUsd:5}),{budgetUsd:0,capReached:true});
});

test('page allowance is an even share, limited by the source daily cap',()=>{
 assert.equal(pageAllowance({remaining:100,sourcesLeft:3,dailyRemaining:1000}),34);
 assert.equal(pageAllowance({remaining:100,sourcesLeft:2,dailyRemaining:20}),20,'a source near its cap gets only what it has left');
 assert.equal(pageAllowance({remaining:100,sourcesLeft:2,dailyRemaining:0}),0);
 assert.equal(pageAllowance({remaining:0,sourcesLeft:2,dailyRemaining:50}),0);
});

test('a run ends for the most important reason',()=>{
 const base={failed:false,remaining:10,timeLimited:false,modelCapReached:false};
 assert.equal(stopReason({...base,failed:true,remaining:0}),'failed');
 assert.equal(stopReason({...base,remaining:0}),'page_allowance');
 assert.equal(stopReason({...base,timeLimited:true}),'time_limit');
 assert.equal(stopReason({...base,modelCapReached:true}),'daily_spend_cap');
 assert.equal(stopReason(base),'nothing_due');
});

test('the trigger comes from how the job started',()=>{
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'schedule'}),'schedule');
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'workflow_dispatch'}),'manual');
 assert.equal(triggerFor({}),'manual');
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'workflow_dispatch'},{adminStart:true}),'admin_start');
});

const env={CRAWL_LOOP_ENABLED:'true',GITHUB_EVENT_NAME:'schedule'};
const frontier={source:async key=>({source_key:key,collection_enabled:true})};
function fakeStore({pages={},spendUsd=0,failStart=false}={}){
 const calls={started:[],finished:[]};
 return {calls,
  usedLast24h:async()=>({pages,spendUsd}),
  startWorkerRun:async input=>{if(failStart)throw new Error('db down');calls.started.push(input);return 'run-1';},
  finishWorkerRun:async(id,result)=>{calls.finished.push({id,...result});},
 };
}

test('a source at its daily cap gets no allowance and its share goes to the others',async()=>{
 const store=fakeStore({pages:{playbill:1000}});
 const seen=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async(row,options)=>{seen.push([row.source_key,options.maxPages]);return {pages:options.maxPages};},
  runOfficial:async(_,options)=>{seen.push(['official',options.maxPages]);return {pages:options.maxPages};}});
 assert.deepEqual(seen,[['london_theatre',50],['official',50]]);
 const [finished]=store.calls.finished;
 assert.deepEqual(finished.perSource.playbill,{pages:0,cap_hit:true});
 assert.equal(finished.perSource.london_theatre.pages,50);
 assert.equal(finished.stopReason,'page_allowance');
});

test('a source that reaches its cap partway through a run stops there and the rest flows on',async()=>{
 const store=fakeStore({pages:{playbill:980}});
 const seen=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async(row,options)=>{seen.push([row.source_key,options.maxPages]);return {pages:options.maxPages};},
  runOfficial:async(_,options)=>{seen.push(['official',options.maxPages]);return {pages:options.maxPages};}});
 assert.deepEqual(seen,[['london_theatre',34],['playbill',20],['official',46]],'playbill is held to its last 20 pages');
 const [finished]=store.calls.finished;
 assert.equal(finished.perSource.playbill.cap_hit,true);
 assert.equal(finished.perSource.london_theatre.cap_hit,false);
});

test('the daily model cap skips model work and says so, while page crawling continues',async()=>{
 const store=fakeStore({spendUsd:2});
 const official=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async()=>({pages:10}),
  runOfficial:async(_,options)=>{official.push(options.dailyModelUsd);return {pages:10,spendUsd:0};}});
 assert.deepEqual(official,[0]);
 assert.equal(store.calls.finished[0].stopReason,'daily_spend_cap');
 const partial=fakeStore({spendUsd:1.5});
 const left=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:partial,runSource:async()=>({pages:1}),runOfficial:async(_,options)=>{left.push(options.dailyModelUsd);return {pages:1,spendUsd:0.4};}});
 assert.deepEqual(left,[0.5]);
 assert.equal(partial.calls.finished[0].modelSpendUsd,0.4);
});

test('every run is recorded with its trigger and limits, and a recording failure never stops the crawl',async()=>{
 const store=fakeStore();
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,source:'playbill',scope:'london-listing',runSource:async()=>({pages:3})});
 const [started]=store.calls.started;
 assert.equal(started.trigger,'schedule');
 assert.deepEqual(started.filters,{source:'playbill',stage:'all',scope:'london-listing'});
 assert.deepEqual(started.limits,{page_allowance:100,run_minutes:20,run_spend_usd:1,daily_spend_usd:2,source_daily_pages:1000});
 const broken=fakeStore({failStart:true});
 const reports=await runScheduled({env,now:()=>0,frontier,workerRuns:broken,source:'playbill',runSource:async()=>({pages:2})});
 assert.equal(reports[0].pages,2,'the crawl ran although the record could not be written');
 assert.equal(broken.calls.finished.length,0);
});

test('a failed source ends the run as failed and is still recorded before the error is raised',async()=>{
 const store=fakeStore();
 await assert.rejects(runScheduled({env,now:()=>0,frontier,workerRuns:store,source:'london_theatre',runSource:async()=>{throw new Error('boom');}}),/failed/);
 assert.equal(store.calls.finished[0].stopReason,'failed');
 assert.match(store.calls.finished[0].perSource.london_theatre.error,/Source operation failed/);
});
