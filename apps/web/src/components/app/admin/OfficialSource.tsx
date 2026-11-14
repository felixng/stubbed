import Link from "next/link";

import { CrawlProgress } from "@/components/app/admin/CrawlProgress";
import { NeedsAttention } from "@/components/app/admin/CrawlOverviewParts";
import { Section } from "@/components/app/admin/CrawlShell";
import { RefreshCrawl, StartCrawl } from "@/components/app/admin/StartCrawl";
import { OFFICIAL_SITES_PATH, attentionItems, pagesHref, runPath, settingsLine, shortDateTime, sourceNamesOf, type CrawlOverview, type RunSettings } from "@/lib/admin-crawl";
import { getSources } from "@/lib/crawl-hub-data";
import { ownerContext } from "@/lib/supabase/data";

type Run = RunSettings & { status: string; kind: string; created_at: string; summary: { findings?: number } | null; log_url: string | null };

// Official theatre sites: AI finds the what's-on page and writes the reading rules once; after that the pages are read like any other source.
// Its runs, sites and review all live under this source.
export async function OfficialSource() {
  const { supabase } = await ownerContext();
  const [runsRes, overviewRes, theatres, sourceList] = await Promise.all([
    supabase.from("crawl_runs")
      .select("id, pipeline, kind, status, method, model, prompt, branch, commit_sha, budget_usd, cost_usd, venue_ids, summary, created_at, log_url")
      .order("created_at", { ascending: false }).limit(50),
    supabase.rpc("admin_crawl_overview", { for_source: "official" }),
    supabase.rpc("admin_list_crawl_venues", { page_size: 50, page_offset: 0 }),
    getSources(),
  ]);
  if (runsRes.error || overviewRes.error || !overviewRes.data) return <p className="text-subheadline text-label-secondary">Couldn’t load the official-sites crawler.</p>;
  const overview = overviewRes.data as unknown as CrawlOverview;
  const runs = (runsRes.data ?? []) as unknown as Run[];
  const ids = [...new Set(runs.flatMap(r => r.venue_ids))];
  const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, (i + 1) * 100));
  const named = await Promise.all(batches.map(batch => supabase.from("venues").select("id,name").in("id", batch)));
  const names = new Map(named.flatMap(result => result.data ?? []).map(t => [t.id, t.name]));
  const o = overview.official;

  return (
    <>
      <p className="font-display text-title-2">
        AI finds each theatre’s page and writes the reading rules once; after that the pages are read like any other source. {o.last_run_at ? `Last run ${shortDateTime(o.last_run_at)} (${o.last_run_status}).` : "No runs yet."}{" "}
        {o.sites_needing_attention > 0 ? `${o.sites_needing_attention} of ${o.sites} sites need attention.` : "Nothing needs you."}
      </p>

      <NeedsAttention items={attentionItems(overview, [{ source_key: "official", paused_reason: null }], sourceNamesOf(sourceList ?? []))} />

      <CrawlProgress />

      <Section id="pages" title="Pages">
        <p className="text-subheadline text-label-secondary">Every page the crawler reads for these sites, with its status, by site.</p>
        <Link href={pagesHref({ source: "official", step: "venue", page: 1 })} className="inline-flex min-h-11 items-center text-subheadline text-tint-text">Open pages</Link>
      </Section>

      <Section id="sites" title="Sites and reading rules">
        <p className="text-subheadline text-label-secondary">Each theatre site, how it is read, and the rules that read it.</p>
        <Link href={OFFICIAL_SITES_PATH} className="inline-flex min-h-11 items-center text-subheadline text-tint-text">Open sites</Link>
      </Section>

      <StartCrawl theatres={theatres.data ?? []} />
      <RefreshCrawl active={runs.some(r => r.status === "queued" || r.status === "running")} />

      <Section id="runs" title="Runs" hint="Open a run to check its findings against the source pages.">
        {runs.length === 0 ? <p className="text-subheadline text-label-secondary">No runs yet.</p> : (
          <ul className="flex flex-col divide-y divide-separator">
            {runs.map(r => (
              <li key={r.id}>
                <Link href={runPath(r.id)} className="flex flex-col gap-0.5 py-3 hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
                  <span className="text-headline text-label"><time dateTime={r.created_at}>{shortDateTime(r.created_at)}</time> · {r.status}</span>
                  <span className="text-footnote text-label-secondary">{r.venue_ids.map(id => names.get(id) ?? "Theatre removed").join(", ")} · {r.summary?.findings ?? 0} findings</span>
                  <span className="text-footnote text-label-secondary">{settingsLine(r)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
