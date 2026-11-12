import { cache } from "react";

import type { CrawlOverview, CrawlSourceProgress } from "@/lib/admin-crawl";
import type { CrawlSummary } from "@/lib/crawl-summary";
import type { CrawlDispatch, CrawlSchedule } from "@/lib/crawl-schedule";
import { ownerContext } from "@/lib/supabase/data";

// The hub reads several RPCs. While a crawl run is active the database is busy, and an RPC can hit the
// 8 second statement limit. Each read is tried twice and fails alone, so one slow call never blanks the page.
type Result<T> = { data: T | null; error: unknown };
async function twice<T>(call: () => PromiseLike<Result<T>>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await call();
      if (!error && data) return data;
    } catch { /* fall through to the retry */ }
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 400));
  }
  return null;
}

// The two venue-first sources. The older official-sites crawler has its own shape.
export const HUB_SOURCES = ["london_theatre", "playbill"] as const;

// cache() makes the headline and the details share one database call per request.
export const getProgress = cache(async (key: string) => {
  const { supabase } = await ownerContext();
  return twice<CrawlSourceProgress>(async () =>
    (await supabase.rpc("crawl_source_progress", { for_source: key, for_stage: "venue", page_size: 1, page_offset: 0 })) as unknown as Result<CrawlSourceProgress>);
});
// One light read of every source's totals and areas: pages known, read, waiting and stuck across all current areas.
export const getSummary = cache(async () => {
  const { supabase } = await ownerContext();
  return twice<CrawlSummary>(async () => (await supabase.rpc("crawl_source_summary")) as unknown as Result<CrawlSummary>);
});
export const getOverview = cache(async () => {
  const { supabase } = await ownerContext();
  return twice<CrawlOverview>(async () => (await supabase.rpc("admin_crawl_overview")) as unknown as Result<CrawlOverview>);
});
export const getFlags = cache(async () => {
  const { supabase } = await ownerContext();
  const rows = await twice<{ flag: string; enabled: boolean }[]>(async () => (await supabase.rpc("admin_catalogue_flags")) as unknown as Result<{ flag: string; enabled: boolean }[]>);
  return rows ? new Map(rows.map(row => [row.flag, row.enabled])) : null;
});
export const getSchedule = cache(async () => {
  const { supabase } = await ownerContext();
  return twice<CrawlSchedule>(async () => (await supabase.rpc("admin_crawl_schedule", { page_size: 5, page_offset: 0 })) as unknown as Result<CrawlSchedule>);
});
export const getDispatch = cache(async () => {
  const { supabase } = await ownerContext();
  return twice<CrawlDispatch>(async () => (await supabase.rpc("admin_crawl_dispatch")) as unknown as Result<CrawlDispatch>);
});
