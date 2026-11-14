#!/usr/bin/env node
import { adapters } from './sources/index.mjs';
import { adapterScopes, formatFrontierProgress, HostDeferred, hostGate, runFrontierCli, safeError, runScheduledSource, scheduledSources } from './frontier.mjs';
import { createFrontierStore } from './frontier-store.mjs';
import { canonicalTaskUrl } from './frontier-url.mjs';
import { requestPublicPage } from './frontier-network.mjs';
import { parseArgs } from 'node:util';
import {randomUUID} from 'node:crypto';
import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createFetcher,createGuardedFetcher,createHostGate} from './fetch.mjs';
import {createRun,finishRun,loadSite,readRun,startRun} from './load.mjs';
import {crawlPersistentSite} from './persistent.mjs';
import {fingerprint} from './state.mjs';
import {savePage,saveSite,publish} from './site-store.mjs';
import * as store from './loop-store.mjs';
import {createModel} from './model.mjs';
import {discoverLinks,searchCandidates} from './discover.mjs';
import {writeRules} from './write-rules.mjs';
import {checkFindings,rulesReader} from './rules.mjs';
import {structuredReader} from './sources/theatre-site.mjs';
import {dailyLimits,modelBudget,runPagesFor,sourceAllowance,sourceStop,stopReason,FAST_EXIT_MINUTES,MAX_RUN_PAGES,OFFICIAL_SETUP_RUN_PAGES,RUN_MINUTES} from './schedule.mjs';
import * as workerRunStore from './worker-runs.mjs';

export function loopLimits(env=process.env){
 const number=(key,fallback,max)=>{const n=Number(env[key]??fallback);return Number.isFinite(n)&&n>=0?Math.min(n,max):fallback;};
 return {enabled:env.CRAWL_LOOP_ENABLED==='true',maxSites:Math.floor(number('CRAWL_MAX_SITES',25,100)),maxSearches:Math.floor(number('CRAWL_MAX_SEARCHES',20,100)),budgetUsd:number('CRAWL_MAX_SPEND_USD',1,10),siteBudgetUsd:number('CRAWL_SITE_SPEND_USD',0.20,1),maxPages:Math.floor(number('CRAWL_MAX_PAGES',100,MAX_RUN_PAGES)),maxMs:number('CRAWL_MAX_MINUTES',RUN_MINUTES,20)*60000};
}
export function executionLimits(env,run=null){
 const limits=loopLimits(env);
 if(run){limits.enabled=true;limits.maxSites=run.venue_ids.length;limits.budgetUsd=Number(run.budget_usd);}
 return limits;
}
// Dependency-injected orchestration: deterministic ordering, bounded work,
// isolated failures. No model step is needed to read an existing healthy site.
export async function runLoop({limits,deps,now=Date.now,deadline=now()+limits.maxMs}) {
 if(!limits.enabled) return {disabled:true,sites:[],spend:0};
 const sites=[];
 const work=await deps.work(limits.maxSites);
 const counters={searches:0,maxSearches:limits.maxSearches};
 const queue=work.slice(0,limits.maxSites).filter((venue,index,all)=>!venue.crawl_site_id || all.findIndex(v=>v.crawl_site_id===venue.crawl_site_id)===index);
 let cursor=0, checkpoints=Promise.resolve();
 const checkpoint=()=>{const snapshot=structuredClone({sites,searches:counters.searches,findings:sites.reduce((n,s)=>n+(s.findings??0),0)});checkpoints=checkpoints.then(()=>deps.checkpoint?.(snapshot));return checkpoints;};
 const completed=new Set();
 async function processVenue(venue) {
  const owner=randomUUID(),claimed=new Set();
  async function claimSite(candidate){
   if(claimed.has(candidate.id))return true;
   if(completed.has(candidate.id))return false;
   if(deps.claim && !await deps.claim(candidate.id,owner))return false;
   claimed.add(candidate.id);return true;
  }
  let site;
  const record={venue_id:venue.id,venue_name:venue.name,status:'pending'};sites.push(record);
  const audit=(actor,action,urls=[],detail)=>{
   // Decision metadata only: no query strings, fragments or credentials.
   const publicUrls=urls.flatMap(value=>{
    if(typeof value!=='string')return [];
    try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?[(url.origin+url.pathname).slice(0,512)]:[];}catch{return [];}
   });
   const decisions=record.decisions??=[];
   if(decisions.length<60)decisions.push({actor,action,urls:[...new Set(publicUrls)],...(detail?{detail:String(detail).slice(0,200)}:{})});
  };
  try{site=await deps.loadSite(venue);}catch{record.status='failed';record.reason='site_load_failed';await deps.recordVenue(venue,record.reason).catch(()=>{});await checkpoint();return;}
  const budgetKey=site?.id??venue.website??venue.id;
  const model=request=>deps.model({...request,siteId:budgetKey});
  const knownTitles=site?.pages?.filter(p=>p.type==='whats_on').flatMap(p=>p.titles??[])??[];
  async function setup(repair=false, repairModel=model) {
   if(repair && site) {
    const links=await deps.discover({venue,model:repairModel,limits:counters,repair:true,audit});
    if(links.deferred||links.failed)return links;
    const candidate={...site,whats_on_url:links.whats_on_url,archive_url:links.archive_url??site.archive_url};
    const prepared=await deps.writeRules({site:candidate,venues:site.venues,model:repairModel,knownTitles,deferActivation:true,audit});
    if(prepared.deferred||prepared.failed)return prepared;
    // Keep existing links and rules live until the replacement has passed the
    // page, date and known-show checks. Failed proposals never replace them.
    await deps.saveLinks(venue,links);site=await deps.loadSite(venue);
    if(!await claimSite(site))return {deferred:true,reason:'site_busy'};
    await deps.activatePrepared?.(site,prepared);site=await deps.loadSite(venue);
    return {ok:true};
   }
   if(!site) {
    const links=await deps.discover({venue,model,limits:counters,repair:false,audit});
    if(links.deferred||links.failed) return links;
    await deps.saveLinks(venue,links);site=await deps.loadSite(venue);
   }
   if(!site) return {failed:true,reason:'site_not_saved'};
   if(!await claimSite(site))return {deferred:true,reason:'site_busy'};
   if((!site.rules||repair) && !(!site.rules && await deps.hasStructured?.(site))) {
    const result=await deps.writeRules({site,venues:site.venues,model,knownTitles,audit});
    if(result.deferred||result.failed)return result;
    site=await deps.loadSite(venue);
   }
   return {ok:true};
  }
  try {
   if(site && !await claimSite(site)){record.status='deferred';record.reason='site_busy';return;}
   if(site?.status==='needs_attention' && !deps.manual && !deps.reserveRepair) {record.status='needs_attention';return;}
   let ready=await setup();
   if(!ready.ok) {
    record.status=ready.deferred?'deferred':'needs_attention';record.reason=ready.reason;record.detail=ready.detail;audit('Crawler','Source setup stopped',[site?.whats_on_url],ready.detail??ready.reason);
    if(ready.reason==='site_busy')return;
    if(site)await deps.recordSite(site,{status:ready.deferred?'pending':'needs_attention',reason:ready.reason});
    await deps.recordVenue(venue,ready.deferred?null:ready.reason);return;
   }
   let result=await deps.crawl(site,{deadline,maxPages:limits.maxPages,audit});
   if(result.status==='failed'&&result.reason!=='access_blocked') {
    if(!deps.reserveRepair && (site.repair_attempts??0)>=3 && !deps.manual){record.status='needs_attention';record.reason='repair_limit';await deps.recordSite(site,{status:'needs_attention',reason:'repair_limit'});await deps.recordVenue(venue,'repair_limit');return;}
    if(now()>=deadline-90000){record.status='deferred';record.reason='time_limit';return;}
    let reservation,attempt;
    const repairModel=deps.reserveRepair?request=>model({...request,beforeRequest:()=>{
     reservation??=deps.reserveRepair(site.id,`${site.rule_id??'structured-v1'}:${result.repairVersion??result.note}`).then(value=>{attempt=value;return value>0;});
     return reservation;
    }}):model;
    const repaired=await setup(true,repairModel);
    if(repaired.reason==='site_busy'){record.status='deferred';record.reason='site_busy';return;}
    if(!repaired.deferred) await deps.recordSite(site,{status:'pending',reason:repaired.reason??null,attempt:true});
    if(repaired.ok)result=await deps.crawl(site,{deadline,maxPages:limits.maxPages,audit});
    else {
     record.status=repaired.deferred?'deferred':'needs_attention';record.reason=repaired.reason;record.detail=repaired.detail;audit('Crawler','Repair did not activate a replacement',[site.whats_on_url],repaired.detail??repaired.reason);
     // Outages/budget exhaustion wait; only exhausted repair attempts need the owner.
     const exhausted=repaired.reason==='repair_limit'||(!repaired.deferred&&attempt===3)||(!deps.reserveRepair&&(site.repair_attempts??0)+1>=3);
     if(exhausted)record.status='needs_attention';
     await deps.recordSite(site,{status:exhausted?'needs_attention':'pending',reason:repaired.reason});
     await deps.recordVenue(venue,repaired.deferred?null:repaired.reason);return;
    }
   }
   if(result.reason==='access_blocked'||result.status==='blocked'||result.status==='deferred'){
    const status=result.reason==='access_blocked'?'blocked':result.status;
    Object.assign(record,{status,reason:result.reason,findings:result.findings,note:result.note});
    if(status==='blocked'){
     await deps.recordSite(site,{status:'pending',reason:result.reason});
     await deps.recordVenue(venue,result.reason);
    }
    return;
   }
   record.status=result.status==='failed'?'needs_attention':'done';record.findings=result.findings;record.note=result.note;
   await deps.recordSite(site,{status:result.status==='failed'?'needs_attention':'ready',reason:result.status==='failed'?result.note:null,crawled:result.status!=='failed'});
   await deps.recordVenue(venue,result.status==='failed'?result.note:null);
  } catch {record.status='failed';record.reason='site_operation_failed';await deps.recordVenue(venue,'site_operation_failed').catch(()=>{});}
  finally {
   if(record.status==='done')for(const id of claimed)completed.add(id);
   try{for(const id of claimed)await deps.release?.(id,owner);}finally{await checkpoint();}
  }
 }
 async function worker(){while(cursor<queue.length && now()<deadline-90000 && !deps.exhausted?.()){const venue=queue[cursor++];await processVenue(venue);}}
 const workers=await Promise.allSettled(Array.from({length:Math.min(4,queue.length)},()=>worker()));
 const failed=workers.find(w=>w.status==='rejected');if(failed)throw failed.reason;
 return {sites,searches:counters.searches};
}
// Every attempted theatre failed or needs attention: the run did not work, even though the loop did.
export function loopOutcome(sites){
 return {
  findings:sites.reduce((n,site)=>n+(site.findings??0),0),
  allFailed:sites.length>0&&sites.every(site=>['needs_attention','failed'].includes(site.status)),
 };
}
// Frontier engine: the crawl step queues the site's pages, or asks runLoop for a repair when the reader flagged the site.
// After a successful repair runLoop calls it again and the site gets a fresh generation.
export function frontierCrawlStep(siteStore){
 const repairing=new Set();
 return {repairing,crawl:async site=>{
  if(site.repair_requested_at&&!repairing.has(site.id)){
   repairing.add(site.id);
   const reason=site.repair_reason??'extraction_failed';
   return {status:'failed',note:reason,repairVersion:fingerprint(`${site.rule_id??'structured-v1'}:${reason}`)};
  }
  await siteStore.seedOfficialSite(site,{refresh:repairing.has(site.id)});
  return {status:'ok',findings:0,note:'queued for reading'};
 }};
}
// Without a saved run this is the official setup lane: it finds and repairs sites, and the page queue reads their pages (#544, #546).
// With a saved run (an admin start) it keeps the old per-site reader for the venues the admin chose.
export async function main(env=process.env,{runId,scheduled,deadline,maxPages,dailyModelUsd}={}) {
 let run=runId?await readRun(runId):null;
 if(runId && (!run || run.status!=='queued'))throw new Error('Run is missing or already started');
 const limits=executionLimits(env,run);
 if(!limits.enabled){console.log('Crawl loop disabled. Set CRAWL_LOOP_ENABLED=true to start.');return;}
 if(scheduled){
  limits.budgetUsd=Math.min(1,limits.budgetUsd);
  limits.siteBudgetUsd=Math.min(0.20,limits.siteBudgetUsd);
  // What is left of the daily model cap; 0 means no model work this run, and non-model crawling continues.
  if(Number.isFinite(dailyModelUsd))limits.budgetUsd=Math.min(limits.budgetUsd,Math.max(0,dailyModelUsd));
 }
 const spend={usd:0};
 const gate=createHostGate();
 const stopSignal=scheduled?AbortSignal.timeout(Math.max(1,deadline-Date.now()-10_000)):undefined;
 let pages=0;
 const frontier=createFrontierStore();
 const officialGate=scheduled?hostGate({store:{
  reserve:(id,host,gap)=>frontier.reserveOfficial(id,host,gap),
  release:frontier.release,
 },now:Date.now,onRequest:()=>{}}):null;
 const guarded=new Map();
 const makeFetcher=(cache={},conditional=true)=>{
  if(!scheduled)return createFetcher({cache,conditional,gate});
  return async value=>{
   if(stopSignal.aborted||pages>=maxPages)return {status:'deferred',error:stopSignal.aborted?'time_limit':'page_budget'};
   let host;
   try{host=new URL(value).hostname;}catch{return {status:'failed',error:'Invalid source URL'};}
   // example.com <-> www.example.com is one site; any other host stays refused.
   const hosts=[host,host.startsWith('www.')?host.slice(4):`www.${host}`];
   const url=canonicalTaskUrl(value,{allowedHosts:hosts});
   if(!url)return {status:'failed',error:'Invalid source URL'};
   pages++;
   if(!guarded.has(host))guarded.set(host,createGuardedFetcher({
    allowUrl:target=>canonicalTaskUrl(target,{allowedHosts:hosts}),
    minDelayMs:2000,request:requestPublicPage,gate:officialGate,
   }));
   try{
    const page=await guarded.get(host)(url,{...(conditional?cache[url]:{}),signal:stopSignal,context:run.id});
    return page;
   }catch(error){
    if(stopSignal.aborted||error instanceof HostDeferred||error.message==='Task lease or source policy changed')return {status:'deferred',error:stopSignal.aborted?'time_limit':'host_cooldown'};
    return {status:'failed',error:'Could not fetch the page'};
   }
  };
 };
 const fetchPage=makeFetcher({},false);
 const model=createModel({
  apiKey:env.ANTHROPIC_API_KEY,spend,budgetUsd:limits.budgetUsd,siteBudgetUsd:limits.siteBudgetUsd,stopSignal,
  ...(scheduled?{reserveSpend:(site,amount,limit)=>store.reserveSpend(run.id,site,amount,limit),settleSpend:store.settleSpend}:{}),
 });
 const lookupWebsite=async id=>{
  if(!/^Q[1-9][0-9]*$/.test(id))return null;
  const page=await fetchPage(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  if(page.status==='deferred'||page.status==='rate_limited')return page;
  try{return JSON.parse(page.html).entities[id].claims.P856?.find(c=>typeof c.mainsnak?.datavalue?.value==='string')?.mainsnak.datavalue.value??null;}catch{return null;}
 };
 const search=async query=>{const page=await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);return page.status==='ok'?searchCandidates(page.html):page.status==='deferred'||page.status==='rate_limited'?page:[];};
 if(run)await startRun(run.id);
 else run=await createRun({pipeline:'discover',venueIds:[],method:'rules',branch:env.GITHUB_REF_NAME,commitSha:env.GITHUB_SHA,budgetUsd:limits.budgetUsd});
 if(env.GITHUB_ENV)await appendFile(env.GITHUB_ENV,`CRAWL_RUN_ID=${run.id}\n`);
 const checkpoint=async summary=>finishRun(run.id,{status:'running',summary,costUsd:spend.usd});
 const seedFailures=[];
 const {crawl:frontierCrawl}=frontierCrawlStep(store);
 try {
  if(!runId){
   for(const row of await store.sitesToSeed(25)){
    try{await store.seedOfficialSite(row,{refresh:false});}
    catch(error){seedFailures.push(`${row.id}: ${safeError(error,120)}`);}
   }
  }
  const result=await runLoop({limits,deadline,deps:{exhausted:scheduled?()=>pages>=maxPages:undefined,reserveRepair:scheduled?store.reserveRepair:undefined,work:async count=>{const rows=runId?await store.selectedWork(run.venue_ids):await store.setupWork(count);if(!runId)await store.setRunVenues(run.id,rows.map(v=>v.id));return rows;},loadSite:store.loadWorkSite,model,manual:Boolean(runId),claim:(id,owner)=>store.claim(id,run.id,owner),release:store.release,
   hasStructured:async site=>{const page=await fetchPage(site.whats_on_url);return page.status==='ok'&&checkFindings(page.html,structuredReader({url:site.whats_on_url,html:page.html},{venues:site.venues})??[]).some(f=>f.start_date);},
   discover:args=>discoverLinks({...args,fetchPage,lookupWebsite,search}),saveLinks:store.saveLinks,recordSite:store.recordSite,recordVenue:store.recordVenue,
   activatePrepared:(site,result)=>store.adoptVersion(site,result.ruleId,result.validation),
   writeRules:async args=>writeRules({...args,fetchPage,proposed:await store.proposed(args.site),saveVersion:(rules,author,check)=>store.saveVersion(args.site,rules,author,check),activate:(id,check)=>store.activate(args.site,id,check)}),
   crawl:!runId?frontierCrawl:(site,options)=>{const cache=Object.fromEntries((site.pages??[]).filter(p=>p.status==='ok'&&p.rule_id===site.rule_id).map(p=>[p.url,{etag:p.etag,lastModified:p.last_modified}]));return crawlPersistentSite({site,venues:site.venues,run,spend,readers:[rulesReader,structuredReader],fetchPage:makeFetcher(cache),bounded:scheduled,store:{page:savePage,site:saveSite},load:(url,findings)=>loadSite(run.id,url,findings),publish:()=>publish(run.id),...options});},checkpoint}});
  if(scheduled) result.pages=pages;
  result.spendUsd=spend.usd;
  result.runId=run.id;
  if(seedFailures.length)result.seedFailures=seedFailures;
  const progress=await store.progress();
  const {findings,allFailed}=loopOutcome(result.sites);
  await finishRun(run.id,{status:allFailed?'failed':'done',summary:{...result,progress,findings},costUsd:spend.usd});
  const words=value=>String(value).split('_').join(' ');
  const detail=site=>`${site.venue_name??site.venue_id}: ${site.status}${site.reason?` (${words(site.reason)}${site.detail?`: ${words(site.detail)}`:''})`:''}`;
  const report=`# Crawl loop${runId?'':' (setup lane)'}\n\n${result.sites.length} sites, ${findings} findings, ${result.searches} searches, $${spend.usd.toFixed(4)}.${allFailed?'\n\nEvery attempted theatre failed or needs attention.':''}\n\n${Object.entries(progress).map(([key,value])=>`- ${key}: ${value}`).join('\n')}\n\n${result.sites.map(site=>`- ${detail(site)}`).join('\n')}\n${seedFailures.map(line=>`- could not queue ${line}`).join('\n')}`;
  console.log(report);if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,report);
  result.allFailed=allFailed;
  return result;
 } catch(error){await finishRun(run.id,{status:'failed',summary:{...(await readRun(run.id))?.summary,error:'Loop interrupted'},costUsd:spend.usd});throw error;}
}
// Official sites in two lanes at the same time (#544, #546): setup (AI finds the page and writes or repairs the reading
// rules; a fixed page allowance, the whole model budget) and reading (the page queue; the official page allowance, no model).
// One lane failing never stops the other.
export async function runOfficialLanes({env,row,pages,deadline,now,model,runOfficial,runSource,frontier}){
 const lanes=[
  ['setup',()=>runOfficial(env,{scheduled:true,deadline,maxPages:OFFICIAL_SETUP_RUN_PAGES,dailyModelUsd:model.budgetUsd})],
  ['reading',()=>runSource(row,{stage:'all',maxPages:pages,stopSignal:AbortSignal.timeout(Math.max(1,deadline-now()-90_000)),geocoder:null},frontier)],
 ];
 const settled=await Promise.allSettled(lanes.map(([,run])=>run()));
 const value=index=>settled[index].status==='fulfilled'?settled[index].value??{}:{};
 const [setup,reading]=[value(0),value(1)];
 const errors=settled.flatMap((outcome,index)=>outcome.status==='rejected'?[`${lanes[index][0]} lane: ${safeError(outcome.reason,120)}`]:[]);
 return {
  ...setup,pages:(setup.pages??0)+(reading.pages??0),spendUsd:setup.spendUsd??0,runId:setup.runId,
  requests:reading.requests,statuses:reading.statuses,
  frontier:{pages:reading.pages??0,requests:reading.requests??0,statuses:reading.statuses??{}},
  setup:{pages:setup.pages??0,sites:setup.sites?.length??0},
  ...(errors.length?{error:errors.join('; ').slice(0,400)}:{}),
 };
}
export async function runScheduled({
 env=process.env,source,stage='all',scope,now=Date.now,frontier=createFrontierStore(),
 runSource=runScheduledSource,runOfficial=main,workerRuns=null,
}={}){
 const limits=loopLimits(env);
 if(!limits.enabled){console.log('Crawl loop disabled. Set CRAWL_LOOP_ENABLED=true to start.');return [];}
 // The adapter files are the source of truth for static facts; a run with unknown source facts must not proceed.
 await frontier.syncSources?.(Object.values(adapters));
 if(!['all','directory','venue','event'].includes(stage))throw new Error('Unknown crawl stage');
 if(source && ![...scheduledSources,'official'].includes(source))throw new Error('Unknown crawl source');
 if(source==='official'&&stage!=='all')throw new Error('The official-site loop uses the complete site workflow');
 // A scope limits one aggregate source to one seed's crawl (playbill: london-listing) so new work is not stuck
 // behind an older backlog; it needs a named source and must be one of that adapter's seed scopes.
 if(scope&&(!source||source==='official'||!adapterScopes(source).includes(scope)))throw new Error('Unknown crawl scope for that source');
 const deadline=now()+limits.maxMs;
 const keys=source?[source]:stage==='all'?[...scheduledSources,'official']:scheduledSources;
 const sources=await Promise.all(keys.map(key=>frontier.source(key)));
 if(sources.some(row=>!row))throw new Error('Scheduled crawl source missing in the database');
 const active=sources.filter(row=>row.collection_enabled&&!row.paused_reason&&!row.operator_paused_at);

 // Daily limits. Recording is best effort: a failure here must never stop the crawl itself.
 const daily=dailyLimits(env);
 const used=workerRuns?await workerRuns.usedLast24h().catch(()=>({pages:{},spendUsd:0})):{pages:{},spendUsd:0};
 const dailyLeft=key=>Math.max(0,daily.sourceDailyPages-(used.pages[key]??0));
 const model=modelBudget({runBudgetUsd:limits.budgetUsd,dailySpendUsd:daily.dailySpendUsd,spentLast24hUsd:used.spendUsd});
 // Each source has its own allowance for this run, trimmed to what is left of its daily cap.
 const allowances=new Map(active.map(row=>[row.source_key,sourceAllowance({runPages:runPagesFor(row.source_key,env,adapters[row.source_key]),dailyRemaining:dailyLeft(row.source_key)})]));
 const atCap=active.filter(row=>allowances.get(row.source_key).pages===0);
 const eligible=active.filter(row=>!atCap.includes(row));
 const trigger=workerRunStore.triggerFor(env);

 // A scheduled start right behind a run that left nothing due (GitHub's backup schedule after Supabase's start)
 // has nothing to do. It records itself and exits at once.
 let fastExit=false;
 if(workerRuns&&trigger==='schedule'&&eligible.length&&workerRuns.previousRun){
  const previous=await workerRuns.previousRun().catch(()=>null);
  fastExit=Boolean(previous&&previous.age_seconds<FAST_EXIT_MINUTES*60&&eligible.every(row=>previous.per_source?.[row.source_key]?.stop==='nothing_due'));
 }

 const workerRunId=workerRuns?await workerRuns.startWorkerRun({
  trigger,via:workerRunStore.startedVia(env),filters:{source,stage,scope},
  limits:{source_run_pages:runPagesFor('',env),official_run_pages:runPagesFor('official',env),
   allowances:Object.fromEntries([...allowances].map(([key,value])=>[key,value.pages])),
   run_minutes:Math.round(limits.maxMs/60000),run_spend_usd:limits.budgetUsd,daily_spend_usd:daily.dailySpendUsd,source_daily_pages:daily.sourceDailyPages},
 },env).catch(()=>null):null;

 // Sources are different hosts and per-host pacing is unchanged, so they run at the same time and each
 // gets the whole window. Running out of time is a checkpoint for that source, not a failure.
 const outcomes=fastExit?[]:await Promise.all(eligible.map(async row=>{
  const key=row.source_key,mine=allowances.get(key);
  try{
   const result=key==='official'
    ?await runOfficialLanes({env,row,pages:mine.pages,deadline,now,model,runOfficial,runSource,frontier})
    :await runSource(row,{stage,...(scope?{scope}:{}),maxPages:mine.pages,stopSignal:AbortSignal.timeout(Math.max(1,deadline-now()-90_000))},frontier);
   if(env.GITHUB_STEP_SUMMARY&&key!=='official'){
    try{await appendFile(env.GITHUB_STEP_SUMMARY,await formatFrontierProgress(frontier,key));}
    catch{console.log(`Progress snapshot unavailable for ${key}; use the source progress view.`);}
   }
   return {mine,endedAt:now(),report:{...result,source:key}};
  }catch(error){
   // Keep the error class and a URL- and secret-stripped message so the cause is visible; resume is unchanged.
   return {mine,endedAt:now(),report:{source:key,error:`Source operation failed (${safeError(error,300)}); saved leases and checkpoints will resume`.slice(0,400)}};
  }
 }));
 const reports=outcomes.map(outcome=>outcome.report);
 const perSource={};
 for(const row of atCap)perSource[row.source_key]={pages:0,cap_hit:true,stop:'daily_cap'};
 if(fastExit)for(const row of eligible)perSource[row.source_key]={pages:0,cap_hit:false,stop:'nothing_due'};
 for(const {report,mine,endedAt} of outcomes){
  const pages=report.pages??0;
  perSource[report.source]={pages,requests:report.requests,statuses:report.statuses,
   ...(report.error?{error:report.error}:{}),...(report.frontier?{frontier:report.frontier}:{}),...(report.setup?{setup:report.setup}:{}),...(report.spendUsd?{model_spend_usd:report.spendUsd}:{}),...(report.runId?{run_id:report.runId}:{}),
   stop:report.error?'failed':sourceStop({pages,allowance:mine,limitedBy:mine.limitedBy,timeLimited:endedAt>=deadline-90_000}),
   cap_hit:dailyLeft(report.source)-pages<=0};
 }
 const stops=Object.values(perSource).map(value=>value.stop);
 const failed=reports.some(report=>report.error||report.allFailed);
 const modelCapReached=model.capReached&&active.some(row=>row.source_key==='official');
 const reason=fastExit?'nothing_due':stopReason({failed,pageLimited:stops.includes('page_allowance'),timeLimited:stops.includes('time_limit'),dailyCapped:stops.includes('daily_cap'),modelCapReached});

 if(workerRunId){
  await workerRuns.finishWorkerRun(workerRunId,{perSource,stopReason:reason,modelSpendUsd:reports.reduce((sum,report)=>sum+(report.spendUsd??0),0)}).catch(()=>{});
 }

 const words=value=>String(value).split('_').join(' ');
 const summary=`## Scheduled crawl

${fastExit?'Nothing was due for any source a few minutes ago, so this start exited at once.':`Stopped: ${words(reason)}.`}

`+
  sources.filter(row=>!active.includes(row)).map(row=>`- ${row.source_key}: collection disabled or paused
`).join('')+
  atCap.map(row=>`- ${row.source_key}: today's limit of ${daily.sourceDailyPages} pages reached; resumes as earlier runs age out of the last 24 hours
`).join('')+
  (modelCapReached?`- model work skipped: today's $${daily.dailySpendUsd} model limit reached
`:'')+
  reports.map(report=>`- ${report.source}: ${report.error??JSON.stringify({pages:report.pages,allowance:allowances.get(report.source).pages,stopped:words(perSource[report.source].stop),requests:report.requests,statuses:report.statuses})}
`).join('');
 console.log(summary);
 if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,summary);
 if(failed)throw new Error('One or more crawl sources failed; see run summary');
 return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--scheduled') {
    Promise.resolve().then(()=>{
      const {values}=parseArgs({args:process.argv.slice(3),options:{source:{type:'string'},stage:{type:'string'},scope:{type:'string'}}});
      return runScheduled({...values,workerRuns:workerRunStore});
    }).catch(error=>{console.error(error.message);process.exitCode=1;});
  } else if (process.argv.length > 2) {
    runFrontierCli().catch(error => { console.error(error.message); process.exitCode = 1; });
  } else {
    main().then(result => { if (result?.allFailed) process.exitCode = 1; }).catch(() => { console.error('Crawl loop failed; see saved run for progress.'); process.exitCode = 1; });
  }
}
