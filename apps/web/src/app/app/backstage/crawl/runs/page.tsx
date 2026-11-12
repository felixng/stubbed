import type { Metadata } from "next";
import Link from "next/link";

import { RecentChanges } from "@/components/app/admin/CrawlOverviewParts";
import { CrawlShell, Section } from "@/components/app/admin/CrawlShell";
import { ScheduleCard } from "@/components/app/admin/ScheduleCard";
import { RunHistoryTable } from "@/components/app/admin/RunHistoryTable";
import { CRAWL_HUB_PATH } from "@/lib/admin-crawl";
import { TRIGGERS, triggerLabel, type CrawlSchedule } from "@/lib/crawl-schedule";
import { getDispatch, getOverview } from "@/lib/crawl-hub-data";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Crawl run history" };

const PAGE_SIZE = 25;
const chip = "inline-flex min-h-11 items-center rounded-pill bg-fill px-3 text-subheadline font-semibold text-tint-text aria-[current=page]:bg-tint-fill";
const RUNS_PATH = `${CRAWL_HUB_PATH}/runs`;

function href(trigger: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (trigger) params.set("trigger", trigger);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${RUNS_PATH}?${query}` : RUNS_PATH;
}

async function History({ searchParams }: Pick<PageProps<"/app/backstage/crawl/runs">, "searchParams">) {
  const input = await searchParams;
  const trigger = TRIGGERS.find(item => item === input.trigger);
  const page = typeof input.page === "string" && /^[1-9]\d{0,4}$/.test(input.page) ? Number(input.page) : 1;
  const { supabase } = await ownerContext();
  const { data, error } = await supabase.rpc("admin_crawl_schedule", { page_size: PAGE_SIZE, page_offset: (page - 1) * PAGE_SIZE, for_trigger: trigger });
  if (error || !data) return <p>Couldn’t load the run history.</p>;
  const schedule = data as unknown as CrawlSchedule;
  const [dispatch, overview] = await Promise.all([getDispatch(), getOverview()]);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, schedule.total);
  return (
    <>
      <ScheduleCard schedule={schedule} dispatch={dispatch} />
      <nav aria-label="Started by" className="flex flex-wrap gap-2">
        <Link href={href(undefined, 1)} aria-current={!trigger ? "page" : undefined} className={chip}>All</Link>
        {TRIGGERS.map(item => <Link key={item} href={href(item, 1)} aria-current={trigger === item ? "page" : undefined} className={chip}>{triggerLabel(item)}</Link>)}
      </nav>
      <Section id="runs" title="Runs" hint="Newest first. A run still open after 35 minutes was interrupted.">
        <RunHistoryTable runs={schedule.runs} />
        <nav aria-label="Pages of runs" className="flex flex-wrap items-center gap-4 text-subheadline">
          <span>{first <= last ? `${first}–${last} of ${schedule.total}` : `${schedule.total} runs`}</span>
          {page > 1 && <Link className="inline-flex min-h-11 items-center text-tint-text" href={href(trigger, page - 1)}>Previous</Link>}
          {last < schedule.total && <Link className="inline-flex min-h-11 items-center text-tint-text" href={href(trigger, page + 1)}>Next</Link>}
        </nav>
      </Section>
      {overview && <RecentChanges actions={overview.recent_actions} />}
    </>
  );
}

export default function CrawlRunHistoryPage(props: PageProps<"/app/backstage/crawl/runs">) {
  return (
    <CrawlShell back={{ href: CRAWL_HUB_PATH, label: "Catalogue crawler" }} title="Run history"
      intro="When the crawler runs, what limits it, and every run so far.">
      <History searchParams={props.searchParams} />
    </CrawlShell>
  );
}
