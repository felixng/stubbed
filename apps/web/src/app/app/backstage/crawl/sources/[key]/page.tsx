import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CrawlSourceControl } from "@/components/app/admin/CrawlSourceControl";
import { CrawlSwitch } from "@/components/app/admin/CrawlSwitch";
import { NeedsAttention, RecentChanges } from "@/components/app/admin/CrawlOverviewParts";
import { CrawlShell, Section } from "@/components/app/admin/CrawlShell";
import { OfficialSource } from "@/components/app/admin/OfficialSource";
import { CrawlBar } from "@/components/app/admin/CrawlBar";
import { PipelineDiagram, type PipelineStep } from "@/components/app/admin/PipelineDiagram";
import { getSummary } from "@/lib/crawl-hub-data";
import { areaLines, areaName, sourceLine, stepsLine, type SourceSummary } from "@/lib/crawl-summary";
import {
  CRAWL_BUCKETS, CRAWL_BUCKET_LABELS, CRAWL_STAGES, CRAWL_STEPS, attentionItems, crawlBuckets, crawlSourceName, crawlingState,
  isCrawlSource, pagesHref, shortDate, shortDateTime, sourceKeyFromPath, sourcePath, stepName,
  type CrawlOverview, type CrawlSourceProgress,
} from "@/lib/admin-crawl";
import { timeAgo } from "@/lib/reactions";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Crawl source" };

const number = new Intl.NumberFormat("en-GB");
const n = (value: number) => number.format(value);
const th = "py-2 pr-3 text-footnote font-semibold text-label-secondary";

// The first five steps for one source, with this source's own numbers. Suggest is for everyone, so it lives on the hub.
function stepsFor(publishing: boolean, summary: SourceSummary | undefined, waiting: number, published: number): PipelineStep[] {
  const stage = (key: string) => summary?.stages[key] ?? { known: 0, read: 0, stuck: 0 };
  const crawl = (index: number, key: string, noun: string): PipelineStep => {
    const counts = stage(key);
    return { ...CRAWL_STEPS[index], summary: `${n(counts.read)} of ${n(counts.known)} ${noun} read`, progress: { done: counts.read, total: counts.known, stuck: counts.stuck ?? 0 },
      tone: (counts.stuck ?? 0) > 0 ? "bad" : counts.read < counts.known ? "waiting" : "good" };
  };
  return [
    crawl(0, "directory", "directory pages"), crawl(1, "venue", "venue pages"), crawl(2, "event", "show pages"),
    { ...CRAWL_STEPS[3], summary: `${n(waiting)} ${waiting === 1 ? "page is" : "pages are"} waiting to be checked.`, tone: waiting ? "waiting" : "neutral" },
    { ...CRAWL_STEPS[4], summary: `${publishing ? "On." : "Off, so nothing from this source reaches the catalogue."} ${n(published)} run dates published.`, tone: published ? "good" : "neutral" },
  ];
}

async function Source({ params, searchParams }: Pick<PageProps<"/app/backstage/crawl/sources/[key]">, "params" | "searchParams">) {
  const key = sourceKeyFromPath((await params).key);
  if (!isCrawlSource(key)) notFound();
  if (key === "official") return <OfficialSource />;
  const input = await searchParams;
  // ?area= (older links used ?pass=) shows one earlier reading; without it the page covers every current area.
  const chosen = [input.area, input.pass].find(value => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) as string | undefined;
  const { supabase } = await ownerContext();
  const [progressRes, overviewRes, summaryAll] = await Promise.all([
    supabase.rpc("crawl_source_progress", {
      for_source: key, for_generation: chosen, for_stage: "venue", page_size: 1, page_offset: 0, for_all_areas: !chosen,
    }),
    supabase.rpc("admin_crawl_overview", { for_source: key }),
    getSummary(),
  ]);
  if (progressRes.error || !progressRes.data || overviewRes.error || !overviewRes.data) return <p>Couldn’t load this source.</p>;
  const data = progressRes.data as unknown as CrawlSourceProgress;
  const overview = overviewRes.data as unknown as CrawlOverview;
  const source = data.sources.find(item => item.source_key === key);
  if (!source) notFound();
  const extras = overview.sources[key];
  const scan = data.scan;
  const state = crawlingState(source);
  const summary = summaryAll?.[key];
  const areas = summary?.areas ?? [];
  const line = summary ? sourceLine(key, summary, state, new Date()) : null;
  const filters = { source: key, step: "venue" as const, scan: chosen, page: 1 };

  const totals = CRAWL_STAGES.map(stage => crawlBuckets(data.stages[stage]));
  const failed = totals.reduce((sum, b) => sum + b.retrying, 0) + data.stages.directory.failed + data.stages.venue.failed + data.stages.event.failed;
  const blocked = CRAWL_STAGES.reduce((sum, stage) => sum + data.stages[stage].blocked, 0);
  const canFix = chosen ? Boolean(scan?.is_current) : true;
  const areaIds = areas.map(area => area.id);
  const items = attentionItems(overview, [source]);
  const waiting = extras?.unchecked_pages ?? 0;
  const lastPublished = overview.publication?.[key]?.last_published_at ?? null;
  const lastPublishedAgo = lastPublished ? timeAgo(lastPublished) : null;
  const id = data.identities, ev = data.evidence;

  return (
    <>
      {line && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="font-display text-title tabular-nums">{line.percent === null ? "—" : `${line.percent}%`}</span>
            <div className="min-w-0 flex-1"><CrawlBar done={line.read} stuck={line.stuck} total={line.known} label={`${n(line.read)} of ${n(line.known)} pages read`} /></div>
          </div>
          <p className={`text-headline ${line.state === "stalled" ? "text-destructive" : ""}`}>
            {line.movement}{line.finish ? ` · ${line.finish}` : ""}
          </p>
          <p className="text-footnote text-label-secondary">{n(line.read)} of {n(line.known)} pages read across {areas.length === 1 ? "its area" : `its ${areas.length} areas`}. Estimates grow when new pages are found.</p>
        </div>
      )}
      {chosen && (
        <p className="text-subheadline">You are looking at one earlier reading of an area. <Link href={sourcePath(key)} className="text-tint-text">Back to the current areas</Link></p>
      )}

      <Section id="switches" title="Switches" hint="These stay as you leave them.">
        <div className="flex flex-col divide-y divide-separator">
          <CrawlSwitch kind={{ type: "crawling", source: key }} label="Crawling" stateText={state.label}
            checked={state.key === "on"} disabled={state.key === "off" || state.key === "blocked"}
            description="Pause if the site complains or you want to stop spending requests. Pages in progress finish."
            note={state.key === "off" ? "Not enabled for this source. This is set in the database." : state.key === "blocked" ? `Blocked by the site: ${source.paused_reason}` : undefined} />
          <CrawlSwitch kind={{ type: "publication", source: key }} label="Publication" checked={source.publication_enabled}
            disabled={!source.publication_enabled && Boolean(source.withdrawn_at)}
            description="Put checked venues, shows and run dates from this source into the catalogue. Takes effect within a minute."
            note={source.withdrawn_at && !source.publication_enabled ? "This source’s evidence is withdrawn. Reinstate it first."
              : waiting > 0 ? `${n(waiting)} ${waiting === 1 ? "page is" : "pages are"} read and waiting to be checked and published.` : undefined} />
        </div>
      </Section>

      <NeedsAttention hideWhenEmpty items={items}>
        {canFix && failed > 0 && (
          <div className="flex flex-col gap-1 border-t border-separator pt-3">
            <p className="text-subheadline">Pages that failed retry on their own at the time shown on each page. Retry now only to hurry them.</p>
            <CrawlSourceControl source={key} operation="retry_failed" scans={areaIds.length ? areaIds : undefined} scan={scan?.id} label={`Retry ${n(failed)} ${failed === 1 ? "page" : "pages"}`} />
          </div>
        )}
        {canFix && blocked > 0 && (
          <div className="flex flex-col gap-1 border-t border-separator pt-3">
            <p className="text-subheadline">The site blocked {n(blocked)} {blocked === 1 ? "page" : "pages"}{source.paused_reason ? ` (${source.paused_reason})` : ""}. When you think the block has lifted, retry them. Retrying too soon may get us blocked again.</p>
            <CrawlSourceControl source={key} operation="retry_blocked" scans={areaIds.length ? areaIds : undefined} scan={scan?.id} label={`Retry ${n(blocked)} blocked ${blocked === 1 ? "page" : "pages"}`} />
          </div>
        )}
      </NeedsAttention>

      {areas.length > 0 && !chosen && (
        <Section id="areas" title="Areas" hint="Each part of the site the crawler reads, largest first. Each line opens its pages.">
          <ul className="flex flex-col divide-y divide-separator">
            {areaLines(summary!).map((item, index) => (
              <li key={areas[index].id}>
                <Link href={pagesHref(filters, { scan: areas[index].id })} className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 py-2 text-subheadline">
                  <span className="font-semibold text-label">{item.name}</span>
                  <span className={item.state === "waiting_turn" ? "text-label-secondary" : item.state === "done" ? "text-label-secondary" : "text-label"}>{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <details className="min-w-0 rounded-md border border-separator bg-surface p-4">
        <summary className="min-h-11 cursor-pointer text-headline">
          Steps
          {summary && <span className="block text-subheadline font-normal text-label-secondary">{stepsLine(summary.stages)}</span>}
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          <PipelineDiagram label="Steps for this source" steps={stepsFor(source.publication_enabled, summary, waiting, ev.published_runs)} />
          <p className="text-footnote text-label-secondary">Each count opens those pages. Totals are pages found so far, not everything on the site.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-subheadline">
            <thead>
              <tr>
                <th className={th}>Step</th>
                {CRAWL_BUCKETS.map(bucket => <th key={bucket} className={`${th} text-right`}>{CRAWL_BUCKET_LABELS[bucket]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-separator">
              {CRAWL_STAGES.map((stage, index) => (
                <tr key={stage}>
                  <td className="py-2 pr-3">{stepName(stage)}</td>
                  {CRAWL_BUCKETS.map(bucket => {
                    const value = totals[index][bucket];
                    return (
                      <td key={bucket} className="py-2 pr-3 text-right tabular-nums">
                        {value > 0
                          ? <Link href={pagesHref(filters, { step: stage, status: bucket })} className={`inline-flex min-h-11 items-center ${bucket === "stuck" ? "font-semibold text-destructive" : "text-tint-text"}`}>{n(value)}</Link>
                          : <span className="text-label-secondary">0</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-1 text-subheadline">
          <li><span className="font-semibold">{CRAWL_STEPS[3].name}:</span> {n(waiting)} {waiting === 1 ? "page" : "pages"} waiting to be checked.</li>
          <li><span className="font-semibold">{CRAWL_STEPS[4].name}:</span> {source.publication_enabled ? "On." : "Off, so nothing from this source reaches the catalogue."} {n(ev.published_runs)} run dates published.</li>
          {lastPublishedAgo && <li>Last added to the catalogue {lastPublishedAgo === "now" ? "just now" : `${lastPublishedAgo} ago`}.</li>}
        </ul>
        <Link href={pagesHref(filters)} className="inline-flex min-h-11 items-center text-subheadline text-tint-text">See all crawled pages</Link>
        </div>
      </details>

      <Section id="results" title="What this source added to the catalogue">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-subheadline">
            <thead>
              <tr><th className={th}>What</th><th className={`${th} text-right`}>Matched to ours</th><th className={`${th} text-right`}>New</th><th className={`${th} text-right`}>Unresolved</th></tr>
            </thead>
            <tbody className="divide-y divide-separator tabular-nums">
              <tr><td className="py-2 pr-3">Venues</td><td className="py-2 pr-3 text-right">{n(id.matched_venues)}</td><td className="py-2 pr-3 text-right">{n(id.crawler_venues)}</td><td className="py-2 text-right">{n(id.unresolved_venues)}</td></tr>
              <tr><td className="py-2 pr-3">Shows</td><td className="py-2 pr-3 text-right">{n(id.matched_shows)}</td><td className="py-2 pr-3 text-right">{n(id.crawler_shows)}</td><td className="py-2 text-right">{n(id.unresolved_events)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-subheadline">
          <span className="font-semibold">Run dates:</span> {n(ev.published_runs)} published · {n(ev.conflicting_runs)} conflicting · {n(ev.stale_runs)} stale · {n(ev.unsupported_closing)} without a confirmed closing date.
        </p>
      </Section>

      <RecentChanges actions={overview.recent_actions} />

      {data.scans.some(item => !item.is_current) && (
        <details className="min-w-0 rounded-md border border-separator bg-surface p-4">
          <summary className="min-h-11 cursor-pointer text-headline">Earlier readings</summary>
          <ul className="mt-2 flex flex-col divide-y divide-separator">
            {data.scans.filter(item => !item.is_current).map(item => (
              <li key={item.id} className="flex flex-wrap justify-between gap-x-4 py-2 text-subheadline">
                <span>{areaName(item.scope_key)}, started {shortDate(item.started_at)}</span>
                <Link href={`${sourcePath(key)}?area=${item.id}`} className="inline-flex min-h-11 items-center text-tint-text">View</Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="min-w-0 rounded-md border border-separator bg-surface p-4">
        <summary className="min-h-11 cursor-pointer text-headline">Cost and effort</summary>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-subheadline sm:grid-cols-3">
          <div><dt className="text-label-secondary">Attempts</dt><dd>{n(data.attempts)}</dd></div>
          <div><dt className="text-label-secondary">HTTP requests</dt><dd>{n(data.http_requests)}</dd></div>
          <div><dt className="text-label-secondary">Model calls</dt><dd>{data.model_calls === null ? "Not tracked" : n(data.model_calls)}</dd></div>
          <div><dt className="text-label-secondary">Model spend</dt><dd>${data.model_spend_usd.toFixed(4)}</dd></div>
          <div><dt className="text-label-secondary">Parser</dt><dd className="break-words">{source.adapter_version}</dd></div>
          <div><dt className="text-label-secondary">Last activity</dt><dd>{data.last_activity_at ? shortDateTime(data.last_activity_at) : "None yet"}</dd></div>
        </dl>
      </details>

      {canFix && areas.length > 0 && (
        <details className="min-w-0 rounded-md border border-separator bg-surface p-4">
          <summary className="min-h-11 cursor-pointer text-headline">Advanced</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-subheadline">
              Start a fresh pass of an area only if the site was reorganised or a new parser needs to see every page.
              {extras?.next_refresh_at ? ` Otherwise the directory refreshes itself (next: ${shortDate(extras.next_refresh_at)}).` : ""}
              {" "}The area’s current reading becomes an earlier reading.
            </p>
            <div className="flex flex-wrap gap-2">
              {areas.map(area => (
                <CrawlSourceControl key={area.id} source={key} operation="rediscover" scan={area.id} label={areas.length > 1 ? `Start a fresh pass: ${areaName(area.scope_key)}` : undefined}
                  disabled={!source.collection_enabled || Boolean(source.operator_paused_at || source.paused_reason)} />
              ))}
            </div>
          </div>
        </details>
      )}
    </>
  );
}

export default function CrawlSourcePage(props: PageProps<"/app/backstage/crawl/sources/[key]">) {
  return (
    <CrawlShell back={{ href: "/app/backstage/crawl", label: "Catalogue crawler" }} title="Crawl source">
      <SourceTitle params={props.params} />
      <Source params={props.params} searchParams={props.searchParams} />
    </CrawlShell>
  );
}

// The source's name as a heading, read from the route.
async function SourceTitle({ params }: { params: PageProps<"/app/backstage/crawl/sources/[key]">["params"] }) {
  const key = sourceKeyFromPath((await params).key);
  if (!isCrawlSource(key)) return null;
  return <h2 className="font-display text-title-2">{crawlSourceName(key)}</h2>;
}
