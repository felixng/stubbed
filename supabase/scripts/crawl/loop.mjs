#!/usr/bin/env node
import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createFetcher} from './fetch.mjs';
import {createRun,finishRun,loadSite,readRun} from './load.mjs';
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
// Dependency-injected orchestration: deterministic ordering, bounded work,
// isolated failures. No model step is needed to read an existing healthy site.
export async function runLoop({limits,deps,now=Date.now}) {
 if(!limits.enabled) return {disabled:true,sites:[],spend:0};
 const deadline=now()+limits.maxMs,sites=[];
 const work=await deps.work(limits.maxSites);
 const counters={searches:0,maxSearches:limits.maxSearches};
 for(const venue of work.slice(0,limits.maxSites)) {
  if(now()>=deadline-90000) break;
  let site;
  const record={venue_id:venue.id,status:'pending'};sites.push(record);
  try{site=await deps.loadSite(venue);}catch{record.status='failed';record.reason='site_load_failed';await deps.recordVenue(venue,record.reason).catch(()=>{});await deps.checkpoint?.({sites,searches:counters.searches});continue;}
  const budgetKey=site?.id??venue.id;
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
    await deps.activatePrepared?.(site,prepared);site=await deps.loadSite(venue);
    return {ok:true};
   }
   if(!site) {
    const links=await deps.discover({venue,model,limits:counters,repair:false});
    if(links.deferred||links.failed) return links;
    await deps.saveLinks(venue,links);site=await deps.loadSite(venue);
   }
   if(!site) return {failed:true,reason:'site_not_saved'};
   if((!site.rules||repair) && !(!site.rules && await deps.hasStructured?.(site))) {
    const result=await deps.writeRules({site,venues:site.venues,model,knownTitles});
    if(result.deferred||result.failed)return result;
    site=await deps.loadSite(venue);
   }
   return {ok:true};
  }
  try {
   if(site?.status==='needs_attention') {record.status='needs_attention';continue;}
   let ready=await setup();
   if(!ready.ok) {
    record.status=ready.deferred?'deferred':'needs_attention';record.reason=ready.reason;
    if(site)await deps.recordSite(site,{status:ready.deferred?'pending':'needs_attention',reason:ready.reason});
    await deps.recordVenue(venue,ready.deferred?null:ready.reason);continue;
   }
   let result=await deps.crawl(site,{deadline,maxPages:limits.maxPages});
   if(result.status==='failed') {
    if((site.repair_attempts??0)>=3){record.status='needs_attention';record.reason='repair_limit';await deps.recordSite(site,{status:'needs_attention',reason:'repair_limit'});await deps.recordVenue(venue,'repair_limit');continue;}
    if(now()>=deadline-90000){record.status='deferred';record.reason='time_limit';continue;}
    const repaired=await setup(true);
    if(!repaired.deferred) await deps.recordSite(site,{status:'pending',reason:repaired.reason??null,attempt:true});
    if(repaired.ok)result=await deps.crawl(site,{deadline,maxPages:limits.maxPages});
    else {
     record.status=repaired.deferred?'deferred':'needs_attention';record.reason=repaired.reason;
     // Outages/budget exhaustion wait; only exhausted repair attempts need the owner.
     const exhausted=(site.repair_attempts??0)+1>=3;
     await deps.recordSite(site,{status:!repaired.deferred&&exhausted?'needs_attention':'pending',reason:repaired.reason});
     await deps.recordVenue(venue,repaired.deferred?null:repaired.reason);continue;
    }
   }
   record.status=result.status==='failed'?'needs_attention':'done';record.findings=result.findings;record.note=result.note;
   await deps.recordSite(site,{status:result.status==='failed'?'needs_attention':'ready',reason:result.status==='failed'?result.note:null,crawled:result.status!=='failed'});
   await deps.recordVenue(venue,result.status==='failed'?result.note:null);
  } catch {record.status='failed';record.reason='site_operation_failed';await deps.recordVenue(venue,'site_operation_failed').catch(()=>{});}
  finally { await deps.checkpoint?.({sites,searches:counters.searches}); }
 }
 return {sites,searches:counters.searches};
}
export async function main(env=process.env) {
 const limits=loopLimits(env);
 if(!limits.enabled){console.log('Crawl loop disabled. Set CRAWL_LOOP_ENABLED=true to start.');return;}
 const spend={usd:0};let run;
 const fetchPage=createFetcher({conditional:false});
 const model=createModel({spend,budgetUsd:limits.budgetUsd,siteBudgetUsd:limits.siteBudgetUsd});
 const lookupWebsite=async id=>{
  if(!/^Q[1-9][0-9]*$/.test(id))return null;
  const page=await fetchPage(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  try{return JSON.parse(page.html).entities[id].claims.P856?.find(c=>typeof c.mainsnak?.datavalue?.value==='string')?.mainsnak.datavalue.value??null;}catch{return null;}
 };
 const search=async query=>{const page=await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);return page.status==='ok'?searchCandidates(page.html):[];};
 run=await createRun({venueIds:[],method:'rules',branch:env.GITHUB_REF_NAME,commitSha:env.GITHUB_SHA,budgetUsd:limits.budgetUsd});
 if(env.GITHUB_ENV)await appendFile(env.GITHUB_ENV,`CRAWL_RUN_ID=${run.id}\n`);
 const checkpoint=async summary=>finishRun(run.id,{status:'running',summary,costUsd:spend.usd});
 try {
  const result=await runLoop({limits,deps:{work:async count=>{const rows=await store.work(count);await store.setRunVenues(run.id,rows.map(v=>v.id));return rows;},loadSite:store.loadWorkSite,model,
   hasStructured:async site=>{const page=await fetchPage(site.whats_on_url);return page.status==='ok'&&checkFindings(page.html,structuredReader({url:site.whats_on_url,html:page.html},{venues:site.venues})??[]).some(f=>f.start_date);},
   discover:args=>discoverLinks({...args,fetchPage,lookupWebsite,search}),saveLinks:store.saveLinks,recordSite:store.recordSite,recordVenue:store.recordVenue,
   activatePrepared:(site,result)=>store.adoptVersion(site,result.ruleId,result.validation),
   writeRules:async args=>writeRules({...args,fetchPage,proposed:await store.proposed(args.site),saveVersion:(rules,author,check)=>store.saveVersion(args.site,rules,author,check),activate:(id,check)=>store.activate(args.site,id,check)}),
   crawl:(site,options)=>{const cache=Object.fromEntries((site.pages??[]).filter(p=>p.status==='ok'&&p.rule_id===site.rule_id).map(p=>[p.url,{etag:p.etag,lastModified:p.last_modified}]));return crawlPersistentSite({site,venues:site.venues,run,spend,readers:[rulesReader,structuredReader],fetchPage:createFetcher({cache}),store:{page:savePage,site:saveSite},load:(url,findings)=>loadSite(run.id,url,findings),publish:()=>publish(run.id),...options});},checkpoint}});
  const progress=await store.progress();
  await finishRun(run.id,{status:'done',summary:{...result,progress},costUsd:spend.usd});
  const report=`# Crawl loop\n\n${result.sites.length} sites, ${result.searches} searches, $${spend.usd.toFixed(4)}.\n\n${Object.entries(progress).map(([key,value])=>`- ${key}: ${value}`).join('\n')}\n\n${result.sites.map(s=>`- ${s.venue_id}: ${s.status}${s.reason?` (${s.reason})`:''}`).join('\n')}\n`;
  console.log(report);if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,report);
 } catch(error){await finishRun(run.id,{status:'failed',summary:{...(await readRun(run.id))?.summary,error:'Loop interrupted'},costUsd:spend.usd});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Crawl loop failed; see saved run for progress.');process.exitCode=1;});
