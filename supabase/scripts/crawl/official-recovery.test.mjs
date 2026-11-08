// Official-theatre crawler recovery (ported from #417 onto the staged crawler, #419).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {createFetcher,sameHost} from './fetch.mjs';
import {canonicalTaskUrl} from './frontier-url.mjs';
import {discoverLinks,searchCandidates} from './discover.mjs';
import {parseDates} from './dates.mjs';
import {checkRules,writeRules} from './write-rules.mjs';
import {runLoop,loopOutcome} from './loop.mjs';

const fixture=readFileSync(new URL('./fixtures/almeida-archive.html',import.meta.url),'utf8');
const rules=JSON.parse(readFileSync(new URL('./almeida-rules.json',import.meta.url)));
const venues=[{id:'v',name:'Almeida Theatre'}];

// ---- 1. same-site canonical redirects ------------------------------------
const answer=(url,body,status=200)=>Object.defineProperty(
 new Response(body,{status,headers:{'content-type':'text/html'}}),'url',{value:url});
const fetchVia=finalUrl=>createFetcher({
 minDelayMs:0,sleep:async()=>{},
 fetchFn:async url=>url.endsWith('/robots.txt')?answer(url,'',404):answer(finalUrl,'<h1>Hi</h1>'),
});

test('example.com and www.example.com are one site; any other host change still fails',async()=>{
 const same=await fetchVia('https://www.a.test/whats-on')('https://a.test/whats-on');
 assert.equal(same.status,'ok');assert.equal(same.url,'https://www.a.test/whats-on');
 const back=await fetchVia('https://a.test/whats-on')('https://www.a.test/whats-on');
 assert.equal(back.status,'ok');
 const other=await fetchVia('https://b.test/whats-on')('https://a.test/whats-on');
 assert.deepEqual(other,{status:'failed',error:'Redirected to another site'});
 const lookalike=await fetchVia('https://www.a.test.evil.test/')('https://a.test/whats-on');
 assert.equal(lookalike.status,'failed');
 assert.equal(sameHost('A.test','www.a.TEST'),true);assert.equal(sameHost('a.test','sub.a.test'),false);
});

test('the staged fetcher allows exactly the www pair',()=>{
 const hosts=['a.test','www.a.test'];
 assert.ok(canonicalTaskUrl('https://www.a.test/whats-on',{allowedHosts:hosts}));
 assert.ok(canonicalTaskUrl('https://a.test/whats-on',{allowedHosts:hosts}));
 assert.equal(canonicalTaskUrl('https://b.test/whats-on',{allowedHosts:hosts}),null);
 assert.equal(canonicalTaskUrl('https://a.test.evil.test/',{allowedHosts:hosts}),null);
});

// ---- 2. discovery ---------------------------------------------------------
const home='<h1>Almeida Theatre</h1><a href="whats-on/">What’s on</a><a href="archive/">Past productions</a>';
const wrap=(href,cls='')=>`<div class="result ${cls}"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(href)}">r</a></div>`;
const model=async()=>({value:{whats_on_url:'https://www.almeida.test/theatre/whats-on/',archive_url:'https://www.almeida.test/theatre/archive/'}});
const limits=()=>({searches:0,maxSearches:2});
const args=()=>({model,lookupWebsite:async()=>null,limits:limits()});

test('search drops ads and duplicate hosts before applying the cap',()=>{
 const html=[
  wrap('https://ad1.test/','result--ad'),wrap('https://ad2.test/','result--sponsored'),
  wrap('https://a.test/'),wrap('https://www.a.test/other'),wrap('https://b.test/'),
  wrap('https://c.test/'),wrap('https://d.test/'),wrap('https://e.test/'),wrap('https://f.test/'),
 ].join('');
 assert.deepEqual(searchCandidates(html),['https://a.test/','https://b.test/','https://c.test/','https://d.test/','https://e.test/']);
});

test('links resolve against the page a redirect ended on',async()=>{
 const venue={id:'v',name:'Almeida Theatre',website:'https://almeida.test/',website_source:'wikidata'};
 const fetchPage=async url=>url==='https://almeida.test/'
  ?{status:'ok',url:'https://www.almeida.test/theatre/',html:home}
  :{status:'ok',url,html:home};
 const found=await discoverLinks({venue,fetchPage,search:async()=>[],...args()});
 assert.equal(found.whats_on_url,'https://www.almeida.test/theatre/whats-on/');
 assert.equal(found.website,'https://www.almeida.test/theatre/');
});

test('an unreachable saved website may be replaced by a search result; a manual one never is',async()=>{
 const fetchPage=async url=>url==='https://dead.test/'?{status:'failed',error:'Could not fetch the page'}:{status:'ok',url,html:home};
 let searched=0;
 const search=async()=>{searched++;return['https://almeida.test/'];};
 const saved={id:'v',name:'Almeida Theatre',website:'https://dead.test/',website_source:'wikidata'};
 const local={...args(),model:async()=>({value:{whats_on_url:'https://almeida.test/whats-on/',archive_url:null}})};
 const replaced=await discoverLinks({venue:saved,fetchPage,search,...local});
 assert.equal(replaced.website_source,'search');assert.equal(searched,1);
 const manual=await discoverLinks({venue:{...saved,website_source:'manual'},fetchPage,search,...local});
 assert.equal(manual.failed,true);assert.equal(manual.reason,'homepage_not_verified');assert.equal(searched,1);
});

test('a blocked or rate-limited saved website is deferred, never worked around by search',async()=>{
 let searched=0;
 const venue={id:'v',name:'Almeida Theatre',website:'https://almeida.test/',website_source:'wikidata'};
 for(const status of ['blocked','rate_limited']){
  const result=await discoverLinks({venue,fetchPage:async()=>({status,error:'The site answered 403'}),search:async()=>{searched++;return[];},...args()});
  assert.equal(result.deferred,true);
 }
 assert.equal(searched,0);
});

test('a replacement search is bounded by the search limit',async()=>{
 const venue={id:'v',name:'Almeida Theatre',website:'https://dead.test/',website_source:'search'};
 const result=await discoverLinks({venue,fetchPage:async()=>({status:'failed'}),search:async()=>[],model,lookupWebsite:async()=>null,limits:{searches:2,maxSearches:2}});
 assert.deepEqual(result,{deferred:true,reason:'search_limit'});
});

// ---- 3. dates ---------------------------------------------------------------
test('date labels, Month D YYYY, Opened and New Year ranges',()=>{
 const cases=[
  ['Dates: 12 - 20 Mar 2027','2027-03-12','2027-03-20'],
  ['Date: Tue 14 May 2024','2024-05-14','2024-05-14'],
  ['Oct 24, 2024 - Feb 16, 2025','2024-10-24','2025-02-16'],
  ['Opened Apr 26, 2025','2025-04-26',null],
  ['13 Nov - 10 Jan 2027','2026-11-13','2027-01-10'],
  ['13 Nov 2026 - 10 Jan','2026-11-13','2027-01-10'],
 ];
 for(const [text,start,end] of cases) assert.deepEqual(parseDates(text),{start_date:start,end_date:end,date_text:text},text);
 // Unknown formats and ranges without a year keep their text and never use today's date.
 for(const text of ['From Oct 2024','30 Dec - 2 Jan','Coming soon','31 Feb 2024','20 Jul - 11 Jun 2024'])
  assert.deepEqual(parseDates(text),{start_date:null,end_date:null,date_text:text},text);
});

// ---- 4. rule validation -----------------------------------------------------
const oneShow=(dateText)=>{
 const $=load(fixture);const first=$(rules.item).first();
 if(dateText!==undefined)first.find(rules.dates).first().text(dateText);
 return `<main>${$.html(first)}</main>`;
};

test('rules may be accepted for one show only when its date was read',()=>{
 const ok=checkRules({rules,html:oneShow(),url:'https://almeida.test/',venues});
 assert.equal(ok.ok,true);assert.equal(ok.count,1);
 const undated=checkRules({rules,html:oneShow('Autumn'),url:'https://almeida.test/',venues});
 assert.deepEqual([undated.ok,undated.reason],[false,'too_few_shows']);
 assert.equal(checkRules({rules:{...rules,item:'.missing'},html:fixture,url:'https://almeida.test/',venues}).reason,'too_few_shows');
});

test('the next rule attempt is told why the previous one failed, within the existing model calls',async()=>{
 const html=`<main>${'<p>padding </p>'.repeat(30)}<ul><li><h2>Nothing</h2></li></ul></main>`;
 const payloads=[],models=[];
 const result=await writeRules({
  site:{id:'s',whats_on_url:'https://almeida.test/whats-on'},venues,fetchPage:async()=>({status:'ok',html}),
  model:async request=>{models.push(request.model);payloads.push(request.payload.previous_validation_failure);return{value:rules};},
  saveVersion:async()=>'rule',activate:async()=>{},
 });
 assert.equal(result.failed,true);assert.equal(result.reason,'rules_failed_validation');
 assert.deepEqual(models,['claude-haiku-5-5','claude-sonnet-5-5']);
 assert.equal(payloads[0],undefined);assert.equal(payloads[1],'too_few_shows');
 assert.equal(result.detail,'too_few_shows');
});

// ---- 5. failure reporting ---------------------------------------------------
test('a run where every attempted theatre failed is a failed run',()=>{
 assert.deepEqual(loopOutcome([{status:'needs_attention'},{status:'failed',findings:0}]),{findings:0,allFailed:true});
 assert.equal(loopOutcome([{status:'needs_attention'},{status:'done',findings:3}]).allFailed,false);
 assert.equal(loopOutcome([{status:'deferred'},{status:'needs_attention'}]).allFailed,false);
 assert.equal(loopOutcome([{status:'blocked'}]).allFailed,false);
 assert.deepEqual(loopOutcome([]),{findings:0,allFailed:false});
});

test('theatre names, reasons and sanitised decisions are recorded for the run summary',async()=>{
 const venue={id:'v1',name:'Almeida Theatre',website:'https://almeida.test/',website_source:'manual'};
 const checkpoints=[];
 const result=await runLoop({
  limits:{enabled:true,maxSites:5,maxSearches:1,maxPages:5,maxMs:600000},
  deps:{
   work:async()=>[venue],loadSite:async()=>null,claim:async()=>true,release:async()=>{},
   model:async()=>({value:null}),recordVenue:async()=>{},recordSite:async()=>{},saveLinks:async()=>{},
   checkpoint:async summary=>{checkpoints.push(summary);},
   discover:async({audit})=>{
    audit('Crawler','Checked saved homepage',['https://almeida.test/whats-on?token=secret#frag','mailto:a@b.test','not a url'],'ok');
    return {failed:true,reason:'homepage_not_verified',detail:'Could not fetch the page'};
   },
  },
 });
 const [site]=result.sites;
 assert.equal(site.venue_name,'Almeida Theatre');assert.equal(site.status,'needs_attention');
 assert.equal(site.reason,'homepage_not_verified');assert.equal(site.detail,'Could not fetch the page');
 assert.deepEqual(site.decisions[0].urls,['https://almeida.test/whats-on']);
 assert.ok(!JSON.stringify(site.decisions).includes('secret'));
 assert.equal(loopOutcome(result.sites).allFailed,true);
 assert.ok(checkpoints.length>0);
});
