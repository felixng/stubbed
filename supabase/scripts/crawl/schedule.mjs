// What runs when, in one place with no imports. The crawler reads these values; the admin
// guide shows copies of them (apps/web/src/lib/crawl-schedule.ts) and a test fails if they differ
// from this file or from .github/workflows/catalogue-crawl.yml.

// The workflow cron: twice an hour, off the hour and half hour because top-of-hour schedules start latest.
export const CRON = '17,47 * * * *';
export const CRON_MINUTES = [17, 47];

// Seconds to wait before each retry of a failed page. After the last one the page is Failed
// and waits for an admin. (Rate limits wait for Retry-After or an hour and do not use this ladder.)
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];

// Each source gets its own allowance per run, and sources are read at the same time (they are
// different hosts, and per-host pacing is unchanged). Stopping on time is a checkpoint, not a failure.
export const SOURCE_RUN_PAGES = 150;
export const OFFICIAL_RUN_PAGES = 50;
export const MAX_RUN_PAGES = 400;
// A start that finds the previous run finished this recently with nothing due for every source exits at once.
export const FAST_EXIT_MINUTES = 10;
// The Supabase pg_cron job that starts the workflow on time (see the dispatch migration).
export const DISPATCH_JOB = 'catalogue-crawl-dispatch';
// A run stops by itself after this many minutes.
export const RUN_MINUTES = 20;
// The Actions job is killed after this many minutes. A run left open longer reads as interrupted.
export const JOB_TIMEOUT_MINUTES = 30;
export const INTERRUPTED_AFTER_MINUTES = 35;

export const DEFAULT_RUN_SPEND_USD = 1;
export const DEFAULT_DAILY_SPEND_USD = 2;
export const DEFAULT_SOURCE_DAILY_PAGES = 1000;

// How long before a page that was read successfully is read again (crawl_refresh_policy in
// supabase/migrations/20261107233921_incremental_crawl_scheduling.sql). Days.
export const REREAD_DAYS = {
  directory: 30,
  venueListingCurrentShows: 1,
  venueOther: 7,
  eventStartingSoonOrRunning: 1,
  eventFurtherOutOrUndated: 7,
  eventOtherwise: 30,
  eventClosed: 180,
};

export const STOP_REASONS = ['page_allowance', 'time_limit', 'daily_cap', 'daily_spend_cap', 'nothing_due', 'failed', 'cancelled'];
// How one source's part of a run ended.
export const SOURCE_STOPS = ['page_allowance', 'time_limit', 'daily_cap', 'nothing_due'];

// Daily limits from repository variables. A bad value falls back to the default.
export function dailyLimits(env = process.env) {
  const number = (key, fallback, max) => {
    const value = Number(env[key] ?? fallback);
    return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
  };
  return {
    dailySpendUsd: number('CRAWL_DAILY_SPEND_USD', DEFAULT_DAILY_SPEND_USD, 100),
    sourceDailyPages: Math.floor(number('CRAWL_SOURCE_DAILY_PAGES', DEFAULT_SOURCE_DAILY_PAGES, 100000)),
  };
}

// The model budget this run may use: its own cap, or what is left of the daily cap, whichever is less.
export function modelBudget({ runBudgetUsd, dailySpendUsd, spentLast24hUsd }) {
  const left = Math.max(0, dailySpendUsd - spentLast24hUsd);
  return { budgetUsd: Math.min(runBudgetUsd, left), capReached: left <= 0 };
}

// Pages one source may read in a run: CRAWL_SOURCE_RUN_PAGES (default 150, official 50 from
// CRAWL_OFFICIAL_RUN_PAGES), with CRAWL_SOURCE_RUN_PAGES_<SOURCE> (for example _PLAYBILL) to slow one
// source without the others. An adapter's own runPages replaces the default. Empty or invalid values fall back; nothing goes above MAX_RUN_PAGES.
export function runPagesFor(key, env = process.env, adapter = null) {
  const read = (value, fallback) => {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.min(Math.floor(number), MAX_RUN_PAGES) : fallback;
  };
  const base = key === 'official' ? read(env.CRAWL_OFFICIAL_RUN_PAGES, OFFICIAL_RUN_PAGES) : read(env.CRAWL_SOURCE_RUN_PAGES, adapter?.runPages ?? SOURCE_RUN_PAGES);
  return read(env[`CRAWL_SOURCE_RUN_PAGES_${String(key).toUpperCase()}`], base);
}

// A source's allowance this run: its own run allowance, trimmed to what is left of its rolling daily cap.
export function sourceAllowance({ runPages, dailyRemaining }) {
  const pages = Math.max(0, Math.min(runPages, dailyRemaining));
  return { pages, limitedBy: dailyRemaining < runPages ? 'daily_cap' : 'page_allowance' };
}

// Why one source stopped: it used its allowance (or its daily cap), it ran out of time, or nothing was due.
export function sourceStop({ pages, allowance, limitedBy, timeLimited }) {
  if (allowance.pages === 0) return 'daily_cap';
  if (pages >= allowance.pages) return limitedBy;
  return timeLimited ? 'time_limit' : 'nothing_due';
}

// Why a run ended, most important first.
export function stopReason({ failed, pageLimited, timeLimited, dailyCapped, modelCapReached }) {
  if (failed) return 'failed';
  if (pageLimited) return 'page_allowance';
  if (timeLimited) return 'time_limit';
  if (dailyCapped) return 'daily_cap';
  if (modelCapReached) return 'daily_spend_cap';
  return 'nothing_due';
}
