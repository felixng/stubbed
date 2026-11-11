import { Suspense } from "react";
import Link from "next/link";
import { AdminOnly } from "@/components/app/admin/AdminOnly";
import { CrawlSourceControl } from "@/components/app/admin/CrawlSourceControl";
import { CrawlSwitch } from "@/components/app/admin/CrawlSwitch";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import {
  CRAWL_PAGE_SIZE, CRAWL_SOURCES_PATH, CRAWL_STAGES, CRAWL_STATUS_LABELS,
  crawlSourceFilters, crawlSourceHref, crawlSourceName, crawlStageProgress, summariseCrawlShow, summariseCrawlTask,
  type CrawlPage, type CrawlScan, type CrawlShowResult, type CrawlSourceProgress, type CrawlTaskResult, type TaskTone,
} from "@/lib/admin-crawl";
import { ownerContext } from "@/lib/supabase/data";

const stageNames = { directory: "Directory", venue: "Venues", event: "Event details" };
const panel = "min-w-0 rounded-md border border-separator bg-surface p-4";
const selectStyle = "min-h-11 min-w-0 rounded-sm border border-separator bg-surface px-2 text-subheadline";
const time = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const number = new Intl.NumberFormat("en-GB");

function timestamp(value: string) {
  return `${time.format(new Date(value))} UTC`;
}

function discovery(scan: CrawlScan | null) {
  if (!scan) return "No scan recorded.";
  if (scan.enumeration_status === "enumerated" && scan.completed_at) {
    return `Discovery complete for configured scope, as of ${timestamp(scan.completed_at)}.`;
  }
  if (scan.enumeration_status === "not_applicable") return "This scope starts at a supplied page.";
  return "Discovery in progress — total may grow.";
}

const tones: Record<TaskTone, string> = {
  good: "bg-fill text-label",
  waiting: "bg-tint-fill text-tint-text",
  bad: "bg-fill text-destructive",
  neutral: "bg-fill text-label-secondary",
};
const marks: Record<TaskTone, string> = { good: "✓", waiting: "…", bad: "✕", neutral: "·" };

const SHOWS_SHOWN = 6;

function ShowLine({ show }: { show: CrawlShowResult }) {
  const line = summariseCrawlShow(show);
  return (
    <li className="flex gap-2">
      <span aria-hidden className={line.mark === "✕" ? "text-destructive" : "text-label-secondary"}>{line.mark}</span>
      <span className="min-w-0 break-words"><span className="font-semibold">{line.title}</span> <span className="text-label-secondary">· {line.detail}</span></span>
    </li>
  );
}

function TaskRow({ row, result, known, source, scan }: { row: CrawlPage; result?: CrawlTaskResult; known: boolean; source: string; scan: CrawlScan }) {
  const summary = summariseCrawlTask(row, result, known);
  return (
    <li className={`flex flex-col gap-2 ${panel}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 break-words text-subheadline font-semibold">{summary.title}</p>
        <span className={`rounded-pill px-2 py-1 text-footnote font-semibold ${tones[summary.outcome.tone]}`}>
          {marks[summary.outcome.tone]} {summary.outcome.label}
        </span>
      </div>
      {summary.got.length > 0 && <p className="text-subheadline">{summary.got.join(" · ")}</p>}
      {result?.shows && result.shows.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-footnote font-semibold text-label-secondary">Shows listed</p>
          <ul className="flex flex-col gap-0.5 text-subheadline">
            {result.shows.slice(0, SHOWS_SHOWN).map((show, i) => <ShowLine key={i} show={show} />)}
          </ul>
          {result.shows.length > SHOWS_SHOWN && (
            <details className="text-footnote text-label-secondary">
              <summary className="min-h-6 cursor-pointer">Show {result.shows.length - SHOWS_SHOWN} more</summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-subheadline text-label">
                {result.shows.slice(SHOWS_SHOWN).map((show, i) => <ShowLine key={i} show={show} />)}
              </ul>
            </details>
          )}
        </div>
      )}
      {summary.missing.length > 0 && <p className="text-footnote text-destructive">Missing: {summary.missing.join(", ")}</p>}
      {row.status !== "succeeded" && row.last_error && <p className="break-words text-footnote">{row.last_error}</p>}
      {row.status === "retry_wait" && <p className="text-footnote text-label-secondary">Next try {timestamp(row.available_at)}</p>}
      <details className="text-footnote text-label-secondary">
        <summary className="min-h-6 cursor-pointer">Details</summary>
        <div className="mt-1 flex flex-col gap-1">
          <a href={row.canonical_url} target="_blank" rel="noreferrer" className="break-all text-tint-text">{row.canonical_url}</a>
          <p>{row.attempts} {row.attempts === 1 ? "attempt" : "attempts"} · {row.http_requests} HTTP requests · Parser {row.parser_version ?? "pending"}</p>
          {row.last_success_at && <p>Last read {timestamp(row.last_success_at)}</p>}
          {row.last_error && row.status === "succeeded" && <p className="break-words">Last error: {row.last_error}</p>}
        </div>
      </details>
      {scan.is_current && (
        <div className="flex flex-wrap gap-2">
          {row.status === "blocked" ? <CrawlSourceControl source={source} operation="retry_blocked" scan={scan.id} task={row.id} />
            : (row.status === "failed" || row.status === "retry_wait") &&
              <CrawlSourceControl source={source} operation="retry_failed" scan={scan.id} task={row.id} />}
          {row.status !== "blocked" && row.parser_version &&
            <CrawlSourceControl source={source} operation="reparse" scan={scan.id} task={row.id} />}
        </div>
      )}
    </li>
  );
}

async function Sources({ searchParams }: Pick<PageProps<"/app/backstage/crawl/sources">, "searchParams">) {
  const filters = crawlSourceFilters(await searchParams);
  const { supabase } = await ownerContext();
  const [{ data: payload, error }, { data: flagRows }] = await Promise.all([
    supabase.rpc("crawl_source_progress", {
      for_source: filters.source, for_generation: filters.scan, for_stage: filters.stage,
      for_status: filters.status, page_size: CRAWL_PAGE_SIZE, page_offset: (filters.page - 1) * CRAWL_PAGE_SIZE,
    }),
    supabase.rpc("admin_catalogue_flags"),
  ]);
  if (error || !payload) return <p>Couldn’t load source progress.</p>;
  const flags = new Map(((flagRows ?? []) as { flag: string; enabled: boolean }[]).map(row => [row.flag, row.enabled]));
  const chips = flags.get("catalogue_run_chips_enabled");
  const autofill = flags.get("catalogue_run_autofill_enabled");
  const data = payload as unknown as CrawlSourceProgress;
  const { data: resultRows, error: resultsError } = data.rows.length
    ? await supabase.rpc("admin_crawl_task_results", { for_tasks: data.rows.map(row => row.id) })
    : { data: {} };
  const results = (resultRows ?? {}) as Record<string, CrawlTaskResult>;
  const source = data.sources.find(item => item.source_key === filters.source);
  const scan = data.scan;
  const first = (filters.page - 1) * CRAWL_PAGE_SIZE + 1;
  const last = Math.min(filters.page * CRAWL_PAGE_SIZE, data.filtered_total);

  return (
    <>
      <section className={`flex flex-col gap-3 ${panel}`} aria-labelledby="logging-suggestions">
        <h2 id="logging-suggestions" className="text-headline">Logging suggestions</h2>
        <p className="text-subheadline text-label-secondary">For everyone, on web and iOS. Switches stay as you leave them.</p>
        <div className="flex flex-col divide-y divide-separator">
          {chips !== undefined && (
            <CrawlSwitch kind={{ type: "run_chips" }} label="Run chips" checked={chips}
              description="Suggest the show from a venue and date, using published run dates." />
          )}
          <CrawlSwitch label="Autofill" checked={Boolean(autofill)}
            description="Fill in the show for the member."
            note="Locked until it scores 99% on 100 labelled cases." />
        </div>
      </section>
      <nav aria-label="Crawl sources" className="flex flex-wrap gap-3">
        {data.sources.map(item => (
          <Link key={item.source_key} href={crawlSourceHref({ ...filters, source: item.source_key, scan: undefined, status: undefined, page: 1 })}
            aria-current={source?.source_key === item.source_key ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-pill bg-fill px-3 text-subheadline font-semibold text-tint-text aria-[current=page]:bg-tint-fill">
            {crawlSourceName(item.source_key)}
          </Link>
        ))}
      </nav>
      {source ? (
        <>
          <section className={`flex flex-col gap-3 ${panel}`} aria-labelledby="crawl-source-state">
            <h2 id="crawl-source-state" className="text-headline">{crawlSourceName(source.source_key)}</h2>
            <dl className="grid grid-cols-2 gap-3 text-subheadline sm:grid-cols-3">
              <div><dt className="text-label-secondary">Collection</dt><dd>{source.collection_enabled ? "Enabled" : "Off"}</dd></div>
              <div><dt className="text-label-secondary">Parser</dt><dd className="break-words">{source.adapter_version}</dd></div>
              <div><dt className="text-label-secondary">Last scan activity</dt><dd>{data.last_activity_at ? timestamp(data.last_activity_at) : "None recorded"}</dd></div>
              {source.withdrawn_at && <div><dt className="text-label-secondary">Evidence</dt><dd>Withdrawn</dd></div>}
            </dl>
            {source.paused_reason && <p className="break-words text-subheadline">{source.paused_reason}</p>}
            {source.source_key === "official" && <p className="text-footnote text-label-secondary">Legacy official-site activity is listed under Crawl sites and Crawl runs.</p>}
            <div className="flex flex-col gap-1">
              <h3 className="text-footnote font-semibold uppercase text-label-secondary">Switches</h3>
              <div className="flex flex-col divide-y divide-separator">
                <CrawlSwitch kind={{ type: "crawling", source: source.source_key }} label="Crawling"
                  checked={source.collection_enabled && !source.operator_paused_at && !source.paused_reason}
                  disabled={!source.collection_enabled || Boolean(source.paused_reason)}
                  description="Fetch new pages for this source. Off pauses it; work in progress finishes."
                  note={!source.collection_enabled ? "Collection is off for this source (set in the database)." : source.paused_reason ? "Blocked by the source; use Retry blocked pages below." : undefined} />
                <CrawlSwitch kind={{ type: "publication", source: source.source_key }} label="Publication"
                  checked={source.publication_enabled}
                  disabled={!source.publication_enabled && Boolean(source.withdrawn_at)}
                  description="Put validated shows, venues and run dates from this source into the catalogue."
                  note={source.withdrawn_at && !source.publication_enabled ? "Evidence withdrawn; reinstate it first." : undefined} />
              </div>
            </div>
            {scan?.is_current && (
              <div className="flex flex-col gap-2">
                <h3 className="text-footnote font-semibold uppercase text-label-secondary">Actions</h3>
                <p className="text-footnote text-label-secondary">Each runs once. None of them changes a switch.</p>
                <div className="flex flex-wrap gap-2">
                  <CrawlSourceControl source={source.source_key} operation="retry_failed" scan={scan.id} />
                  <CrawlSourceControl source={source.source_key} operation="retry_blocked" scan={scan.id} />
                  <CrawlSourceControl source={source.source_key} operation="rediscover" scan={scan.id}
                    disabled={!source.collection_enabled || Boolean(source.operator_paused_at || source.paused_reason)} />
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="crawl-scan-heading">
            <h2 id="crawl-scan-heading" className="text-headline">Scan progress</h2>
            <p className="text-subheadline">{discovery(scan)}</p>
            {scan && <p className="break-words text-footnote text-label-secondary">{scan.scope_key} · {scan.is_current ? "Current" : "Archived"} · Started {timestamp(scan.started_at)}</p>}
            {scan?.paused_reason && <p className="break-words text-subheadline">{scan.paused_reason}</p>}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {CRAWL_STAGES.map(stage => {
                const counts = data.stages[stage];
                return (
                  <div key={stage} className={panel}>
                    <h3 className="text-headline">{stageNames[stage]}</h3>
                    <p className="mt-1 text-subheadline">{crawlStageProgress(stage, counts)}</p>
                    {stage === "venue" && <p className="mt-1 text-footnote text-label-secondary">{number.format(data.enriched_venue_pages)} with reachable event work complete</p>}
                    <dl className="mt-3 grid gap-y-1 text-footnote">
                      {Object.entries(CRAWL_STATUS_LABELS).map(([status, label]) => (
                        <div key={status} className="flex justify-between gap-2"><dt>{label}</dt><dd className="tabular-nums">{number.format(counts[status as keyof typeof CRAWL_STATUS_LABELS])}</dd></div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
            <div className={`grid gap-3 text-subheadline md:grid-cols-3 ${panel}`}>
              <div><h3 className="font-semibold">Work counters</h3><p>{number.format(data.attempts)} attempts · {number.format(data.http_requests)} reserved HTTP requests</p>
                <p>{data.model_calls === null ? "Legacy model calls untracked" : `${data.model_calls} model calls`} · ${data.model_spend_usd.toFixed(4)} {source.source_key === "official" ? "legacy spend" : "model spend"}</p></div>
              <div><h3 className="font-semibold">Unique identities</h3><p>Venues · {data.identities.matched_venues} matched · {data.identities.crawler_venues} crawler-created · {data.identities.unresolved_venues} unresolved</p>
                <p>Shows · {data.identities.matched_shows} matched · {data.identities.crawler_shows} crawler-created · {data.identities.unresolved_events} unresolved events</p></div>
              <div><h3 className="font-semibold">Effective run evidence</h3><p>{data.evidence.published_runs} published · {data.evidence.conflicting_runs} conflicting · {data.evidence.stale_runs} stale</p>
                <p>{data.evidence.unsupported_closing} without confirmed closing</p></div>
            </div>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="crawl-pages-heading">
            <h2 id="crawl-pages-heading" className="text-headline">Discovered pages</h2>
            <form action={CRAWL_SOURCES_PATH} method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="source" value={source.source_key} />
              <div className="flex min-w-0 max-w-full flex-col gap-1 text-footnote">
                <label htmlFor="crawl-scan">Scan</label>
                <select id="crawl-scan" name="scan" defaultValue={filters.scan ?? ""} className={selectStyle}>
                  <option value="">Latest current scan</option>
                  {data.scans.map(scan => <option key={scan.id} value={scan.id}>{scan.scope_key} · {timestamp(scan.started_at)}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 max-w-full flex-col gap-1 text-footnote">
                <label htmlFor="crawl-stage">Stage</label>
                <select id="crawl-stage" name="stage" defaultValue={filters.stage} className={selectStyle}>
                  {CRAWL_STAGES.map(stage => <option key={stage} value={stage}>{stageNames[stage]}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 max-w-full flex-col gap-1 text-footnote">
                <label htmlFor="crawl-status">Status</label>
                <select id="crawl-status" name="status" defaultValue={filters.status ?? ""} className={selectStyle}>
                  <option value="">All statuses</option>
                  {Object.entries(CRAWL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <Button type="submit" variant="secondary" size="sm">Apply filters</Button>
            </form>
            {scan && data.rows.length > 0 ? (
              <ul className="flex flex-col gap-2">{data.rows.map(row => <TaskRow key={row.id} row={row} result={results[row.id]} known={!resultsError} source={source.source_key} scan={scan} />)}</ul>
            ) : <p className="text-subheadline text-label-secondary">No pages match these filters.</p>}
            <nav aria-label="Page results" className="flex flex-wrap items-center gap-4 text-subheadline">
              <span>{first <= last ? `${number.format(first)}–${number.format(last)} of ${number.format(data.filtered_total)}` : `${number.format(data.filtered_total)} matching pages`}</span>
              {filters.page > 1 && <Link className="text-tint-text" href={crawlSourceHref(filters, filters.page - 1)}>Previous</Link>}
              {last < data.filtered_total && <Link className="text-tint-text" href={crawlSourceHref(filters, filters.page + 1)}>Next</Link>}
            </nav>
          </section>
        </>
      ) : <p>Select an available crawl source.</p>}
    </>
  );
}

export default function CrawlSourcesPage(props: Pick<PageProps<"/app/backstage/crawl/sources">, "searchParams">) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <BackLink href="/app/backstage/crawl/sites">Crawl sites</BackLink>
      <h1 className="font-display text-title">Crawl sources</h1>
      <Suspense fallback={<p>Loading source progress…</p>}>
        <AdminOnly><Sources {...props} /></AdminOnly>
      </Suspense>
    </section>
  );
}
