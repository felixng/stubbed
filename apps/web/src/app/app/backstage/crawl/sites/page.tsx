import { Suspense } from "react";
import Link from "next/link";
import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { CrawlAction } from "@/components/app/admin/CrawlAction";
import { CrawlRuleAction, RetryCrawlSite } from "@/components/app/admin/CrawlRuleAction";
import { BackLink } from "@/components/ui/BackLink";
import { ownerContext } from "@/lib/supabase/data";
async function Sites({searchParams}:Pick<PageProps<"/app/backstage/crawl/sites">,"searchParams">) {
  const attention=(await searchParams).attention==='1';
  const {supabase}=await ownerContext();
  let query=supabase.from("crawl_sites").select("id, whats_on_url, archive_url, archive_status, health, status, reason, repair_attempts").order("updated_at",{ascending:false}).limit(100);
  if(attention)query=query.eq("status","needs_attention");
  const {data,error}=await query;
  if(error) return <p>Couldn’t load sites.</p>;
  const {data:rules}=await supabase.from("crawl_rules").select("id,site_id,author,status,created_at,rules,validation").in("site_id",(data??[]).map(s=>s.id)).order("created_at",{ascending:false});
  return <><nav className="flex gap-4"><Link className="text-tint-text" href="/app/backstage/crawl/sites">All sites</Link><Link className="text-tint-text" href="/app/backstage/crawl/sites?attention=1">Needs attention</Link></nav><ul className="flex flex-col gap-4">{(data??[]).map(s=><li key={s.id} className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-4"><a href={s.whats_on_url} className="break-all text-tint-text">{s.whats_on_url}</a><p>{s.status} · Archive: {s.archive_status}</p>{s.reason&&<p>{s.reason}</p>}<p className="text-footnote text-label-secondary">{Array.isArray(s.health)&&s.health.length?`Health: ${s.health.join(', ')}`:'No health problems recorded'} · {s.repair_attempts} repair attempts</p><CrawlAction id={s.id} action="redo" /><RetryCrawlSite id={s.id}/><details><summary className="min-h-11 cursor-pointer py-2 text-tint-text">Rules and versions</summary>{(rules??[]).filter(r=>r.site_id===s.id).map(r=><article key={r.id} className="flex flex-col gap-2 border-t border-separator py-3"><h3 className="text-headline">{r.status} · {r.author}</h3><p className="text-footnote">{r.created_at}</p><pre className="overflow-x-auto text-footnote">{JSON.stringify(r.rules,null,2)}</pre><CrawlRuleAction id={r.id} status={r.status}/></article>)}</details></li>)}</ul></>;
}
export default function CrawlSitesPage(props:Pick<PageProps<"/app/backstage/crawl/sites">,"searchParams">){return <section className="flex flex-col gap-4"><BackLink href="/app/backstage/crawl">Crawl runs</BackLink><h1 className="text-title font-display">Crawl sites</h1><Suspense fallback={<p>Loading…</p>}><AdminOnly><Sites {...props}/></AdminOnly></Suspense></section>;}
