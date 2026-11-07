import { readPage } from './readers.mjs';
import { nextArchiveLink, readRules } from './rules.mjs';
import { fingerprint, healthSignals, archiveQueue } from './state.mjs';

// One bounded site visit. Save a page's facts before its cursor, so an
// interruption can retry the page without losing history. Publishing upserts.
export async function crawlPersistentSite({ site, venues, run, spend, readers, fetchPage, store, load, publish, maxPages = 100, bounded = false, deadline = Infinity, now = Date.now }) {
  const pages = new Map((site.pages ?? []).map(p => [p.url,p]));
  const queue = [{url:site.whats_on_url,type:'whats_on'}, ...archiveQueue(site,[...pages.values()]).map(url => ({url,type:'archive'}))];
  const knownTitles = new Set([...pages.values()].flatMap(p=>p.titles??[]));
  const visited = new Set(); const signals = []; let findingsCount=0, fetched=0, unchanged=0;
  let archiveFailed=false, blocked=false, deferred=null;
  const failedVersions = new Set();
  while (queue.length && fetched < maxPages && now() < deadline) {
    const {url,type} = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url); fetched++;
    const previous = pages.get(url);
    const page = await fetchPage(url);
    if (page.status === 'deferred' || page.status === 'rate_limited') {
      queue.unshift({url,type});
      deferred = page.error ?? 'request_deferred';
      break;
    }
    if (page.status === 'blocked') {
      blocked = true;
      signals.push('link_failed');
      if (type === 'archive') archiveFailed = true;
      await store.page(site,{...previous,url,type,status:'blocked',failures:(previous?.failures??0)+1});
      continue;
    }
    if (page.status !== 'ok' && page.status !== 'not_modified') {
      signals.push('link_failed'); if(type==='archive') archiveFailed=true;
      failedVersions.add(`${url}:${page.error ?? 'link_failed'}`);
      await store.page(site,{...previous,url,type,status:'failed',failures:(previous?.failures??0)+1});
      continue;
    }
    const sameRules = (previous?.rule_id ?? null) === (site.rule_id ?? null);
    const hash = page.status === 'ok' ? fingerprint(page.html) : previous?.fingerprint;
    if ((page.status === 'not_modified' || (previous?.status === 'ok' && previous.fingerprint === hash && sameRules)) && previous) {
      unchanged++;
      await store.page(site,{...previous,status:'ok',failures:0});
      if (type==='archive' && site.archive_status !== 'done' && previous.next_url) queue.push({url:previous.next_url,type});
      continue;
    }
    if (page.status === 'not_modified') { signals.push('missing_page_state'); if(type==='archive') archiveFailed=true; continue; }
    const notes=[];
    const findings = await readPage({url,html:page.html},{venues,run,spend,notes,rules:site.rules,ruleId:site.rule_id},readers);
    const health=healthSignals(previous,findings);
    if (site.rules && !findings.length) health.signals.push('no_findings');
    if (notes.some(n=>n.includes('failed the page check'))) health.signals.push('page_check_failed');
    if (health.signals.length) {
      failedVersions.add(`${url}:${hash}`);
      signals.push(...health.signals); if(type==='archive') archiveFailed=true;
      await store.page(site,{...previous,url,type,status:'failed',failures:(previous?.failures??0)+1});
      continue;
    }
    const next=(site.rules ? readRules({url,html:page.html},{rules:site.rules,venues}).next : null) ?? nextArchiveLink(page.html,url);
    await load(url,findings);
    await publish();
    findingsCount+=findings.length;
    const state={url,type,fingerprint:hash,etag:page.etag??null,last_modified:page.lastModified??null,result_count:findings.filter(f=>f.kind==='show').length,failures:0,status:'ok',next_url:next,titles:health.titles,readable_share:health.share,rule_id:site.rule_id??null};
    await store.page(site,state); pages.set(url,state);
    // Once complete, walk beyond the newest archive page only if new shows
    // appeared. Page numbers shift; never treat page 2 as immutable history.
    const newTitles = health.titles.some(t=>!knownTitles.has(t));
    if(type==='archive' && next && (site.archive_status !== 'done' || newTitles)) queue.push({url:next,type});
    for(const title of health.titles) knownTitles.add(title);
  }
  const archivePending=queue.some(p=>p.type==='archive');
  const archive_status = site.archive_url ? (archiveFailed || archivePending ? 'in_progress':'done') : 'done';
  await store.site(site,{archive_status,health:[...new Set(signals)]});
  const limited = deferred || (bounded && queue.length);
  const status = limited && !blocked ? 'deferred' : signals.length ? 'failed' : 'ok';
  return {url:site.whats_on_url,venues,status,repairVersion:fingerprint(JSON.stringify([...failedVersions].sort())),
    reason:blocked?'access_blocked':deferred??(limited?'visit_limit':null),findings:findingsCount,methods:site.rules?['rules']:[],note:`${fetched} pages, ${unchanged} unchanged${signals.length?`; ${[...new Set(signals)].join(', ')}`:''}`};
}
