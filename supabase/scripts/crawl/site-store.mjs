import { runPsql } from './db.mjs';
import { jsonLiteral, uuidLiteral } from './load.mjs';
export async function readSite(venueIds, db = runPsql) {
  const [sites] = await db(`select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('rules',r.rules,'rule_id',r.id,'pages',coalesce(p.pages,'[]'::jsonb))), '[]'::jsonb)
    from public.crawl_sites s
    left join public.crawl_rules r on r.site_id=s.id and r.status='active'
    left join lateral(select jsonb_agg(to_jsonb(p)) pages from public.crawl_pages p where p.site_id=s.id) p on true
    where exists(select 1 from public.venues v where v.crawl_site_id=s.id and v.id=any(array(select jsonb_array_elements_text(${jsonLiteral(venueIds)}))::uuid[]))`);
  return sites;
}
export async function savePage(site, page, db = runPsql) {
  await db(`insert into public.crawl_pages(site_id,url,type,fingerprint,etag,last_modified,last_read,result_count,failures,status,next_url,titles,readable_share,rule_id)
    select ${uuidLiteral(site.id)},j->>'url',j->>'type',j->>'fingerprint',j->>'etag',j->>'last_modified',now(),coalesce((j->>'result_count')::integer,0),coalesce((j->>'failures')::integer,0),j->>'status',j->>'next_url',coalesce(j->'titles','[]'::jsonb),coalesce((j->>'readable_share')::numeric,0),(j->>'rule_id')::uuid
    from (select ${jsonLiteral(page)} j) x
    on conflict(site_id,url) do update set last_read=now(),failures=excluded.failures,status=excluded.status,
      fingerprint=case when excluded.status='ok' then excluded.fingerprint else crawl_pages.fingerprint end,
      etag=case when excluded.status='ok' then excluded.etag else crawl_pages.etag end,
      last_modified=case when excluded.status='ok' then excluded.last_modified else crawl_pages.last_modified end,
      result_count=case when excluded.status='ok' then excluded.result_count else crawl_pages.result_count end,
      next_url=case when excluded.status='ok' then excluded.next_url else crawl_pages.next_url end,
      titles=case when excluded.status='ok' then excluded.titles else crawl_pages.titles end,
      readable_share=case when excluded.status='ok' then excluded.readable_share else crawl_pages.readable_share end,
      rule_id=case when excluded.status='ok' then excluded.rule_id else crawl_pages.rule_id end;`);
}
export async function saveSite(site, { archive_status, health }, db = runPsql) {
  await db(`update public.crawl_sites set archive_status=coalesce(j->>'archive_status',archive_status),health=j->'health',updated_at=now()
    from (select ${jsonLiteral({archive_status,health})} j) x where id=${uuidLiteral(site.id)}`);
}
export async function publish(runId, db = runPsql) {
  const [count] = await db(`select to_jsonb(public.publish_crawl_findings(${uuidLiteral(runId)}))`);
  return count;
}
