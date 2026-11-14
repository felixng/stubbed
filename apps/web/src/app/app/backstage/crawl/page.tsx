import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CrawlBar } from "@/components/app/admin/CrawlBar";
import { CrawlSwitch } from "@/components/app/admin/CrawlSwitch";
import { NeedsAttention } from "@/components/app/admin/CrawlOverviewParts";
import { CrawlShell, Section } from "@/components/app/admin/CrawlShell";
import {
  CRAWL_HUB_PATH, OFFICIAL_SITES_PATH, attentionItems, crawlSourceName, crawlingState, hubHeadline, pagesHref, sourceNamesOf, sourcePath, type AttentionItem,
} from "@/lib/admin-crawl";
import { getDispatch, getFlags, getOverview, getSchedule, getSources, getSummary } from "@/lib/crawl-hub-data";
import { clock, dispatchFailing, durationText, nextRunAfter, scheduleAlert, todaysLimits } from "@/lib/crawl-schedule";
import { sourceLine, type SourceSummary } from "@/lib/crawl-summary";

export const metadata: Metadata = { title: "Catalogue crawler" };

const number = new Intl.NumberFormat("en-GB");
const n = (value: number) => number.format(value);
const RUNS_PATH = `${CRAWL_HUB_PATH}/runs`;
const loading = <p className="text-subheadline text-label-secondary">Loading…</p>;

function Busy({ what }: { what: string }) {
  return (
    <p className="text-subheadline text-label-secondary">
      Couldn’t load {what}. The database is probably busy while a crawl run is active. <Link href={CRAWL_HUB_PATH} className="text-tint-text">Try again</Link> in a minute.
    </p>
  );
}

const stateOf = (source: SourceSummary) => crawlingState(source);

// The hub answers three questions and nothing else: where are we, is anything stuck, what needs me.
async function Headline() {
  const [summary, overview, list] = await Promise.all([getSummary(), getOverview(), getSources()]);
  if (!summary || !overview || !list) return null;
  const sources = list.filter(source => source.kind !== "official" && summary[source.source_key]);
  const stuck = sources.reduce((sum, source) => sum + summary[source.source_key].totals.stuck, 0);
  const retrying = sources.reduce((sum, source) => sum + summary[source.source_key].totals.retrying, 0);
  return (
    <p className="font-display text-title-2">
      {hubHeadline(sources.map(source => ({ key: source.source_key, name: source.display_name, state: stateOf(summary[source.source_key]), publishing: summary[source.source_key].publication_enabled })), stuck, retrying, overview.run_dates.from_sources)}
    </p>
  );
}

// One row per source, two lines: how far, then is it moving and when it finishes.
async function SourcesBlock() {
  const [summary, overview, schedule, list] = await Promise.all([getSummary(), getOverview(), getSchedule(), getSources()]);
  if (!summary || !list) return <Busy what="the sources" />;
  const names = sourceNamesOf(list);
  const now = schedule ? new Date(schedule.server_time) : new Date();
  const official = overview?.official;
  const model = schedule ? todaysLimits(schedule, []).model : null;
  const officialLine = summary.official ? sourceLine(names.official ?? "official", summary.official, stateOf(summary.official), now) : null;
  return (
    <section aria-label="Sources" className="flex flex-col divide-y divide-separator rounded-md border border-separator bg-surface">
      {list.filter(source => source.kind !== "official" && summary[source.source_key]).map(({ source_key: key, display_name }) => {
        const line = sourceLine(display_name, summary[key], stateOf(summary[key]), now);
        return (
          <div key={key} className="relative flex flex-col gap-1 p-4">
            <div className="flex items-center gap-3">
              <Link href={sourcePath(key)} className="min-w-0 flex-1 text-headline text-label after:absolute after:inset-0">{line.name}</Link>
              <span className="font-display text-title-3 tabular-nums">{line.percent === null ? "—" : `${line.percent}%`}</span>
              <div className="w-20 shrink-0 sm:w-32">
                <CrawlBar done={line.read} stuck={line.stuck} total={line.known} label={`${n(line.read)} of ${n(line.known)} pages read`} />
              </div>
            </div>
            <p className={`text-subheadline ${line.state === "stalled" ? "font-semibold text-destructive" : ""}`}>
              {line.movement}{line.finish ? ` · ${line.finish}` : ""}
              {line.needs > 0 && (
                <>{" · "}<Link href={pagesHref({ source: key, step: "event", status: "stuck", page: 1 })} className="relative z-10 font-semibold text-destructive">{n(line.needs)} {line.needs === 1 ? "page needs" : "pages need"} you →</Link></>
              )}
            </p>
          </div>
        );
      })}
      {official && (
        <div className="relative flex flex-col gap-1 p-4">
          <div className="flex items-center gap-3">
            <Link href={sourcePath("official")} className="min-w-0 flex-1 text-headline text-label after:absolute after:inset-0">{crawlSourceName("official", names)}</Link>
            {officialLine && (
              <div className="w-20 shrink-0 sm:w-32">
                <CrawlBar done={officialLine.read} stuck={officialLine.stuck} total={officialLine.known} label={`${n(officialLine.read)} of ${n(officialLine.known)} pages read`} />
              </div>
            )}
            <span className="text-subheadline tabular-nums text-label-secondary">{n(official.sites)} sites</span>
          </div>
          {officialLine && <p className="text-subheadline text-label-secondary tabular-nums">{n(officialLine.read)} of {n(officialLine.known)} pages read</p>}
          <p className="text-subheadline">
            {official.sites_needing_attention > 0
              ? <Link href={`${OFFICIAL_SITES_PATH}?attention=1`} className="relative z-10 font-semibold text-destructive">{n(official.sites_needing_attention)} need you →</Link>
              : "Nothing needs you"}
            {model ? ` · model spend today $${model.used.toFixed(2)} of $${model.cap.toFixed(2)}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

// Only rendered when something needs the owner.
async function AttentionBlock() {
  const [summary, overview, schedule, dispatch, list] = await Promise.all([getSummary(), getOverview(), getSchedule(), getDispatch(), getSources()]);
  if (!summary || !overview || !list) return null;
  const extra: AttentionItem[] = [];
  const failing = dispatch ? dispatchFailing(dispatch) : null;
  if (failing) extra.push({ source: "Supabase trigger", text: "The last 2 starts failed", reason: failing.detail, next: "Replace the GitHub token. GitHub’s own schedule is the only trigger until then, and it is often late.", href: RUNS_PATH });
  else if (dispatch?.token === "missing") extra.push({ source: "Supabase trigger", text: "The GitHub token is missing", reason: "Runs only start from GitHub’s own schedule, which is often late.", next: "The steps to add it are on the run history page.", href: RUNS_PATH });
  const alert = schedule ? scheduleAlert(schedule) : null;
  if (alert) extra.push({ source: "Crawl runs", text: alert, href: RUNS_PATH });
  const sources = [...Object.entries(summary).map(([key, value]) => ({ source_key: key, paused_reason: value.paused_reason })), { source_key: "official", paused_reason: null }];
  return <NeedsAttention hideWhenEmpty items={[...extra, ...attentionItems(overview, sources, sourceNamesOf(list))]} />;
}

async function Suggestions() {
  const [flags, overview] = await Promise.all([getFlags(), getOverview()]);
  const chips = flags?.get("catalogue_run_chips_enabled");
  if (chips === undefined || !overview) return null;
  return (
    <Section id="suggestions" title="Suggestions to members" hint="For everyone, on web and iOS.">
      <div className="flex flex-col divide-y divide-separator">
        <CrawlSwitch kind={{ type: "run_chips" }} label="Run chips" checked={chips}
          description={`“On at this venue” suggestions from published run dates. Uses ${n(overview.run_dates.total)} published run dates (${n(overview.run_dates.from_sources)} from crawl sources).`}
          note={chips && overview.run_dates.total === 0 ? "On, but has nothing to suggest yet." : undefined} />
      </div>
      <p className="text-subheadline"><span className="font-semibold">Autofill:</span> locked until it scores 99% on 100 labelled cases.</p>
    </Section>
  );
}

// The schedule, limits and run history live one tap away.
async function RunsLine() {
  const schedule = await getSchedule();
  if (!schedule) return null;
  const last = schedule.last_run;
  const pages = last ? Object.values(last.per_source ?? {}).reduce((sum, value) => sum + (value.pages ?? 0), 0) : 0;
  return (
    <Link href={RUNS_PATH} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-subheadline text-label-secondary">
      <span>
        Next run {clock(nextRunAfter(new Date(schedule.server_time))).replace(" UTC", "")}
        {last ? ` · last run ${clock(last.started_at).replace(" UTC", "")}, ${n(pages)} pages, ${durationText(last.started_at, last.finished_at)}` : " · no run recorded yet"}
      </span>
      <span className="text-tint-text">Runs →</span>
    </Link>
  );
}

export default function CrawlHubPage() {
  return (
    <CrawlShell back={{ href: "/app/backstage", label: "Backstage" }} title="Catalogue crawler">
      <Suspense fallback={loading}><Headline /></Suspense>
      <Suspense fallback={loading}><SourcesBlock /></Suspense>
      <Suspense fallback={null}><AttentionBlock /></Suspense>
      <Suspense fallback={null}><Suggestions /></Suspense>
      <Suspense fallback={null}><RunsLine /></Suspense>
    </CrawlShell>
  );
}
