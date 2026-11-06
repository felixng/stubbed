#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createFetcher,createHostGate} from './fetch.mjs';
import {createRun,finishRun,loadSite,readRun,startRun} from './load.mjs';
import {crawlPersistentSite} from './persistent.mjs';
import {savePage,saveSite,publish} from './site-store.mjs';
import * as store from './loop-store.mjs';
import {createModel} from './model.mjs';
import {discoverLinks,searchCandidates} from './discover.mjs';
import {writeRules} from './write-rules.mjs';
import {checkFindings,rulesReader} from './rules.mjs';
import {structuredReader} from './sources/theatre-site.mjs';

export function loopLimits(env=process.env){
 const number=(key,fallback,max)=>{const n=Number(env[key]??fallback);return Number.isFinite(n)&&n>=0?Math.min(n,max):fallback;};
 return {enabled:env.CRAWL_LOOP_ENABLED==='true',maxSites:Math.floor(number('CRAWL_MAX_SITES',25,100)),maxSearches:Math.floor(number('CRAWL_MAX_SEARCHES',20,100)),budgetUsd:number('CRAWL_MAX_SPEND_USD',1,10),siteBudgetUsd:number('CRAWL_SITE_SPEND_USD',0.20,1),maxPages:Math.floor(number('CRAWL_MAX_PAGES',100,200)),maxMs:number('CRAWL_MAX_MINUTES',20,20)*60000};
}
export function executionLimits(env,run=null){
 const limits=loopLimits(env);
 if(run){limits.enabled=true;limits.maxSites=run.venue_ids.length;limits.budgetUsd=Number(run.budget_usd);}
 return limits;
}
// Dependency-injected orchestration: deterministic ordering, bounded work,
// isolated failures. No model step is needed to read an existing healthy site.
export async function runLoop({limits,deps,now=Date.now}) {
 if(!limits.enabled) return {disabled:true,sites:[],spend:0};
 const deadline=now()+limits.maxMs,sites=[];
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
  const record={venue_id:venue.id,status:'pending'};sites.push(record);
  try{site=await deps.loadSite(venue);}catch{record.status='failed';record.reason='site_load_failed';await deps.recordVenue(venue,record.reason).catch(()=>{});await checkpoint();return;}
  const budgetKey=site?.id??venue.website??venue.id;
  const model=request=>deps.model({...request,siteId:budgetKey});
  const knownTitles=site?.pages?.filter(p=>p.type==='whats_on').flatMap(p=>p.titles??[])??[];
  async function setup(repair=false) {
   if(repair && site) {
    const links=await deps.discover({venue,model,limits:counters,repair:true});
    if(links.deferred||links.failed)return links;
    const candidate={...site,whats_on_url:links.whats_on_url,archive_url:links.archive_url??site.archive_url};
    const prepared=await deps.writeRules({site:candidate,venues:site.venues,model,knownTitles,deferActivation:true});
    if(prepared.deferred||prepared.failed)return prepared;
    // Keep existing links and rules live until the replacement has passed the
    // page, date and known-show checks. Failed proposals never replace them.
    await deps.saveLinks(venue,links);site=await deps.loadSite(venue);
    if(!await claimSite(site))return {deferred:true,reason:'site_busy'};
    await deps.activatePrepared?.(site,prepared);site=await deps.loadSite(venue);
    return {ok:true};
   }
   if(!site) {
    const links=await deps.discover({venue,model,limits:counters,repair:false});
    if(links.deferred||links.failed) return links;
    await deps.saveLinks(venue,links);site=await deps.loadSite(venue);
   }
   if(!site) return {failed:true,reason:'site_not_saved'};
   if(!await claimSite(site))return {deferred:true,reason:'site_busy'};
   if((!site.rules||repair) && !(!site.rules && await deps.hasStructured?.(site))) {
    const result=await deps.writeRules({site,venues:site.venues,model,knownTitles});
    if(result.deferred||result.failed)return result;
    site=await deps.loadSite(venue);
   }
   return {ok:true};
  }
  try {
   if(site && !await claimSite(site)){record.status='deferred';record.reason='site_busy';return;}
   if(site?.status==='needs_attention' && !deps.manual) {record.status='needs_attention';return;}
   let ready=await setup();
   if(!ready.ok) {
    record.status=ready.deferred?'deferred':'needs_attention';record.reason=ready.reason;
    if(ready.reason==='site_busy')return;
    if(site)await deps.recordSite(site,{status:ready.deferred?'pending':'needs_attention',reason:ready.reason});
    await deps.recordVenue(venue,ready.deferred?null:ready.reason);return;
   }
   let result=await deps.crawl(site,{deadline,maxPages:limits.maxPages});
   if(result.status==='failed') {
    if((site.repair_attempts??0)>=3 && !deps.manual){record.status='needs_attention';record.reason='repair_limit';await deps.recordSite(site,{status:'needs_attention',reason:'repair_limit'});await deps.recordVenue(venue,'repair_limit');return;}
    if(now()>=deadline-90000){record.status='deferred';record.reason='time_limit';return;}
    const repaired=await setup(true);
    if(repaired.reason==='site_busy'){record.status='deferred';record.reason='site_busy';return;}
    if(!repaired.deferred) await deps.recordSite(site,{status:'pending',reason:repaired.reason??null,attempt:true});
    if(repaired.ok)result=await deps.crawl(site,{deadline,maxPages:limits.maxPages});
    else {
     record.status=repaired.deferred?'deferred':'needs_attention';record.reason=repaired.reason;
     // Outages/budget exhaustion wait; only exhausted repair attempts need the owner.
     const exhausted=(site.repair_attempts??0)+1>=3;
     await deps.recordSite(site,{status:!repaired.deferred&&exhausted?'needs_attention':'pending',reason:repaired.reason});
     await deps.recordVenue(venue,repaired.deferred?null:repaired.reason);return;
    }
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
 async function worker(){while(cursor<queue.length && now()<deadline-90000){const venue=queue[cursor++];await processVenue(venue);}}
 const workers=await Promise.allSettled(Array.from({length:Math.min(4,queue.length)},()=>worker()));
 const failed=workers.find(w=>w.status==='rejected');if(failed)throw failed.reason;
 return {sites,searches:counters.searches};
}
export async function main(env=process.env,{runId}={}) {
 let run=runId?await readRun(runId):null;
 if(runId && (!run || run.status!=='queued'))throw new Error('Run is missing or already started');
 const limits=executionLimits(env,run);
 if(!limits.enabled){console.log('Crawl loop disabled. Set CRAWL_LOOP_ENABLED=true to start.');return;}
 const spend={usd:0};
 const gate=createHostGate();
 const fetchPage=createFetcher({conditional:false,gate});
 const model=createModel({spend,budgetUsd:limits.budgetUsd,siteBudgetUsd:limits.siteBudgetUsd});
 const lookupWebsite=async id=>{
  if(!/^Q[1-9][0-9]*$/.test(id))return null;
  const page=await fetchPage(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  try{return JSON.parse(page.html).entities[id].claims.P856?.find(c=>typeof c.mainsnak?.datavalue?.value==='string')?.mainsnak.datavalue.value??null;}catch{return null;}
 };
 const search=async query=>{const page=await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);return page.status==='ok'?searchCandidates(page.html):[];};
 if(run)await startRun(run.id);
 else run=await createRun({pipeline:'discover',venueIds:[],method:'rules',branch:env.GITHUB_REF_NAME,commitSha:env.GITHUB_SHA,budgetUsd:limits.budgetUsd});
 if(env.GITHUB_ENV)await appendFile(env.GITHUB_ENV,`CRAWL_RUN_ID=${run.id}\n`);
 const checkpoint=async summary=>finishRun(run.id,{status:'running',summary,costUsd:spend.usd});
 try {
  const result=await runLoop({limits,deps:{work:async count=>{const rows=runId?await store.selectedWork(run.venue_ids):await store.work(count);if(!runId)await store.setRunVenues(run.id,rows.map(v=>v.id));return rows;},loadSite:store.loadWorkSite,model,manual:Boolean(runId),claim:(id,owner)=>store.claim(id,run.id,owner),release:store.release,
   hasStructured:async site=>{const page=await fetchPage(site.whats_on_url);return page.status==='ok'&&checkFindings(page.html,structuredReader({url:site.whats_on_url,html:page.html},{venues:site.venues})??[]).some(f=>f.start_date);},
   discover:args=>discoverLinks({...args,fetchPage,lookupWebsite,search}),saveLinks:store.saveLinks,recordSite:store.recordSite,recordVenue:store.recordVenue,
   activatePrepared:(site,result)=>store.adoptVersion(site,result.ruleId,result.validation),
   writeRules:async args=>writeRules({...args,fetchPage,proposed:await store.proposed(args.site),saveVersion:(rules,author,check)=>store.saveVersion(args.site,rules,author,check),activate:(id,check)=>store.activate(args.site,id,check)}),
   crawl:(site,options)=>{const cache=Object.fromEntries((site.pages??[]).filter(p=>p.status==='ok'&&p.rule_id===site.rule_id).map(p=>[p.url,{etag:p.etag,lastModified:p.last_modified}]));return crawlPersistentSite({site,venues:site.venues,run,spend,readers:[rulesReader,structuredReader],fetchPage:createFetcher({cache,gate}),store:{page:savePage,site:saveSite},load:(url,findings)=>loadSite(run.id,url,findings),publish:()=>publish(run.id),...options});},checkpoint}});
  const progress=await store.progress();
  await finishRun(run.id,{status:'done',summary:{...result,progress,findings:result.sites.reduce((n,s)=>n+(s.findings??0),0)},costUsd:spend.usd});
  const report=`# Crawl loop\n\n${result.sites.length} sites, ${result.searches} searches, $${spend.usd.toFixed(4)}.\n\n${Object.entries(progress).map(([key,value])=>`- ${key}: ${value}`).join('\n')}\n\n${result.sites.map(s=>`- ${s.venue_id}: ${s.status}${s.reason?` (${s.reason})`:''}`).join('\n')}\n`;
  console.log(report);if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,report);
 } catch(error){await finishRun(run.id,{status:'failed',summary:{...(await readRun(run.id))?.summary,error:'Loop interrupted'},costUsd:spend.usd});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Crawl loop failed; see saved run for progress.');process.exitCode=1;});
