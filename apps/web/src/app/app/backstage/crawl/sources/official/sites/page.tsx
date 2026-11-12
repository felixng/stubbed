import type { Metadata } from "next";
import Link from "next/link";

import { CrawlAction } from "@/components/app/admin/CrawlAction";
import { CrawlRuleAction, RetryCrawlSite } from "@/components/app/admin/CrawlRuleAction";
import { CrawlShell, panel } from "@/components/app/admin/CrawlShell";
import { sourcePath } from "@/lib/admin-crawl";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Official sites" };

const chip = "inline-flex min-h-11 items-center rounded-pill bg-fill px-3 text-subheadline font-semibold text-tint-text aria-[current=page]:bg-tint-fill";

async function Sites({ searchParams }: Pick<PageProps<"/app/backstage/crawl/sources/official/sites">, "searchParams">) {
  const attention = (await searchParams).attention === "1";
  const { supabase } = await ownerContext();
  let query = supabase
    .from("crawl_sites")
    .select("id, whats_on_url, archive_url, archive_status, health, status, reason, repair_attempts")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (attention) query = query.eq("status", "needs_attention");
  const { data, error } = await query;
  if (error) return <p>Couldn’t load sites.</p>;
  const sites = data ?? [];
  const { data: rules } = await supabase
    .from("crawl_rules")
    .select("id, site_id, author, status, created_at, rules, validation")
    .in("site_id", sites.map(site => site.id))
    .order("created_at", { ascending: false });

  return (
    <>
      <nav aria-label="Filter sites" className="flex flex-wrap gap-2">
        <Link href="/app/backstage/crawl/sources/official/sites" aria-current={!attention ? "page" : undefined} className={chip}>All sites</Link>
        <Link href="/app/backstage/crawl/sources/official/sites?attention=1" aria-current={attention ? "page" : undefined} className={chip}>Needs attention</Link>
      </nav>
      {sites.length === 0 && <p className="text-subheadline text-label-secondary">{attention ? "Nothing needs you." : "No sites yet."}</p>}
      <ul className="flex flex-col gap-3">
        {sites.map(site => {
          const siteRules = (rules ?? []).filter(rule => rule.site_id === site.id);
          const needs = site.status === "needs_attention";
          const health = Array.isArray(site.health) && site.health.length ? `Problems: ${site.health.join(", ")}` : "No problems recorded";
          return (
            <li key={site.id} className={`flex flex-col gap-2 ${panel}`}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <a href={site.whats_on_url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-subheadline font-semibold text-tint-text">{site.whats_on_url}</a>
                <span className={`rounded-pill bg-fill px-2 py-1 text-footnote font-semibold ${needs ? "text-destructive" : "text-label-secondary"}`}>
                  {needs ? "Needs attention" : site.status.replaceAll("_", " ")}
                </span>
              </div>
              {site.reason && <p className="break-words text-subheadline">{site.reason}</p>}
              <p className="text-footnote text-label-secondary">{health} · {site.repair_attempts} repair attempts · Archive: {site.archive_status.replaceAll("_", " ")}</p>
              {needs && (
                <div className="flex flex-col gap-1">
                  <p className="text-footnote text-label-secondary">Queues this site for the next crawl loop. Existing data stays until it is read again.</p>
                  <RetryCrawlSite id={site.id} />
                </div>
              )}
              {siteRules.length > 0 && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-subheadline text-tint-text">Reading rules ({siteRules.length})</summary>
                  <p className="text-footnote text-label-secondary">
                    The live version is the one reading this site. Retire a version if it reads the page wrongly and the crawler has not repaired it.
                  </p>
                  {siteRules.map(rule => (
                    <article key={rule.id} className="flex flex-col gap-2 border-t border-separator py-3">
                      <h3 className="text-subheadline font-semibold">{rule.status === "active" ? "Live version" : rule.status} · {rule.author}</h3>
                      <p className="text-footnote text-label-secondary">{rule.created_at}</p>
                      <CrawlRuleAction id={rule.id} status={rule.status} />
                      <details>
                        <summary className="min-h-11 cursor-pointer py-2 text-footnote text-label-secondary">Raw rules</summary>
                        <pre className="overflow-x-auto text-footnote">{JSON.stringify(rule.rules, null, 2)}</pre>
                      </details>
                    </article>
                  ))}
                </details>
              )}
              {site.archive_url && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-footnote text-label-secondary">More</summary>
                  <div className="flex flex-col gap-1">
                    <p className="text-footnote text-label-secondary">Re-reads this site’s archive from the start on the next crawl.</p>
                    <CrawlAction id={site.id} action="redo" />
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function OfficialSitesPage(props: Pick<PageProps<"/app/backstage/crawl/sources/official/sites">, "searchParams">) {
  return (
    <CrawlShell back={{ href: sourcePath("official"), label: "Official theatre sites" }} title="Official sites"
      intro="Each theatre website the older crawler reads, and the rules it reads it with.">
      <Sites searchParams={props.searchParams} />
    </CrawlShell>
  );
}
