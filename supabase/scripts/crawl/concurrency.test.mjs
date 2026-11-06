import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runLoop,loopLimits,executionLimits} from './loop.mjs';
import {createModel} from './model.mjs';
import {createHostGate} from './fetch.mjs';
const limits={...loopLimits({CRAWL_LOOP_ENABLED:'true'}),maxMs:600000};
test('four workers stay bounded, replenish free slots, isolate failures and await all work',async()=>{
 let active=0,max=0,started=0;let unblock;const firstWave=new Promise(r=>{unblock=r;});
 const checkpoints=[];
 const result=await runLoop({limits,deps:{
  work:async()=>Array.from({length:9},(_,i)=>({id:String(i)})),
  loadSite:async v=>({id:v.id,rules:{},pages:[]}),
  crawl:async s=>{active++;started++;max=Math.max(max,active);if(started===4)unblock();await firstWave;await new Promise(r=>setTimeout(r,2));active--;if(s.id==='2')throw new Error('broken');return {status:'ok',findings:1};},
  recordSite:async()=>{},recordVenue:async()=>{},checkpoint:async s=>{checkpoints.push(s);await new Promise(r=>setTimeout(r,1));}
 }});
 assert.equal(max,4);assert.equal(active,0);assert.equal(started,9);assert.equal(result.sites.filter(s=>s.status==='done').length,8);assert.equal(result.sites[2].status,'failed');assert.equal(checkpoints.at(-1).findings,8);
});
test('shared known sites are deduplicated and denied claims do not change their state',async()=>{
 let crawls=0,releases=0;
 const result=await runLoop({limits,deps:{work:async()=>[{id:'a',crawl_site_id:'shared'},{id:'b',crawl_site_id:'shared'},{id:'c',crawl_site_id:'busy'}],loadSite:async v=>({id:v.crawl_site_id,rules:{},pages:[]}),claim:async id=>id!=='busy',release:async()=>{releases++;},crawl:async()=>{crawls++;return {status:'ok',findings:1};},recordVenue:async()=>{},recordSite:async()=>{}}});
 assert.equal(result.sites.length,2);assert.equal(crawls,1);assert.equal(releases,1);assert.equal(result.sites[1].reason,'site_busy');
});
test('concurrent model calls reserve one shared run budget before requests start',async()=>{
 const spend={usd:0};let calls=0,release;
 const gate=new Promise(r=>{release=r;});
 const model=createModel({apiKey:'test',spend,budgetUsd:0.004,fetchFn:async()=>{calls++;await gate;return Response.json({content:[{type:'text',text:'{}'}],usage:{input_tokens:100,output_tokens:100}});}});
 const pending=Array.from({length:8},(_,i)=>model({siteId:String(i),system:'Return JSON',payload:{},schema:{type:'object'}}));
 assert.equal(calls,2);assert.ok(spend.usd<=0.004);release();
 const result=await Promise.all(pending);assert.equal(result.filter(r=>r.reason==='budget_limit').length,6);assert.ok(spend.usd<=0.004);
});
test('per-host request gate serialises workers and preserves the minimum gap',async()=>{
 let now=0,active=0,max=0;const starts=[];
 const gate=createHostGate({now:()=>now,sleep:async ms=>{now+=ms;}});
 await Promise.all(Array.from({length:4},()=>gate('theatre.test',2000,async()=>{active++;max=Math.max(max,active);starts.push(now);await new Promise(r=>setTimeout(r,1));active--;return 'ok';})));
 assert.equal(max,1);assert.deepEqual(starts,[0,2000,4000,6000]);
});
test('manual discovery uses its saved selection and budget even when the schedule is off',()=>{
 const result=executionLimits({CRAWL_LOOP_ENABLED:'false'},{venue_ids:['a','b'],budget_usd:'0.75'});
 assert.equal(result.enabled,true);assert.equal(result.maxSites,2);assert.equal(result.budgetUsd,0.75);assert.equal(executionLimits({}).enabled,false);
});
test('repair that converges on a busy site leaves its status and rules alone',async()=>{
 let moved=false,updates=0;
 const result=await runLoop({limits,deps:{work:async()=>[{id:'v'}],loadSite:async()=>({id:moved?'new':'old',rules:{},venues:[],pages:[]}),claim:async id=>id==='old',release:async()=>{},crawl:async()=>({status:'failed',note:'link_failed'}),discover:async()=>({whats_on_url:'https://new.test'}),writeRules:async()=>({ok:true}),saveLinks:async()=>{moved=true;},recordSite:async()=>{updates++;},recordVenue:async()=>{}}});
 assert.equal(result.sites[0].reason,'site_busy');assert.equal(updates,0);
});
