import type { Metadata } from "next";
import Link from "next/link";

import { CrawlBar } from "@/components/app/admin/CrawlBar";
import { CrawlSwitch } from "@/components/app/admin/CrawlSwitch";
import { NeedsAttention, RecentChanges } from "@/components/app/admin/CrawlOverviewParts";
import { CrawlShell, Section } from "@/components/app/admin/CrawlShell";
import { PipelineDiagram, type PipelineStep } from "@/components/app/admin/PipelineDiagram";
import { RunHistoryTable } from "@/components/app/admin/RunHistoryTable";
import { ScheduleCard } from "@/components/app/admin/ScheduleCard";
import {
  CRAWL_HUB_PATH, CRAWL_STEPS, OFFICIAL_SITES_PATH, attentionItems, crawlBuckets, crawlSourceName, crawlingState, hubHeadline,
  shortDateTime, sourcePath, type CrawlOverview, type CrawlSourceProgress,
} from "@/lib/admin-crawl";
import type { CrawlSchedule } from "@/lib/crawl-schedule";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Catalogue crawler" };

// The two venue-first sources. The older official-sites crawler has its own shape and its own row.
const SOURCES = ["london_theatre", "playbill"] as const;
const number = new Intl.NumberFormat("en-GB");
const n = (value: number) => number.format(value);

type Supabase = Awaited<ReturnType<typeof ownerContext>>["supabase"];
async function progressFor(supabase: Supabase, key: string) {
  const { data, error } = await supabase.rpc("crawl_source_progress", { for_source: key, for_stage: "venue", page_size: 1, page_offset: 0 });
  return error || !data ? null : (data as unknown as CrawlSourceProgress);
}

async function Hub() {
  const { supabase } = await ownerContext();
  const [loaded, overviewRes, flagsRes, scheduleRes] = await Promise.all([
    Promise.all(SOURCES.map(key => progressFor(supabase, key))),
    supabase.rpc("admin_crawl_overview"),
    supabase.rpc("admin_catalogue_flags"),
    supabase.rpc("admin_crawl_schedule", { page_size: 5, page_offset: 0 }),
  ]);
  const progress = loaded.filter((p): p is CrawlSourceProgress => p !== null);
  if (progress.length !== SOURCES.length || overviewRes.error || !overviewRes.data) return <p>Couldn’t load crawler status.</p>;
  const overview = overviewRes.data as unknown as CrawlOverview;
  const schedule = scheduleRes.error || !scheduleRes.data ? null : (scheduleRes.data as unknown as CrawlSchedule);
  const flags = new Map(((flagsRes.data ?? []) as { flag: string; enabled: boolean }[]).map(row => [row.flag, row.enabled]));
  const chips = flags.get("catalogue_run_chips_enabled");
  const allSources = progress[0].sources;

  const rows = SOURCES.map((key, index) => {
    const data = progress[index];
    const source = allSources.find(item => item.source_key === key)!;
    return { key, data, source, state: crawlingState(source) };
  });
  const total = (stage: "directory" | "venue" | "event") => rows.reduce((sum, row) => {
    const counts = row.data.stages[stage], buckets = crawlBuckets(counts);
    return { discovered: sum.discovered + counts.discovered, done: sum.done + buckets.done, stuck: sum.stuck + buckets.stuck, retrying: sum.retrying + buckets.retrying };
  }, { discovered: 0, done: 0, stuck: 0, retrying: 0 });
  const find = total("directory"), venues = total("venue"), shows = total("event");
  const stuck = find.stuck + venues.stuck + shows.stuck;
  const retrying = find.retrying + venues.retrying + shows.retrying;
  const identities = rows.reduce((sum, row) => ({
    matched: sum.matched + row.data.identities.matched_venues, created: sum.created + row.data.identities.crawler_venues,
    unresolved: sum.unresolved + row.data.identities.unresolved_venues,
  }), { matched: 0, created: 0, unresolved: 0 });
  const unchecked = SOURCES.reduce((sum, key) => sum + (overview.sources[key]?.unchecked_pages ?? 0), 0);
  const publishing = rows.filter(row => row.source.publication_enabled).map(row => crawlSourceName(row.key));
  const stillFinding = rows.some(row => row.data.scan?.enumeration_status === "enumerating");
  const official = allSources.find(item => item.source_key === "official");

  const steps: PipelineStep[] = [
    { ...CRAWL_STEPS[0], summary: `${n(find.done)} of ${n(find.discovered)} directory pages read`, progress: { done: find.done, total: find.discovered, stuck: find.stuck }, tone: find.stuck ? "bad" : "good" },
    { ...CRAWL_STEPS[1], summary: `${n(venues.done)} of ${n(venues.discovered)} venue pages read`, progress: { done: venues.done, total: venues.discovered, stuck: venues.stuck }, tone: venues.stuck ? "bad" : venues.done < venues.discovered ? "waiting" : "good" },
    { ...CRAWL_STEPS[2], summary: `${n(shows.done)} of ${n(shows.discovered)} show pages read`, progress: { done: shows.done, total: shows.discovered, stuck: shows.stuck }, tone: shows.stuck ? "bad" : shows.done < shows.discovered ? "waiting" : "good" },
    { ...CRAWL_STEPS[3], summary: `${n(identities.matched)} venues matched, ${n(identities.created)} new, ${n(identities.unresolved)} unresolved. ${n(unchecked)} pages waiting to be checked.`, tone: unchecked ? "waiting" : "neutral" },
    { ...CRAWL_STEPS[4], summary: `${n(overview.run_dates.from_sources)} run dates published. ${publishing.length ? `Publishing is on for ${publishing.join(" and ")}.` : "Publishing is off for every source."}`, tone: overview.run_dates.from_sources ? "good" : "neutral" },
    { ...CRAWL_STEPS[5], summary: `Run chips are ${chips ? "on" : "off"}. Autofill is locked.`, tone: chips ? "good" : "neutral" },
  ];

  return (
    <>
      <p className="font-display text-title-2">
        {hubHeadline(rows.map(row => ({ key: row.key, state: row.state, publishing: row.source.publication_enabled })), stuck, retrying, overview.run_dates.from_sources)}
      </p>

      {schedule
        ? <ScheduleCard schedule={schedule} sources={allSources} />
        : <p className="text-subheadline text-label-secondary">Couldn’t load the schedule.</p>}

      <Section id="pipeline" title="How far the crawler has got" hint="Both sources combined. Each step reads the one before it; nothing reaches members until Publish.">
        <PipelineDiagram steps={steps} label="Crawler steps" />
        {stillFinding && <p className="text-footnote text-label-secondary">Totals grow while a source is still finding venues. They are pages found so far, not everything on the site.</p>}
      </Section>

      <Section id="sources" title="Sources">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-subheadline">
            <thead>
              <tr className="text-footnote text-label-secondary">
                <th className="py-2 pr-3 font-semibold">Source</th>
                <th className="py-2 pr-3 font-semibold">Crawling</th>
                <th className="py-2 pr-3 font-semibold">Publishing</th>
                {CRAWL_STEPS.slice(0, 3).map(step => <th key={step.key} className="py-2 pr-3 font-semibold">{step.name}</th>)}
                <th className="py-2 font-semibold">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator align-top">
              {rows.map(row => (
                <tr key={row.key}>
                  <td className="py-3 pr-3"><Link href={sourcePath(row.key)} className="inline-flex min-h-11 items-center font-semibold text-tint-text">{crawlSourceName(row.key)}</Link></td>
                  <td className="py-3 pr-3">{row.state.label}</td>
                  <td className="py-3 pr-3">{row.source.publication_enabled ? "On" : "Off"}</td>
                  {(["directory", "venue", "event"] as const).map(stage => {
                    const counts = row.data.stages[stage], buckets = crawlBuckets(counts);
                    return (
                      <td key={stage} className="py-3 pr-3">
                        <span className="tabular-nums">{n(buckets.done)} / {n(counts.discovered)}</span>
                        <CrawlBar done={buckets.done} stuck={buckets.stuck} total={counts.discovered} label={`${n(buckets.done)} of ${n(counts.discovered)} done`} />
                        {buckets.stuck > 0 && <span className="text-footnote font-semibold text-destructive">{n(buckets.stuck)} stuck</span>}
                      </td>
                    );
                  })}
                  <td className="py-3 text-label-secondary">{row.data.last_activity_at ? shortDateTime(row.data.last_activity_at) : "None yet"}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-3"><Link href={sourcePath("official")} className="inline-flex min-h-11 items-center font-semibold text-tint-text">{crawlSourceName("official")}</Link></td>
                <td className="py-3 pr-3">{official ? crawlingState(official).label : "Unknown"}</td>
                <td className="py-3 pr-3">{official?.publication_enabled ? "On" : "Off"}</td>
                <td colSpan={4} className="py-3 text-label-secondary">
                  Older, AI-assisted crawler with its own steps. {n(overview.official.sites)} sites, <Link href={`${OFFICIAL_SITES_PATH}?attention=1`} className="text-tint-text">{n(overview.official.sites_needing_attention)} need attention</Link>.
                  {overview.official.last_run_at ? ` Last run ${shortDateTime(overview.official.last_run_at)}.` : " No runs yet."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <NeedsAttention items={attentionItems(overview, allSources)} />

      <Section id="suggestions" title="Suggestions to members" hint="For everyone, on web and iOS. These switches stay as you leave them.">
        <div className="flex flex-col divide-y divide-separator">
          {chips !== undefined && (
            <CrawlSwitch kind={{ type: "run_chips" }} label="Run chips" checked={chips}
              description={`“On at this venue” suggestions from published run dates. Uses ${n(overview.run_dates.total)} published run dates (${n(overview.run_dates.from_sources)} from London Theatre and Playbill).`}
              note={chips && overview.run_dates.total === 0 ? "On, but has nothing to suggest yet." : undefined} />
          )}
        </div>
        <p className="text-subheadline">
          <span className="font-semibold">Autofill:</span> locked until it scores 99% on 100 labelled cases. Not yet measured.
        </p>
      </Section>

      <RecentChanges actions={overview.recent_actions} />

      {schedule && (
        <Section id="recent-runs" title="Recent runs">
          <RunHistoryTable runs={schedule.runs} />
          <Link href={`${CRAWL_HUB_PATH}/runs`} className="inline-flex min-h-11 items-center text-subheadline text-tint-text">All runs</Link>
        </Section>
      )}
    </>
  );
}

export default function CrawlHubPage() {
  return (
    <CrawlShell back={{ href: "/app/backstage", label: "Backstage" }} title="Catalogue crawler"
      intro="Where the crawler is, and what needs you. Nothing here reaches members until you publish.">
      <Hub />
    </CrawlShell>
  );
}
