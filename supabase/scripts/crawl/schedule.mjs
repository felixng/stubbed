// What runs when, in one place with no imports. The crawler reads these values; the admin
// guide shows copies of them (apps/web/src/lib/crawl-schedule.ts) and a test fails if they differ
// from this file or from .github/workflows/catalogue-crawl.yml.

// The workflow cron: twice an hour, off the hour and half hour because top-of-hour schedules start latest.
export const CRON = '17,47 * * * *';
export const CRON_MINUTES = [17, 47];

// Seconds to wait before each retry of a failed page. After the last one the page is Failed
// and waits for an admin. (Rate limits wait for Retry-After or an hour and do not use this ladder.)
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];

// One run reads at most this many pages across all sources, split evenly between active sources.
export const PAGE_ALLOWANCE = 100;
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

export const STOP_REASONS = ['page_allowance', 'time_limit', 'daily_spend_cap', 'nothing_due', 'failed', 'cancelled'];

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

// Pages one source may read this run: an even share of what is left, never more than the source
// has left of its rolling daily cap. A source at its cap gets 0 and its share goes to the others.
export function pageAllowance({ remaining, sourcesLeft, dailyRemaining }) {
  if (remaining <= 0 || sourcesLeft <= 0) return 0;
  return Math.max(0, Math.min(Math.ceil(remaining / sourcesLeft), dailyRemaining));
}

// Why a run ended, most important first.
export function stopReason({ failed, remaining, timeLimited, modelCapReached }) {
  if (failed) return 'failed';
  if (remaining <= 0) return 'page_allowance';
  if (timeLimited) return 'time_limit';
  if (modelCapReached) return 'daily_spend_cap';
  return 'nothing_due';
}
