import { Suspense } from "react";
import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { CrawlAction } from "@/components/app/admin/CrawlAction";
import { BackLink } from "@/components/ui/BackLink";
import { ownerContext } from "@/lib/supabase/data";
async function Sites() {
  const {supabase}=await ownerContext();
  const {data,error}=await supabase.from("crawl_sites").select("id, whats_on_url, archive_url, archive_status, health").order("updated_at",{ascending:false}).limit(100);
  if(error) return <p>Couldn’t load sites.</p>;
  return <ul className="flex flex-col gap-4">{(data??[]).map(s=><li key={s.id} className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-4"><a href={s.whats_on_url} className="break-all text-tint-text">{s.whats_on_url}</a><p>Archive: {s.archive_status}</p><p className="text-footnote text-label-secondary">{Array.isArray(s.health)&&s.health.length?`Needs attention: ${s.health.join(', ')}`:'No health problems recorded'}</p><CrawlAction id={s.id} action="redo" /></li>)}</ul>;
}
export default function CrawlSitesPage(){return <section className="flex flex-col gap-4"><BackLink href="/app/backstage/crawl">Crawl runs</BackLink><h1 className="text-title font-display">Crawl sites</h1><Suspense fallback={<p>Loading…</p>}><AdminOnly><Sites/></AdminOnly></Suspense></section>;}
