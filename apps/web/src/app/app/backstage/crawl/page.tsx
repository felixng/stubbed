import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CrawlProgress } from "@/components/app/admin/CrawlProgress";
import { DiaryCrawlScore } from "@/components/app/admin/DiaryCrawlScore";
import { StartCrawl, RefreshCrawl } from "@/components/app/admin/StartCrawl";
import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { BackLink } from "@/components/ui/BackLink";
import { settingsLine, type RunSettings } from "@/lib/admin-crawl";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Crawl runs" };

type Run = RunSettings & { status: string; kind: string; created_at: string; summary: { findings?: number } | null; log_url: string | null };

const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

// The latest crawl runs (read with the admin's session; RLS: admins only).
// The form dispatches saved runs through the admin-only API.
async function Runs() {
  const { supabase } = await ownerContext();
  const { data, error } = await supabase
    .from("crawl_runs")
    .select("id, kind, status, method, model, prompt, branch, commit_sha, budget_usd, cost_usd, venue_ids, summary, created_at, log_url")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return <p className="text-subheadline text-label-secondary">Couldn’t load runs: {error.message}</p>;
  const { data: theatres } = await supabase.from("venues").select("id, name").not("whats_on_url", "is", null).order("name").limit(10000);
  const runs = (data ?? []) as unknown as Run[];
  const names = new Map((theatres ?? []).map(t => [t.id, t.name]));
  return (
    <>
    <CrawlProgress />
    <Link href="/app/backstage/crawl/sites" className="text-tint-text">Sites and archive status</Link>
    <DiaryCrawlScore venueIds={[...new Set(runs.flatMap(r => r.venue_ids))]} />
    <StartCrawl theatres={theatres ?? []} lastPrompt={runs.find(r => r.prompt)?.prompt ?? ""} />
    <RefreshCrawl active={runs.some(r => r.status === "queued" || r.status === "running")} />
    <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
      {runs.map((r) => (
        <li key={r.id} className="border-b border-separator last:border-b-0">
          <Link
            href={`/app/backstage/crawl/${r.id}`}
            className="flex flex-col gap-0.5 px-4 py-3 hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            <span className="text-headline text-label">
              <time dateTime={r.created_at}>{WHEN.format(new Date(r.created_at))} UTC</time> · {r.status}
            </span>
            <span className="text-footnote text-label-secondary">
              {r.venue_ids.map(id => names.get(id) ?? "Theatre removed").join(", ")} · {r.summary?.findings ?? 0} findings
            </span>
            <span className="text-footnote text-label-secondary">{settingsLine(r)}</span>
          </Link>
          {r.log_url && <a className="inline-flex min-h-11 items-center px-4 text-tint-text" href={r.log_url} target="_blank" rel="noopener noreferrer">Actions log</a>}
        </li>
      ))}
    </ul>
    </>
  );
}

export default function AdminCrawlPage() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage">Backstage</BackLink>
        <h1 className="text-title font-display text-label">Crawl runs</h1>
        <p className="text-subheadline text-label-secondary">
          What the crawler read from theatre websites. Nothing here reaches users. Open a run to check its findings.
        </p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Runs />
        </AdminOnly>
      </Suspense>
    </section>
  );
}
