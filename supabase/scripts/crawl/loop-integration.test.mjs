import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runPsql} from './db.mjs';
import * as store from './loop-store.mjs';
import {createRun,finishRun,loadSite} from './load.mjs';
import {savePage,saveSite,publish} from './site-store.mjs';
import {discoverLinks} from './discover.mjs';
import {writeRules} from './write-rules.mjs';
import {crawlPersistentSite} from './persistent.mjs';
import {rulesReader} from './rules.mjs';
import {structuredReader} from './sources/theatre-site.mjs';
import {runLoop,loopLimits} from './loop.mjs';
test('local database loop discovers, publishes, repairs and rereads without AI or duplicates',{skip:!process.env.CRAWL_INTEGRATION_DB_URL},async()=>{
 const previous=process.env.SUPABASE_DB_URL;process.env.SUPABASE_DB_URL=process.env.CRAWL_INTEGRATION_DB_URL;
 const id=randomUUID(),runIds=[],origin=`https://fixture-${id}.test`;
 const html=readFileSync(new URL('./fixtures/almeida-archive.html',import.meta.url),'utf8');
 const rules=JSON.parse(readFileSync(new URL('./almeida-rules.json',import.meta.url)));
 let moved=false,offline=false;
 const home=()=>`<h1>Fixture Theatre</h1><a href="/${moved?'moved':'current'}">What's on</a><a href="/archive">Archive</a>`;
 const fetchPage=async url=>moved&&url===`${origin}/current`?{status:'failed'}:{status:'ok',html:url===`${origin}/`?home():(moved?html.replaceAll('class="c-event-card"','class="event-renamed"'):html)};
 const model=async args=>{if(offline)throw new Error('Routine crawl must not call AI');return {value:args.schema.required.includes('whats_on_url')?{whats_on_url:`${origin}/${moved?'moved':'current'}`,archive_url:`${origin}/archive`}:(moved?{...rules,item:'.event-renamed'}:rules)};};
 await runPsql(`insert into public.venues(id,name,website,website_source) values('${id}','Fixture Theatre','${origin}/','manual');`);
 try{
  for(let pass=0;pass<3;pass++){
   const [venue]=await runPsql(`select to_jsonb(v) from public.venues v where id='${id}'`);
   if(pass===1)moved=true;
   offline=pass===2;
   const run=await createRun({venueIds:[id],method:'rules',budgetUsd:1});runIds.push(run.id);
   await store.setRunVenues(run.id,[id]);
   assert.equal((await store.selectedWork([id]))[0].id,id,'manual selection includes theatres before discovery');
   const result=await runLoop({limits:loopLimits({CRAWL_LOOP_ENABLED:'true'}),deps:{work:async()=>[venue],loadSite:store.loadWorkSite,model,claim:(siteId,owner)=>store.claim(siteId,run.id,owner),release:store.release,saveLinks:store.saveLinks,recordSite:store.recordSite,recordVenue:store.recordVenue,
    discover:args=>discoverLinks({...args,fetchPage,lookupWebsite:async()=>null,search:async()=>[]}),
    writeRules:async args=>writeRules({...args,fetchPage,proposed:await store.proposed(args.site),saveVersion:(r,a,c)=>store.saveVersion(args.site,r,a,c),activate:(r,c)=>store.activate(args.site,r,c)}),
    activatePrepared:(s,r)=>store.adoptVersion(s,r.ruleId,r.validation),
    crawl:(site,opts)=>crawlPersistentSite({site,venues:site.venues,run,spend:{usd:0},readers:[rulesReader,structuredReader],fetchPage,store:{page:savePage,site:saveSite},load:(url,findings)=>loadSite(run.id,url,findings),publish:()=>publish(run.id),...opts})}});
   assert.equal(result.sites[0].status,'done',JSON.stringify(result));
   if(offline)assert.equal(result.sites[0].findings,0);
   await finishRun(run.id,{status:'done',summary:result});
  }
  const [count]=await runPsql(`select to_jsonb(count(*)) from public.runs where venue_id='${id}'`);assert.equal(count,5);
  const [venue]=await runPsql(`select to_jsonb(v) from public.venues v where id='${id}'`);assert.equal(venue.whats_on_url,`${origin}/moved`);assert.equal(venue.website,`${origin}/`);
  const [active]=await runPsql(`select to_jsonb(count(*)) from public.crawl_rules r join public.crawl_sites s on s.id=r.site_id where s.whats_on_url like '${origin}/%' and r.status='active'`);assert.equal(active,1);
  assert.ok((await store.progress()).runs>=5);
  const owners=[randomUUID(),randomUUID()];
  const claims=await Promise.all(owners.map(owner=>store.claim(venue.crawl_site_id,runIds.at(-1),owner)));
  assert.equal(claims.filter(Boolean).length,1,'simultaneous database claims have exactly one winner');
  const winner=owners[claims.findIndex(Boolean)];
  await store.release(venue.crawl_site_id,owners[claims.findIndex(ok=>!ok)]);
  assert.equal(await store.claim(venue.crawl_site_id,runIds.at(-1),randomUUID()),false,'other workers cannot release the winner');
  await store.release(venue.crawl_site_id,winner);

 }finally{
  await runPsql(`delete from public.venues where id='${id}';delete from public.crawl_runs where id=any(array[${runIds.map(r=>`'${r}'::uuid`).join(',')}]);delete from public.crawl_sites where whats_on_url like '${origin}/%';`);
  if(previous===undefined)delete process.env.SUPABASE_DB_URL;else process.env.SUPABASE_DB_URL=previous;
 }
});
