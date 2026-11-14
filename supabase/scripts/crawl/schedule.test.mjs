import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {test} from 'node:test';
import {runScheduled} from './loop.mjs';
import {CRON,CRON_MINUTES,DISPATCH_JOB,MAX_RUN_PAGES,OFFICIAL_RUN_PAGES,RETRY_DELAYS_SECONDS,SOURCE_RUN_PAGES,dailyLimits,modelBudget,runPagesFor,sourceAllowance,sourceStop,stopReason} from './schedule.mjs';
import {startedVia,triggerFor} from './worker-runs.mjs';

test('the workflow cron is the one the admin shows, twice an hour and off the hour',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/catalogue-crawl.yml',import.meta.url),'utf8');
 assert.equal(workflow.match(/cron:\s*"([^"]+)"/)?.[1],CRON);
 assert.equal(CRON,`${CRON_MINUTES.join(',')} * * * *`);
 assert.deepEqual(CRON_MINUTES,[17,47]);
 const dispatch=readdirSync(new URL('../../migrations/',import.meta.url)).filter(name=>name.endsWith('_crawl_dispatch_from_supabase.sql'));
 assert.equal(dispatch.length,1,'the dispatch migration exists once');
 const sql=readFileSync(new URL('../../migrations/'+dispatch[0],import.meta.url),'utf8');
 assert.match(sql,new RegExp(`cron\\.schedule\\(\\s*'${DISPATCH_JOB}',\\s*'${CRON.replaceAll('*','\\*')}'`),'the pg_cron schedule must match the workflow cron');
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

test('each source has its own run allowance, with overrides and clamping',()=>{
 assert.equal(runPagesFor('playbill',{}),SOURCE_RUN_PAGES);
 assert.equal(runPagesFor('london_theatre',{}),150);
 assert.equal(runPagesFor('official',{}),OFFICIAL_RUN_PAGES);
 assert.equal(runPagesFor('playbill',{CRAWL_SOURCE_RUN_PAGES:'200'}),200);
 assert.equal(runPagesFor('official',{CRAWL_SOURCE_RUN_PAGES:'200',CRAWL_OFFICIAL_RUN_PAGES:'25'}),25,'official has its own variable');
 assert.equal(runPagesFor('playbill',{CRAWL_SOURCE_RUN_PAGES:'200',CRAWL_SOURCE_RUN_PAGES_PLAYBILL:'30'}),30,'one source can be slowed without the others');
 assert.equal(runPagesFor('london_theatre',{CRAWL_SOURCE_RUN_PAGES:'200',CRAWL_SOURCE_RUN_PAGES_PLAYBILL:'30'}),200);
 assert.equal(runPagesFor('london_theatre',{CRAWL_SOURCE_RUN_PAGES_LONDON_THEATRE:'10'}),10);
 assert.equal(runPagesFor('playbill',{CRAWL_SOURCE_RUN_PAGES:'9999'}),MAX_RUN_PAGES,'nothing goes above the hard cap');
 assert.equal(runPagesFor('playbill',{CRAWL_SOURCE_RUN_PAGES:'',CRAWL_SOURCE_RUN_PAGES_PLAYBILL:''}),150,'empty repository variables fall back');
 assert.equal(runPagesFor('playbill',{CRAWL_SOURCE_RUN_PAGES:'lots'}),150);
 assert.equal(runPagesFor('playbill',{CRAWL_SOURCE_RUN_PAGES:'0'}),0,'zero pauses a source');
 assert.equal(runPagesFor('slow',{},{runPages:40}),40,"an adapter's own allowance replaces the default");
 assert.equal(runPagesFor('slow',{CRAWL_SOURCE_RUN_PAGES:'90'},{runPages:40}),90,'a repository variable still wins');
 assert.equal(runPagesFor('slow',{},{}),SOURCE_RUN_PAGES);
});

test('the daily cap trims a source allowance and says so',()=>{
 assert.deepEqual(sourceAllowance({runPages:150,dailyRemaining:1000}),{pages:150,limitedBy:'page_allowance'});
 assert.deepEqual(sourceAllowance({runPages:150,dailyRemaining:20}),{pages:20,limitedBy:'daily_cap'});
 assert.deepEqual(sourceAllowance({runPages:150,dailyRemaining:0}),{pages:0,limitedBy:'daily_cap'});
});

test('a source stops because it used its allowance, ran out of time, or had nothing due',()=>{
 const full=sourceAllowance({runPages:150,dailyRemaining:1000});
 assert.equal(sourceStop({pages:150,allowance:full,limitedBy:full.limitedBy,timeLimited:false}),'page_allowance');
 assert.equal(sourceStop({pages:150,allowance:full,limitedBy:full.limitedBy,timeLimited:true}),'page_allowance','using the allowance wins over the clock');
 assert.equal(sourceStop({pages:90,allowance:full,limitedBy:full.limitedBy,timeLimited:true}),'time_limit');
 assert.equal(sourceStop({pages:10,allowance:full,limitedBy:full.limitedBy,timeLimited:false}),'nothing_due');
 const trimmed=sourceAllowance({runPages:150,dailyRemaining:20});
 assert.equal(sourceStop({pages:20,allowance:trimmed,limitedBy:trimmed.limitedBy,timeLimited:false}),'daily_cap');
 assert.equal(sourceStop({pages:0,allowance:sourceAllowance({runPages:150,dailyRemaining:0}),limitedBy:'daily_cap',timeLimited:false}),'daily_cap');
});

test('a run ends for the most important reason',()=>{
 const base={failed:false,pageLimited:false,timeLimited:false,dailyCapped:false,modelCapReached:false};
 assert.equal(stopReason({...base,failed:true,pageLimited:true}),'failed');
 assert.equal(stopReason({...base,pageLimited:true,timeLimited:true}),'page_allowance');
 assert.equal(stopReason({...base,timeLimited:true,dailyCapped:true}),'time_limit');
 assert.equal(stopReason({...base,dailyCapped:true,modelCapReached:true}),'daily_cap');
 assert.equal(stopReason({...base,modelCapReached:true}),'daily_spend_cap');
 assert.equal(stopReason(base),'nothing_due');
});

test('the trigger comes from how the job started',()=>{
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'schedule'}),'schedule');
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'workflow_dispatch'}),'manual');
 assert.equal(triggerFor({}),'manual');
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'workflow_dispatch',CRAWL_TRIGGER:'cron'}),'schedule','a start sent by Supabase counts as the schedule');
 assert.equal(startedVia({GITHUB_EVENT_NAME:'workflow_dispatch',CRAWL_TRIGGER:'cron'}),'supabase');
 assert.equal(startedVia({GITHUB_EVENT_NAME:'schedule'}),'github_schedule');
 assert.equal(startedVia({GITHUB_EVENT_NAME:'workflow_dispatch'}),null);
 assert.equal(startedVia({CRAWL_TRIGGER:'cron'},{adminStart:true}),null);
 assert.equal(triggerFor({GITHUB_EVENT_NAME:'workflow_dispatch'},{adminStart:true}),'admin_start');
});

const env={CRAWL_LOOP_ENABLED:'true',GITHUB_EVENT_NAME:'schedule'};
const frontier={source:async key=>({source_key:key,collection_enabled:true})};
function fakeStore({pages={},spendUsd=0,failStart=false,previous=null}={}){
 const calls={started:[],finished:[]};
 return {calls,
  usedLast24h:async()=>({pages,spendUsd}),
  previousRun:async()=>previous,
  startWorkerRun:async input=>{if(failStart)throw new Error('db down');calls.started.push(input);return 'run-1';},
  finishWorkerRun:async(id,result)=>{calls.finished.push({id,...result});},
 };
}
const everything=pages=>({pages,statuses:{}});

test('sources run at the same time, each with its own allowance',async()=>{
 const store=fakeStore();
 const seen=[];let started=0,release;const together=new Promise(resolve=>{release=resolve;});
 const meet=async()=>{if(++started===4)release();await Promise.race([together,new Promise((_,reject)=>setTimeout(()=>reject(new Error('one after another')),1000))]);};
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  // Official runs as two lanes: setup (25 pages) and reading (the whole official allowance of 50).
  runSource:async(row,options)=>{await meet();seen.push([row.source_key,options.maxPages]);return everything(options.maxPages);},
  runOfficial:async(_,options)=>{await meet();seen.push(['official-setup',options.maxPages]);return everything(options.maxPages);}});
 assert.deepEqual(seen.sort(),[['london_theatre',150],['official',50],['official-setup',25],['playbill',150]].sort());
 const [finished]=store.calls.finished;
 assert.equal(finished.stopReason,'page_allowance');
 assert.deepEqual(Object.fromEntries(Object.entries(finished.perSource).map(([key,value])=>[key,value.stop])),{london_theatre:'page_allowance',playbill:'page_allowance',official:'page_allowance'});
});

test('repository variables change the allowances, and one source can be slowed alone',async()=>{
 const seen=[];
 await runScheduled({env:{...env,CRAWL_SOURCE_RUN_PAGES:'200',CRAWL_SOURCE_RUN_PAGES_PLAYBILL:'30',CRAWL_OFFICIAL_RUN_PAGES:'20'},now:()=>0,frontier,workerRuns:fakeStore(),
  runSource:async(row,options)=>{seen.push([row.source_key,options.maxPages]);return everything(0);},
  runOfficial:async()=>everything(0)});
 assert.deepEqual(seen.sort(),[['london_theatre',200],['official',20],['playbill',30]],'the official reading lane takes the whole official allowance');
});

test('a source at its daily cap gets no pages and the others are not affected',async()=>{
 const store=fakeStore({pages:{playbill:1000}});
 const seen=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async(row,options)=>{if(row.source_key!=='official')seen.push([row.source_key,options.maxPages]);return everything(row.source_key==='official'?options.maxPages+1:options.maxPages);},
  runOfficial:async(_,options)=>{if(!options.engine)seen.push(['official',options.maxPages]);return everything(options.maxPages);}});
 assert.deepEqual(seen.sort(),[['london_theatre',150],['official',25]]);
 const [finished]=store.calls.finished;
 assert.deepEqual(finished.perSource.playbill,{pages:0,cap_hit:true,stop:'daily_cap'});
});

test('the daily cap trims one source part way and that source reports the daily cap',async()=>{
 const store=fakeStore({pages:{playbill:980}});
 const seen=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async(row,options)=>{if(row.source_key!=='official')seen.push([row.source_key,options.maxPages]);return everything(row.source_key==='official'?options.maxPages+1:options.maxPages);},
  runOfficial:async(_,options)=>{if(!options.engine)seen.push(['official',options.maxPages]);return everything(options.maxPages);}});
 assert.deepEqual(seen.sort(),[['london_theatre',150],['official',25],['playbill',20]],'playbill is held to its last 20 pages');
 const [finished]=store.calls.finished;
 assert.equal(finished.perSource.playbill.stop,'daily_cap');
 assert.equal(finished.perSource.playbill.cap_hit,true);
 assert.equal(finished.perSource.london_theatre.stop,'page_allowance');
 assert.equal(finished.perSource.london_theatre.cap_hit,false);
});

test('one source failing does not stop the others, and the run is still recorded as failed',async()=>{
 const store=fakeStore();
 const seen=[];
 await assert.rejects(runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async row=>{if(row.source_key==='playbill')throw new Error('boom');if(row.source_key!=='official')seen.push(row.source_key);return everything(5);},
  runOfficial:async(_,options)=>{if(!options.engine)seen.push('official');return everything(5);}}),/failed/);
 assert.deepEqual(seen.sort(),['london_theatre','official'],'the other sources ran');
 const [finished]=store.calls.finished;
 assert.equal(finished.stopReason,'failed');
 assert.equal(finished.perSource.playbill.stop,'failed');
 assert.match(finished.perSource.playbill.error,/Source operation failed/);
 assert.equal(finished.perSource.london_theatre.pages,5);
});

test('running out of time is a checkpoint for that source only',async()=>{
 const store=fakeStore();
 let clock=0;
 const result=await runScheduled({env,now:()=>clock,frontier,workerRuns:store,source:undefined,stage:'venue',
  runSource:async row=>{if(row.source_key==='playbill'){await new Promise(resolve=>setTimeout(resolve,20));clock=1_200_000;return everything(40);}return everything(10);}});
 assert.equal(result.length,2);
 const [finished]=store.calls.finished;
 assert.equal(finished.perSource.playbill.stop,'time_limit','playbill finished after the window closed');
 assert.equal(finished.perSource.london_theatre.stop,'nothing_due','london finished early with nothing more due');
 assert.equal(finished.stopReason,'time_limit');
});

test('a start right behind a run that left nothing due exits at once',async()=>{
 const nothing={age_seconds:120,per_source:{london_theatre:{stop:'nothing_due'},playbill:{stop:'nothing_due'},official:{stop:'nothing_due'}}};
 const store=fakeStore({previous:nothing});
 const never=async()=>assert.fail('a start with nothing to do must not read pages');
 assert.deepEqual(await runScheduled({env,now:()=>0,frontier,workerRuns:store,runSource:never,runOfficial:never}),[]);
 assert.equal(store.calls.finished[0].stopReason,'nothing_due');
 assert.equal(store.calls.started.length,1,'the quick start is still recorded');
 // Not fast: the last run is old, it left work, or someone started this one by hand.
 const ran=[];const run=async row=>{ran.push(row.source_key);return everything(0);};
 const official=async()=>{ran.push('official');return everything(0);};
 await runScheduled({env,now:()=>0,frontier,workerRuns:fakeStore({previous:{...nothing,age_seconds:700}}),runSource:run,runOfficial:official});
 await runScheduled({env,now:()=>0,frontier,workerRuns:fakeStore({previous:{...nothing,per_source:{...nothing.per_source,playbill:{stop:'page_allowance'}}}}),runSource:run,runOfficial:official});
 await runScheduled({env:{...env,GITHUB_EVENT_NAME:'workflow_dispatch'},now:()=>0,frontier,workerRuns:fakeStore({previous:nothing}),runSource:run,runOfficial:official});
 assert.equal(ran.length,12,'all three starts read every source (official in two lanes)');
});

test('the daily model cap skips model work and says so, while page crawling continues',async()=>{
 const store=fakeStore({spendUsd:2});
 const official=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,
  runSource:async()=>everything(10),
  runOfficial:async(_,options)=>{official.push(options.dailyModelUsd);return {pages:10,spendUsd:0};}});
 assert.deepEqual(official,[0],'the setup lane gets none');
 assert.equal(store.calls.finished[0].stopReason,'daily_spend_cap');
 const partial=fakeStore({spendUsd:1.5});
 const left=[];
 await runScheduled({env,now:()=>0,frontier,workerRuns:partial,runSource:async()=>everything(1),runOfficial:async(_,options)=>{left.push(options.dailyModelUsd);return {pages:1,spendUsd:0.4};}});
 assert.deepEqual(left,[0.5],'the setup lane gets all that is left');
 assert.equal(partial.calls.finished[0].modelSpendUsd,0.4);
});

test('every run is recorded with its trigger, who started it and its limits, and a recording failure never stops the crawl',async()=>{
 const store=fakeStore();
 await runScheduled({env,now:()=>0,frontier,workerRuns:store,source:'playbill',scope:'london-listing',runSource:async()=>everything(3)});
 const [started]=store.calls.started;
 assert.equal(started.trigger,'schedule');
 assert.equal(started.via,'github_schedule');
 assert.deepEqual(started.filters,{source:'playbill',stage:'all',scope:'london-listing'});
 assert.deepEqual(started.limits,{source_run_pages:150,official_run_pages:50,allowances:{playbill:150},run_minutes:20,run_spend_usd:1,daily_spend_usd:2,source_daily_pages:1000});
 const supabase=fakeStore();
 await runScheduled({env:{...env,GITHUB_EVENT_NAME:'workflow_dispatch',CRAWL_TRIGGER:'cron'},now:()=>0,frontier,workerRuns:supabase,source:'playbill',runSource:async()=>everything(1)});
 assert.equal(supabase.calls.started[0].trigger,'schedule');
 assert.equal(supabase.calls.started[0].via,'supabase');
 const broken=fakeStore({failStart:true});
 const reports=await runScheduled({env,now:()=>0,frontier,workerRuns:broken,source:'playbill',runSource:async()=>everything(2)});
 assert.equal(reports[0].pages,2,'the crawl ran although the record could not be written');
 assert.equal(broken.calls.finished.length,0);
});
