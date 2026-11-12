import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CrawlPageRow } from "@/components/app/admin/CrawlPageRow";
import { CrawlShell } from "@/components/app/admin/CrawlShell";
import {
  CRAWL_BUCKETS, CRAWL_BUCKET_LABELS, CRAWL_PAGE_SIZE, CRAWL_STAGES, CRAWL_STEPS, crawlBuckets, crawlPagesFilters,
  crawlSourceName, isCrawlSource, pagesHref, sourceKeyFromPath, sourcePath,
  type CrawlSourceProgress, type CrawlStage, type CrawlTaskResult,
} from "@/lib/admin-crawl";
import { BackLink } from "@/components/ui/BackLink";
import { ownerContext } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Crawled pages" };

const number = new Intl.NumberFormat("en-GB");
const chip = "inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-fill px-3 text-subheadline font-semibold text-tint-text aria-[current=page]:bg-tint-fill";

async function Pages({ params, searchParams }: Pick<PageProps<"/app/backstage/crawl/sources/[key]/pages">, "params" | "searchParams">) {
  const source = sourceKeyFromPath((await params).key);
  if (!isCrawlSource(source) || source === "official") notFound();
  const filters = crawlPagesFilters(source, await searchParams);
  const { supabase } = await ownerContext();
  const { data: payload, error } = await supabase.rpc("crawl_source_progress", {
    for_source: source, for_generation: filters.scan, for_stage: filters.step,
    for_status: filters.status, page_size: CRAWL_PAGE_SIZE, page_offset: (filters.page - 1) * CRAWL_PAGE_SIZE,
  });
  if (error || !payload) return <p>Couldn’t load these pages.</p>;
  const data = payload as unknown as CrawlSourceProgress;
  const scan = data.scan;
  const { data: resultRows, error: resultsError } = data.rows.length
    ? await supabase.rpc("admin_crawl_task_results", { for_tasks: data.rows.map(row => row.id) })
    : { data: {}, error: null };
  const results = (resultRows ?? {}) as Record<string, CrawlTaskResult>;
  const buckets = crawlBuckets(data.stages[filters.step]);
  const first = (filters.page - 1) * CRAWL_PAGE_SIZE + 1;
  const last = Math.min(filters.page * CRAWL_PAGE_SIZE, data.filtered_total);

  return (
    <>
      <nav aria-label="Step" className="flex flex-wrap gap-2">
        {CRAWL_STAGES.map(stage => (
          <Link key={stage} href={pagesHref(filters, { step: stage as CrawlStage, status: undefined, page: 1 })}
            aria-current={filters.step === stage ? "page" : undefined} className={chip}>
            {CRAWL_STEPS.find(step => step.key === stage)?.name}
            <span className="font-normal text-label-secondary tabular-nums">{number.format(data.stages[stage].discovered)}</span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Status" className="flex flex-wrap gap-2">
        <Link href={pagesHref(filters, { status: undefined, page: 1 })} aria-current={!filters.status ? "page" : undefined} className={chip}>
          All <span className="font-normal text-label-secondary tabular-nums">{number.format(data.stages[filters.step].discovered)}</span>
        </Link>
        {CRAWL_BUCKETS.map(bucket => (
          <Link key={bucket} href={pagesHref(filters, { status: bucket, page: 1 })} aria-current={filters.status === bucket ? "page" : undefined} className={chip}>
            {CRAWL_BUCKET_LABELS[bucket]} <span className="font-normal text-label-secondary tabular-nums">{number.format(buckets[bucket])}</span>
          </Link>
        ))}
      </nav>
      {scan && data.rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.rows.map(row => <CrawlPageRow key={row.id} row={row} result={results[row.id]} known={!resultsError} source={source} scan={scan} />)}
        </ul>
      ) : <p className="text-subheadline text-label-secondary">No pages match.</p>}
      <nav aria-label="Page results" className="flex flex-wrap items-center gap-4 text-subheadline">
        <span>{first <= last ? `${number.format(first)}–${number.format(last)} of ${number.format(data.filtered_total)}` : `${number.format(data.filtered_total)} matching pages`}</span>
        {filters.page > 1 && <Link className="inline-flex min-h-11 items-center text-tint-text" href={pagesHref(filters, { page: filters.page - 1 })}>Previous</Link>}
        {last < data.filtered_total && <Link className="inline-flex min-h-11 items-center text-tint-text" href={pagesHref(filters, { page: filters.page + 1 })}>Next</Link>}
      </nav>
    </>
  );
}

export default function CrawlPagesPage(props: PageProps<"/app/backstage/crawl/sources/[key]/pages">) {
  return (
    <CrawlShell back={<Suspense fallback={null}><PagesBack params={props.params} /></Suspense>} title="Crawled pages"
      intro="Every page the crawler found for this source. Pick a step, then a status.">
      <Pages params={props.params} searchParams={props.searchParams} />
    </CrawlShell>
  );
}

// The back link goes to the source this list belongs to, so it needs the route's key.
async function PagesBack({ params }: { params: PageProps<"/app/backstage/crawl/sources/[key]/pages">["params"] }) {
  const source = sourceKeyFromPath((await params).key);
  if (!isCrawlSource(source) || source === "official") return null;
  return <BackLink href={sourcePath(source)}>{crawlSourceName(source)}</BackLink>;
}
