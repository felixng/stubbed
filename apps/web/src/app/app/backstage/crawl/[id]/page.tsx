import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CrawlAction } from "@/components/app/admin/CrawlAction";
import { DiaryCrawlScore } from "@/components/app/admin/DiaryCrawlScore";
import { RefreshCrawl } from "@/components/app/admin/StartCrawl";
import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { MissedTitles } from "@/components/app/admin/MissedTitles";
import { ReviewFinding } from "@/components/app/admin/ReviewFinding";
import { SendToReview } from "@/components/app/admin/SendToReview";
import { BackLink } from "@/components/ui/BackLink";
import { buttonClass } from "@/components/ui/Button";
import {
  COMPARE_LABEL,
  COMPARE_ORDER,
  UUID,
  rerunCommand,
  scoreLine,
  settingsLine,
  sumScores,
  type RunSettings,
  type Score,
} from "@/lib/admin-crawl";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Crawl run" };

type Finding = {
  id: string;
  venue_id: string | null;
  source_url: string;
  raw_title: string;
  stage_text: string | null;
  start_date: string | null;
  end_date: string | null;
  date_text: string | null;
  kind: string;
  method: string;
  confidence: number | string;
  evidence: string | null;
  review: "right" | "wrong" | "unsure" | null;
  review_note: string | null;
};
type ScoreRow = { venue_id: string | null; venue_name: string | null; findings: number; right_count: number; wrong_count: number; unsure_count: number; unreviewed: number; missed: number };
type Missed = { id: string; venue_id: string | null; title: string; note: string | null };
type RunRow = RunSettings & { status: string; created_at: string; log_url: string | null };
type Compared = {
  status: "added" | "lost" | "changed" | "same";
  venue_name: string | null;
  raw_title: string;
  a_dates: string | null;
  b_dates: string | null;
  a_stage: string | null;
  b_stage: string | null;
  a_review: string | null;
  b_review: string | null;
  carried_review: string | null;
};

const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const toScore = (r: ScoreRow): Score => ({ right: r.right_count, wrong: r.wrong_count, unsure: r.unsure_count, unreviewed: r.unreviewed, findings: r.findings, missed: r.missed });
const dates = (f: Finding) => [f.start_date, f.end_date].filter(Boolean).join(" to ") || f.date_text || "no dates";

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-pill bg-fill px-2 py-0.5 text-footnote font-semibold text-label-secondary">{children}</span>;
}

async function Compare({ runId, otherId }: { runId: string; otherId: string }) {
  const { supabase } = await ownerContext();
  const [{ data: other }, { data, error }] = await Promise.all([
    supabase.from("crawl_runs").select("id, pipeline, method, model, prompt, branch, commit_sha, budget_usd, cost_usd, venue_ids, created_at").eq("id", otherId).maybeSingle(),
    supabase.rpc("admin_compare_runs", { run_a: otherId, run_b: runId }),
  ]);
  if (!other) return <p className="text-subheadline text-label-secondary">That run doesn’t exist.</p>;
  if (error) return <p className="text-subheadline text-label-secondary">Couldn’t compare: {error.message}</p>;
  const rows = (data ?? []) as unknown as Compared[];
  return (
    <section className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 className="text-headline text-label">Compared with the run of {WHEN.format(new Date((other as unknown as RunRow).created_at))} UTC</h2>
      <p className="text-footnote text-label-secondary">
        Other run: {settingsLine(other as unknown as RunSettings)}
        <br />
        This run: see the settings above. A finding is the same thing when it’s for the same theatre with the same title.
      </p>
      {COMPARE_ORDER.map((status) => {
        const list = rows.filter((r) => r.status === status);
        if (list.length === 0) return null;
        return (
          <div key={status} className="flex flex-col">
            <p className="text-subheadline font-semibold text-label">
              {COMPARE_LABEL[status]} ({list.length})
            </p>
            <ul className="flex flex-col">
              {list.map((r, i) => (
                <li key={i} className="flex flex-col border-t border-separator py-2">
                  <span className="text-body text-label">
                    {r.raw_title} <span className="text-footnote text-label-secondary">{r.venue_name ?? "No theatre matched"}</span>
                  </span>
                  {status === "changed" && (
                    <span className="text-footnote text-label-secondary">
                      Dates {r.a_dates || "none"} → {r.b_dates || "none"}
                      {r.a_stage !== r.b_stage ? ` · stage ${r.a_stage ?? "none"} → ${r.b_stage ?? "none"}` : ""}
                    </span>
                  )}
                  {(r.carried_review || r.a_review) && (
                    <span className="text-footnote text-label-secondary">
                      Other run marked {r.a_review ?? "nothing"}
                      {r.carried_review ? ` · carried over to this run as ${r.carried_review}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-subheadline text-label-secondary">Neither run has findings.</p>}
    </section>
  );
}

async function Run({ params, searchParams }: Pick<PageProps<"/app/backstage/crawl/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const compareParam = (await searchParams).compare;
  const compareId = typeof compareParam === "string" && UUID.test(compareParam) && compareParam !== id ? compareParam : null;
  const { supabase } = await ownerContext();
  const [runRes, findingsRes, scoresRes, missedRes, othersRes, waitingRes] = await Promise.all([
    supabase.from("crawl_runs").select("id, pipeline, status, method, model, prompt, branch, commit_sha, budget_usd, cost_usd, venue_ids, created_at, log_url").eq("id", id).maybeSingle(),
    supabase
      .from("crawl_findings")
      .select("id, venue_id, source_url, raw_title, stage_text, start_date, end_date, date_text, kind, method, confidence, evidence, review, review_note")
      .eq("run_id", id)
      .order("raw_title"),
    supabase.rpc("admin_crawl_scores", { for_run: id }),
    supabase.from("crawl_missed").select("id, venue_id, title, note").eq("run_id", id).order("created_at"),
    supabase.from("crawl_runs").select("id, created_at, method, model").neq("id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("crawl_findings").select("id", { count: "exact", head: true }).eq("run_id", id).eq("review", "right").eq("kind", "show").is("sent_to_review_at", null),
  ]);
  if (!runRes.data) notFound();
  const run = runRes.data as unknown as RunRow;
  const findings = (findingsRes.data ?? []) as unknown as Finding[];
  const scores = (scoresRes.data ?? []) as unknown as ScoreRow[];
  const missed = (missedRes.data ?? []) as unknown as Missed[];
  const others = (othersRes.data ?? []) as unknown as { id: string; created_at: string; method: string; model: string | null }[];
  const total = sumScores(scores.map(toScore));
  const venueIds = [...new Set([...scores.map((s) => s.venue_id), ...findings.map((f) => f.venue_id)])];

  return (
    <>
      <div className="flex flex-col gap-1 rounded-md border border-separator bg-surface p-4 shadow-sm">
        <p className="text-headline text-label">
          <time dateTime={run.created_at}>{WHEN.format(new Date(run.created_at))} UTC</time> · {run.status}
        </p>
        <CrawlAction id={id} action="publish" />
        <DiaryCrawlScore venueIds={run.venue_ids} />
        <RefreshCrawl active={run.status === "queued" || run.status === "running"} />
        <p className="text-footnote text-label-secondary">{settingsLine(run)}</p>
        {run.log_url && <a href={run.log_url} target="_blank" rel="noopener noreferrer" className="text-tint-text">Actions log</a>}
        <p className="text-subheadline text-label">{scoreLine(total)}</p>
        {run.pipeline === "discover" ? <Link href="/app/backstage/crawl" className="text-tint-text">Choose theatres for another discovery run</Link> : <>
        <details className="text-footnote text-label-secondary">
          <summary className="min-h-11 cursor-pointer py-3">Run again with these settings</summary>
          <code className="block overflow-x-auto rounded-md bg-fill p-2 whitespace-pre-wrap break-all">{rerunCommand(run)}</code>
          {run.prompt && <pre className="mt-2 overflow-x-auto rounded-md bg-fill p-2 whitespace-pre-wrap">{run.prompt}</pre>}
          <p className="mt-2">Save the prompt above to prompt.md first. You can also start another run from the crawl form.</p>
        </details>
        </>}
      </div>

      <SendToReview runId={id} waiting={waitingRes.count ?? 0} />

      {others.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-footnote text-label-secondary">
            Compare with another run
            <select
              name="compare"
              defaultValue={compareId ?? ""}
              className="min-h-11 rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus"
            >
              <option value="">None</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {WHEN.format(new Date(o.created_at))} UTC · {o.method === "rules_model" ? o.model || "model" : "rules"}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass("secondary", "sm")}>
            Compare
          </button>
        </form>
      )}
      {compareId && <Compare runId={id} otherId={compareId} />}

      {findings.length === 0 && missed.length === 0 && <p className="text-subheadline text-label-secondary">This run has no findings yet.</p>}

      {venueIds.map((vid) => {
        const row = scores.find((s) => s.venue_id === vid);
        const list = findings.filter((f) => f.venue_id === vid);
        return (
          <section key={vid ?? "none"} className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-headline break-words text-label">{row?.venue_name ?? "No theatre matched"}</h2>
              {row && <p className="text-footnote text-label-secondary">{scoreLine(toScore(row))}</p>}
            </div>
            <ul className="flex flex-col">
              {list.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 border-t border-separator py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-body break-words text-label">{f.raw_title}</span>
                    <span className="text-footnote text-label-secondary">
                      {dates(f)}
                      {f.stage_text ? ` · ${f.stage_text}` : ""} · {f.kind}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill>{f.method}</Pill>
                      <Pill>{Math.round(Number(f.confidence) * 100)}% sure</Pill>
                      <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-footnote font-semibold text-tint-text">
                        Source page
                      </a>
                    </span>
                    {f.evidence && <span className="text-footnote break-words text-label-secondary">“{f.evidence}”</span>}
                  </div>
                  <ReviewFinding key={`${f.id}${f.review}`} id={f.id} review={f.review} note={f.review_note} />
                </li>
              ))}
            </ul>
            <MissedTitles key={missed.filter((m) => m.venue_id === vid).map((m) => m.id).join()} runId={id} venueId={vid} missed={missed.filter((m) => m.venue_id === vid)} />
          </section>
        );
      })}
    </>
  );
}

export default function AdminCrawlRunPage({ params, searchParams }: PageProps<"/app/backstage/crawl/[id]">) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <BackLink href="/app/backstage/crawl">Crawl runs</BackLink>
        <h1 className="text-title font-display text-label">Crawl run</h1>
        <p className="text-subheadline text-label-secondary">
          Check each finding against its source page. Mark it right or wrong, and add the titles the run missed.{" "}
          <Link href="/app/backstage/crawl" className="text-tint-text">
            All runs
          </Link>
        </p>
      </div>
      <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
        <AdminOnly>
          <Run params={params} searchParams={searchParams} />
        </AdminOnly>
      </Suspense>
    </section>
  );
}
