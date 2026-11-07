import {runPsql} from './db.mjs';
import {jsonLiteral,uuidLiteral,readVenues} from './load.mjs';
import {readSite} from './site-store.mjs';
export async function work(limit,db=runPsql){const [rows]=await db(`select public.crawl_work(${Math.max(0,Math.min(100,Number(limit)||0))})`);return rows;}
export async function loadWorkSite(venue,db=runPsql){const [site]=await readSite([venue.id],db);if(!site)return null;const [ids]=await db(`select coalesce(jsonb_agg(id),'[]'::jsonb) from public.venues where crawl_site_id=${uuidLiteral(site.id)}`);return {...site,venues:await readVenues(ids,db)};}
export async function saveLinks(venue,links,db=runPsql){
 await db(`begin;
 update public.venues v set website=case when v.website_source='manual' then v.website else j->>'website' end,
 website_source=case when v.website_source='manual' then v.website_source else j->>'website_source' end,
 whats_on_url=case when v.whats_on_source='manual' then v.whats_on_url else j->>'whats_on_url' end,
 whats_on_source=case when v.whats_on_source='manual' then v.whats_on_source else j->>'whats_on_source' end,
 crawl_error=null from(select ${jsonLiteral(links)} j)x where v.id=${uuidLiteral(venue.id)} or (${links.repair ? 'true':'false'} and v.crawl_site_id=${venue.crawl_site_id ? uuidLiteral(venue.crawl_site_id):'null::uuid'} and v.whats_on_source is distinct from 'manual');
 update public.crawl_sites s set website_url=j->>'website',link_source=j->>'whats_on_source',archive_url=case when s.archive_source='manual' then s.archive_url else coalesce(j->>'archive_url',s.archive_url) end,archive_source=case when s.archive_source='manual' then 'manual' when j->>'archive_url' is not null then 'discovered' else s.archive_source end,archive_status=case when s.archive_source is distinct from 'manual' and j->>'archive_url' is distinct from s.archive_url and j->>'archive_url' is not null then 'not_started' else s.archive_status end
 from(select ${jsonLiteral(links)} j)x where s.id=(select crawl_site_id from public.venues where id=${uuidLiteral(venue.id)});
 commit;`);
}
export async function recordVenue(venue,error=null,db=runPsql){await db(`update public.venues set crawl_attempt_at=now(),crawl_error=j->>'error',crawl_attempts=case when j->>'error' is null then 0 else crawl_attempts+1 end from(select ${jsonLiteral({error})} j)x where id=${uuidLiteral(venue.id)}`);}
export async function recordSite(site,{status,reason=null,attempt=false,crawled=false},db=runPsql){await db(`update public.crawl_sites set status=j->>'status',reason=j->>'reason',repair_attempts=case when (j->>'attempt')::boolean then repair_attempts+1 when j->>'status'='ready' then 0 else repair_attempts end,last_crawled_at=case when (j->>'crawled')::boolean then now() else last_crawled_at end,updated_at=now() from(select ${jsonLiteral({status,reason,attempt,crawled})} j)x where id=${uuidLiteral(site.id)}`);}
export async function saveVersion(site,rules,author,validation,db=runPsql){const [id]=await db(`insert into public.crawl_rules(site_id,rules,author,validation) values(${uuidLiteral(site.id)},${jsonLiteral(rules)},${jsonLiteral(author)}#>>'{}',${jsonLiteral(validation)}) returning to_jsonb(id)`);return id;}
export async function activate(site,id,validation,db=runPsql){if(!validation.ok)throw new Error('Unchecked rules');await db(`begin;select to_jsonb(id) from public.crawl_sites where id=${uuidLiteral(site.id)} for update;update public.crawl_rules set status='retired' where site_id=${uuidLiteral(site.id)} and status='active';update public.crawl_rules set status='active',validation=${jsonLiteral(validation)} where id=${uuidLiteral(id)} and site_id=${uuidLiteral(site.id)};update public.crawl_pages set etag=null,last_modified=null where site_id=${uuidLiteral(site.id)};update public.crawl_sites set archive_status='not_started' where id=${uuidLiteral(site.id)};commit;`);}
export async function proposed(site,db=runPsql){const [row]=await db(`select coalesce((select to_jsonb(r) from public.crawl_rules r where site_id=${uuidLiteral(site.id)} and status='proposed' and (author not like 'claude-%' or validation->>'restore_requested'='true') order by created_at desc limit 1),'null'::jsonb)`);return row;}
export async function progress(db=runPsql){const [p]=await db(`select jsonb_build_object(
 'theatres',(select count(*) from public.venues),
 'website',(select count(*) from public.venues where website is not null),
 'link',(select count(*) from public.venues where whats_on_url is not null),
 'rules',(select count(*) from public.venues v where exists(select 1 from public.crawl_rules r where r.site_id=v.crawl_site_id and r.status='active')),
 'history_done',(select count(*) from public.venues v join public.crawl_sites s on s.id=v.crawl_site_id where s.archive_status='done'),
 'needs_attention',(select count(*) from public.venues v left join public.crawl_sites s on s.id=v.crawl_site_id where s.status='needs_attention' or v.crawl_error is not null),
 'runs',(select count(*) from public.runs),
 'spend_usd',(select coalesce(sum(cost_usd),0) from public.crawl_runs))`);return p;}
export async function setRunVenues(id,ids,db=runPsql){await db(`update public.crawl_runs set venue_ids=array(select jsonb_array_elements_text(${jsonLiteral(ids)}))::uuid[],log_url=${jsonLiteral(process.env.GITHUB_RUN_ID?`https://github.com/felixng/stubbed/actions/runs/${process.env.GITHUB_RUN_ID}`:null)}#>>'{}' where id=${uuidLiteral(id)}`);}

export async function adoptVersion(site,id,validation,db=runPsql){
 if(!validation?.ok)throw new Error('Unchecked replacement');
 await db(`begin;
 select to_jsonb(id) from public.crawl_sites where id=${uuidLiteral(site.id)} for update;
 update public.crawl_rules set status='retired' where status='active' and (site_id=${uuidLiteral(site.id)} or site_id=(select site_id from public.crawl_rules where id=${uuidLiteral(id)}));
 update public.crawl_rules set site_id=${uuidLiteral(site.id)},status='active',validation=${jsonLiteral(validation)} where id=${uuidLiteral(id)} and status='proposed';
 update public.crawl_pages set etag=null,last_modified=null where site_id=${uuidLiteral(site.id)};
 update public.crawl_sites set archive_status='not_started' where id=${uuidLiteral(site.id)};
 commit;`);
}

export async function selectedWork(ids,db=runPsql){
 const [rows]=await db(`select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]'::jsonb) from (
 select distinct on(coalesce(v.crawl_site_id,v.id)) v.*,array_position(array(select jsonb_array_elements_text(${jsonLiteral(ids)}))::uuid[],v.id) as position
 from public.venues v where v.id=any(array(select jsonb_array_elements_text(${jsonLiteral(ids)}))::uuid[])
 order by coalesce(v.crawl_site_id,v.id),position) x`);
 return rows;
}
export async function claim(siteId,runId,owner,db=runPsql){const [ok]=await db(`select to_jsonb(public.claim_crawl_site(${uuidLiteral(siteId)},${uuidLiteral(runId)},${uuidLiteral(owner)}))`);return ok;}
export async function release(siteId,owner,db=runPsql){await db(`select to_jsonb(public.release_crawl_site(${uuidLiteral(siteId)},${uuidLiteral(owner)}))`);}

export async function reserveSpend(run,site,amount,limit,db=runPsql){
 const [id]=await db(`select coalesce(to_jsonb(public.reserve_crawl_ai_spend(${uuidLiteral(run)}, ${jsonLiteral(site)}#>>'{}', ${Number(amount)}, ${Number(limit)})), 'null'::jsonb)`);
 return id;
}
export async function settleSpend(id,amount,db=runPsql){
 await db(`select public.settle_crawl_ai_spend(${uuidLiteral(id)}, ${Number(amount)})`);
}
export async function reserveRepair(site,version,db=runPsql){
 const [allowed]=await db(`select to_jsonb(public.reserve_crawl_repair(${uuidLiteral(site)}, ${jsonLiteral(version)}#>>'{}'))`);
 return allowed;
}
