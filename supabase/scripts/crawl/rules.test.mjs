import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDates} from './dates.mjs';
import {readRules,checkFindings,validateRules,rulesReader} from './rules.mjs';
import {readPage} from './readers.mjs';
import {fingerprint,healthSignals,archiveQueue} from './state.mjs';
import {crawlPersistentSite} from './persistent.mjs';
const fixture=readFileSync(new URL('./fixtures/almeida-archive.html',import.meta.url),'utf8');
const rules=JSON.parse(readFileSync(new URL('./almeida-rules.json',import.meta.url)));
const venues=[{id:'almeida',name:'Almeida'}];
test('all specified Almeida date forms, calendar validation and unknown forms',()=>{
 for(const [text,start,end] of [
 ['Tue 11 Jun - Sat 20 Jul 2024','2024-06-11','2024-07-20'],
 ['Thu 30 Nov 2023 - Sat 27 Jan 2024','2023-11-30','2024-01-27'],
 ['Thu 11 - Sun 14 Jan 2024','2024-01-11','2024-01-14'],
 ['Sun 10 & Sun 17 Mar 2024','2024-03-10','2024-03-17'],
 ['Tue 14 May 2024','2024-05-14','2024-05-14'],
 ['From Oct 2024',null,null],['31 Feb 2024',null,null],['30 Dec - 2 Jan',null,null],['20 Jul - 11 Jun 2024',null,null]]) {
 assert.deepEqual(parseDates(text),{start_date:start,end_date:end,date_text:text});
 }
});
test('real Almeida fixture has the five correct archive titles and dates; changed layout finds nothing',()=>{
 const found=readRules({html:fixture,url:'https://almeida.co.uk/past-productions/'},{rules,venues}).findings;
 assert.deepEqual(found.map(f=>[f.raw_title,f.start_date,f.end_date]),[
 ['The Years','2024-07-27','2024-08-31'],['Alma Mater','2024-06-11','2024-07-20'],['The Comeuppance','2024-04-06','2024-05-18'],['King Lear','2024-02-08','2024-03-30'],['Cold War','2023-11-30','2024-01-27']]);
 assert.equal(checkFindings(fixture,found).length,5);
 assert.equal(readRules({html:'<div>Redesigned</div>',url:'https://almeida.co.uk'},{rules,venues}).findings.length,0);
 assert.equal(validateRules({...rules,script:'eval()'}),false);
 assert.equal(validateRules({...rules,item:'['}),false);
});
test('every reader is page-checked; invented title or date is dropped',async()=>{
 const notes=[];
 const f={raw_title:'Alma Mater',date_text:'Tue 11 Jun - Sat 20 Jul 2024',method:'model'};
 const found=await readPage({html:fixture,url:'u'},{notes},[()=>[f,{...f,raw_title:'Invented show'},{...f,date_text:'12 Jan 1900'}]]);
 assert.equal(found.length,1);assert.equal(found[0].page_checked,true);assert.match(notes[0],/2 findings/);
});
test('fingerprints ignore whitespace, scripts and styles; health signals catch silent failures',()=>{
 assert.equal(fingerprint('<div> A  title </div><script>random=1</script>'),fingerprint('<div>A title</div><script>random=2</script>'));
 const previous={type:'archive',result_count:8,readable_share:1,titles:['one','two','three']};
 const health=healthSignals(previous,[{raw_title:'Book now',kind:'show'},{raw_title:'Book now',kind:'show'}]);
 assert.deepEqual(health.signals,['results_dropped','dates_dropped','junk_titles','known_shows_missing']);
 assert.deepEqual(archiveQueue({archive_url:'a',archive_status:'in_progress'},[{type:'archive',url:'a',status:'ok',next_url:'b'}]),['b']);
 assert.deepEqual(archiveQueue({archive_url:'a',archive_status:'done'},[{url:'a',status:'ok'}],true),['a']);
});
test('archive follows pagination, resumes after a bounded visit, then checks only newest pages',async()=>{
 const site={id:'site',whats_on_url:'https://almeida.test/current',archive_url:'https://almeida.test/archive',archive_status:'not_started',rules,rule_id:'r',pages:[]};
 const calls=[]; let loads=0;let publishes=0;
 const pages=new Map();
 const store={page:async(_,p)=>{pages.set(p.url,p);site.pages=[...pages.values()];},site:async(_,s)=>Object.assign(site,s)};
 const html=fixture+'<a class="next page-numbers" href="/archive2">Next</a>';
 const fetchPage=async url=>{calls.push(url);return {status:'ok',html:url.endsWith('archive')?html:fixture};};
 const args={site,venues,run:{method:'rules'},spend:{usd:0},readers:[rulesReader],fetchPage,store,load:async()=>{loads++;},publish:async()=>{publishes++;}};
 await crawlPersistentSite({...args,maxPages:2}); assert.equal(site.archive_status,'in_progress');
 calls.length=0;await crawlPersistentSite(args); assert.deepEqual(calls,['https://almeida.test/current','https://almeida.test/archive2']);assert.equal(site.archive_status,'done');
 calls.length=0;const before=loads; await crawlPersistentSite(args);
 assert.deepEqual(calls,['https://almeida.test/current','https://almeida.test/archive']);assert.equal(loads,before);assert.equal(publishes,loads);
});
test('failed links and broken rules retain good page data and never publish',async()=>{
 let saved;let loaded=false;
 const args={site:{id:'s',whats_on_url:'https://x.test',archive_status:'done',rules,pages:[]},venues,run:{method:'rules'},spend:{usd:0},readers:[rulesReader],store:{page:async(_,p)=>{saved=p;},site:async()=>{}},load:async()=>{loaded=true;},publish:async()=>{loaded=true;}};
 let result=await crawlPersistentSite({...args,fetchPage:async()=>({status:'blocked'})});
 assert.equal(result.status,'failed');assert.match(result.note,/link_failed/);assert.equal(saved.failures,1);
 result=await crawlPersistentSite({...args,fetchPage:async()=>({status:'ok',html:'<h1>New layout</h1>'})});
 assert.match(result.note,/no_findings/);assert.equal(loaded,false);
});
