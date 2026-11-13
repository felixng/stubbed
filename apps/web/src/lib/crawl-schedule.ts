// What the crawler runs when, for the admin. The values below are copies of
// supabase/scripts/crawl/schedule.mjs (which the crawler reads) and of the cron in
// .github/workflows/catalogue-crawl.yml; test/crawl-schedule.test.ts fails if they drift.
import { crawlSourceName, type SourceNames } from "@/lib/admin-crawl";

export const CRON = "17,47 * * * *";
export const CRON_MINUTES = [17, 47] as const;
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200] as const;
// Each source has its own allowance per run, and sources are read at the same time.
export const SOURCE_RUN_PAGES = 150;
export const OFFICIAL_RUN_PAGES = 50;
export const MAX_RUN_PAGES = 400;
export const FAST_EXIT_MINUTES = 10;
export const RUN_MINUTES = 20;
export const JOB_TIMEOUT_MINUTES = 30;
export const INTERRUPTED_AFTER_MINUTES = 35;
export const DEFAULT_RUN_SPEND_USD = 1;
export const DEFAULT_DAILY_SPEND_USD = 2;
export const DEFAULT_SOURCE_DAILY_PAGES = 1000;
// Days before a page read successfully is read again (crawl_refresh_policy).
export const REREAD_DAYS = {
  directory: 30, venueListingCurrentShows: 1, venueOther: 7,
  eventStartingSoonOrRunning: 1, eventFurtherOutOrUndated: 7, eventOtherwise: 30, eventClosed: 180,
} as const;
const HOUR = 3_600_000;

export type WorkerTrigger = "schedule" | "manual" | "admin_start";
export type StopReason = "page_allowance" | "time_limit" | "daily_cap" | "daily_spend_cap" | "nothing_due" | "failed" | "cancelled";
export type SourceStop = "page_allowance" | "time_limit" | "daily_cap" | "nothing_due" | "failed";
export type StartedVia = "supabase" | "github_schedule" | null;
export type SourcePages = { pages?: number; cap_hit?: boolean; stop?: SourceStop; error?: string; model_spend_usd?: number; runs?: { observed_segments?: number; inactive?: boolean } };
export type WorkerRun = {
  id: string; started_at: string; finished_at: string | null; trigger: WorkerTrigger; started_via?: StartedVia; github_run_id?: string | null; log_url: string | null;
  source_filter?: string | null; stage_filter?: string | null; scope_filter?: string | null;
  per_source: Record<string, SourcePages>; stop_reason: StopReason | null; model_spend_usd: number | string;
  limits?: { source_run_pages?: number; official_run_pages?: number; allowances?: Record<string, number>; daily_spend_usd?: number; source_daily_pages?: number; run_spend_usd?: number };
  interrupted?: boolean;
};
export type SourceForecast = { claimable: boolean; new: number; retry: number; reread: number };
export type CrawlSchedule = {
  server_time: string;
  running: { id: string; started_at: string; trigger: WorkerTrigger; started_via?: StartedVia; log_url: string | null } | null;
  last_run: WorkerRun | null;
  limits: WorkerRun["limits"] | null;
  total: number;
  runs: WorkerRun[];
  window: { started_at: string; per_source: Record<string, SourcePages>; model_spend_usd: number | string }[];
  forecast: Record<string, SourceForecast>;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const clock = (date: Date | string | number) => `${timeFormat.format(new Date(date))} UTC`;
export const dayOf = (date: Date | string | number) => dayFormat.format(new Date(date));

// The next scheduled start after a moment, at :17 or :47. GitHub often starts it later.
export function nextRunAfter(after: Date | number): Date {
  const next = new Date(after);
  next.setUTCSeconds(0, 0);
  // Starting from the floor of the minute, the first matching minute is always after `after`.
  for (let step = 0; step < 120; step++) {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    if ((CRON_MINUTES as readonly number[]).includes(next.getUTCMinutes())) return next;
  }
  return next;
}

export const triggerLabel = (trigger: WorkerTrigger) => ({ schedule: "Schedule", manual: "By hand", admin_start: "Start a crawl" })[trigger];
// Where a scheduled start came from, when it matters.
export const viaLabel = (via: StartedVia | undefined) => via === "supabase" ? "Started by Supabase on time" : via === "github_schedule" ? "Started by GitHub’s schedule" : null;
export const TRIGGERS = ["schedule", "manual", "admin_start"] as const;

export function stopReasonText(reason: StopReason | null, interrupted = false): string {
  if (interrupted) return "Interrupted";
  switch (reason) {
    case "page_allowance": return "Used its page allowance";
    case "time_limit": return "Ran out of time";
    case "daily_cap": return "Reached a daily page limit";
    case "daily_spend_cap": return "Daily model limit reached";
    case "nothing_due": return "Nothing more was due";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    default: return "Running";
  }
}

export function durationText(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "Not finished";
  const seconds = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

// "London Theatre 34 · Playbill 33 · Official theatre sites 33"
export function pagesText(perSource: WorkerRun["per_source"], names: SourceNames): string {
  const parts = Object.entries(perSource ?? {}).map(([key, value]) => `${crawlSourceName(key, names)} ${(value.pages ?? 0).toLocaleString("en-GB")}`);
  return parts.length ? parts.join(" · ") : "No pages";
}
export const publishedRunDates = (perSource: WorkerRun["per_source"]) =>
  Object.values(perSource ?? {}).reduce((sum, value) => sum + (value.runs?.observed_segments ?? 0), 0);

// The time a cap frees up: when enough of the last 24 hours has aged out to get back under it.
export function resumesAt(entries: { startedAt: string; amount: number }[], cap: number): Date | null {
  let used = entries.reduce((sum, entry) => sum + entry.amount, 0);
  if (used < cap) return null;
  for (const entry of [...entries].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    used -= entry.amount;
    if (used < cap) return new Date(new Date(entry.startedAt).getTime() + 24 * HOUR);
  }
  return null;
}

export type TodaysLimits = {
  model: { used: number; cap: number; resumes: Date | null };
  sources: Record<string, { used: number; cap: number; resumes: Date | null }>;
};
export function todaysLimits(schedule: CrawlSchedule, sourceKeys: string[]): TodaysLimits {
  const cap = schedule.limits?.daily_spend_usd ?? DEFAULT_DAILY_SPEND_USD;
  const pageCap = schedule.limits?.source_daily_pages ?? DEFAULT_SOURCE_DAILY_PAGES;
  const spend = schedule.window.map(run => ({ startedAt: run.started_at, amount: Number(run.model_spend_usd) || 0 }));
  const sources: TodaysLimits["sources"] = {};
  for (const key of sourceKeys) {
    const entries = schedule.window.map(run => ({ startedAt: run.started_at, amount: run.per_source?.[key]?.pages ?? 0 }));
    sources[key] = { used: entries.reduce((sum, entry) => sum + entry.amount, 0), cap: pageCap, resumes: resumesAt(entries, pageCap) };
  }
  return { model: { used: spend.reduce((sum, entry) => sum + entry.amount, 0), cap, resumes: resumesAt(spend, cap) }, sources };
}

// "No run in the last 2 hours" means the schedule is probably off (CRAWL_LOOP_ENABLED).
export function scheduleAlert(schedule: CrawlSchedule): string | null {
  const now = new Date(schedule.server_time).getTime();
  if (schedule.running) return null;
  const newest = schedule.runs[0] ?? schedule.last_run;
  if (!newest) return "No run has been recorded yet. The schedule may be off; check CRAWL_LOOP_ENABLED.";
  return now - new Date(newest.started_at).getTime() > 2 * HOUR
    ? "No run in the last 2 hours. The schedule may be off; check CRAWL_LOOP_ENABLED." : null;
}

// What the next run will do for a source: pages due now, and about how many it will read.
export function nextRunPlan(forecast: SourceForecast | undefined, allowance: number, dailyRemaining: number) {
  const due = (forecast?.new ?? 0) + (forecast?.retry ?? 0) + (forecast?.reread ?? 0);
  return { due, thisRun: Math.min(due, allowance, dailyRemaining) };
}
// The pages a source may read in one run, from the limits the last run recorded (or the defaults).
export const runAllowance = (limits: CrawlSchedule["limits"], source: string) =>
  limits?.allowances?.[source] ?? (source === "official" ? limits?.official_run_pages ?? OFFICIAL_RUN_PAGES : limits?.source_run_pages ?? SOURCE_RUN_PAGES);

export type NextRow = {
  status: "pending" | "leased" | "retry_wait" | "blocked" | "failed" | "succeeded";
  consecutive_failures?: number | null; available_at: string; refresh_at?: string | null;
  last_success_at: string | null; last_error: string | null;
};
// Who acts next, in words. Automatic things say when; things that need an admin say so.
export function nextActionText(row: NextRow, now: Date = new Date()): string {
  const nextRun = clock(nextRunAfter(now));
  switch (row.status) {
    case "pending": return `Queued. Read in an upcoming run (next run about ${nextRun}).`;
    case "leased": return "Being read right now.";
    case "retry_wait": {
      if (row.last_error && /answered 429\b/.test(row.last_error)) return `The site asked us to wait until ${clock(row.available_at)}. Automatic.`;
      const attempt = row.consecutive_failures ? ` Retry ${row.consecutive_failures} of ${RETRY_DELAYS_SECONDS.length}.` : "";
      const after = nextRunAfter(Math.max(new Date(row.available_at).getTime(), now.getTime()));
      return `Tries again automatically from ${clock(row.available_at)} (next run after that: about ${clock(after)}).${attempt}`;
    }
    case "failed": return `Gave up after ${plural(RETRY_DELAYS_SECONDS.length, "retry", "retries")}. Won’t retry by itself. Retry if you’ve fixed the cause.`;
    case "blocked": return "The site blocked us, so the whole source is paused. Won’t resume by itself.";
    case "succeeded": {
      const base = row.refresh_at ?? (row.last_success_at ? new Date(new Date(row.last_success_at).getTime() + REREAD_DAYS.directory * 24 * HOUR).toISOString() : null);
      if (!base) return "Read. Re-read automatically later.";
      return new Date(base).getTime() <= now.getTime() ? `Due to be re-read automatically in the next run (about ${nextRun}).` : `Re-read automatically on ${dayOf(base)}.`;
    }
  }
}

export type DispatchRow = { sent_at: string; outcome: "sent" | "token_missing" | "send_failed"; status_code: number | null; error: string | null };
export type CrawlDispatch = {
  job: { schedule: string; active: boolean } | null;
  token: "missing" | "untested" | "working" | "failing";
  recent: DispatchRow[];
};
const failed = (row: DispatchRow) => row.outcome === "send_failed" || Boolean(row.error) || (row.status_code ?? 0) >= 300;

// What the trigger from Supabase is doing, in words.
export function dispatchText(dispatch: CrawlDispatch): string {
  const sent = dispatch.recent.find(row => row.outcome !== "token_missing");
  const last = sent ? `Last start sent ${clock(sent.sent_at)}: ${sent.status_code === 204 ? "GitHub accepted it (204)" : sent.error ? `failed (${sent.status_code ?? "no answer"}: ${sent.error})` : sent.status_code ? `GitHub answered ${sent.status_code}` : "waiting for GitHub’s answer"}.` : "";
  switch (dispatch.token) {
    case "missing": return "Not set up: the GitHub token is missing, so Supabase isn’t starting runs. GitHub’s own schedule is the only trigger, and it is often late.";
    case "untested": return "The GitHub token is set. No start has been sent with it yet.";
    case "working": return `Supabase starts the crawl at :${CRON_MINUTES[0]} and :${CRON_MINUTES[1]}. The token works. ${last}`;
    case "failing": return `Supabase tried to start the crawl but GitHub refused. ${last}`;
  }
}
// Two failed starts in a row is something an admin must fix.
export function dispatchFailing(dispatch: CrawlDispatch): { detail: string } | null {
  const sent = dispatch.recent.filter(row => row.outcome !== "token_missing").slice(0, 2);
  if (sent.length < 2 || !sent.every(failed)) return null;
  const row = sent[0];
  return { detail: `${row.status_code ? `GitHub answered ${row.status_code}` : "No answer from GitHub"}${row.error ? `: ${row.error}` : ""}` };
}
