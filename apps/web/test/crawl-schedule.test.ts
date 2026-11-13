import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  CRON, CRON_MINUTES, DEFAULT_DAILY_SPEND_USD, DEFAULT_SOURCE_DAILY_PAGES, FAST_EXIT_MINUTES, INTERRUPTED_AFTER_MINUTES, JOB_TIMEOUT_MINUTES, MAX_RUN_PAGES, OFFICIAL_RUN_PAGES, SOURCE_RUN_PAGES,
  REREAD_DAYS, RETRY_DELAYS_SECONDS, RUN_MINUTES, dispatchFailing, dispatchText, durationText, nextActionText, nextRunAfter, nextRunPlan, pagesText, runAllowance, viaLabel,
  publishedRunDates, resumesAt, scheduleAlert, stopReasonText, todaysLimits, type CrawlDispatch, type CrawlSchedule,
} from "@/lib/crawl-schedule";

const repo = new URL("../../../", import.meta.url);

test("the schedule the admin shows is the schedule the workflow and the crawler use", async () => {
  const scripts = await import(new URL("supabase/scripts/crawl/schedule.mjs", repo).href);
  const workflow = readFileSync(new URL(".github/workflows/catalogue-crawl.yml", repo), "utf8");
  assert.equal(workflow.match(/cron:\s*"([^"]+)"/)?.[1], CRON, "the workflow cron and the displayed cron differ");
  assert.equal(CRON, `${CRON_MINUTES.join(",")} * * * *`);
  assert.deepEqual(CRON_MINUTES, scripts.CRON_MINUTES);
  assert.equal(CRON, scripts.CRON);
  assert.deepEqual(RETRY_DELAYS_SECONDS, scripts.RETRY_DELAYS_SECONDS);
  assert.deepEqual(REREAD_DAYS, scripts.REREAD_DAYS);
  assert.equal(SOURCE_RUN_PAGES, scripts.SOURCE_RUN_PAGES);
  assert.equal(OFFICIAL_RUN_PAGES, scripts.OFFICIAL_RUN_PAGES);
  assert.equal(MAX_RUN_PAGES, scripts.MAX_RUN_PAGES);
  assert.equal(FAST_EXIT_MINUTES, scripts.FAST_EXIT_MINUTES);
  assert.match(workflow, new RegExp(`vars.CRAWL_SOURCE_RUN_PAGES \\|\\| '${SOURCE_RUN_PAGES}'`));
  assert.match(workflow, new RegExp(`vars.CRAWL_OFFICIAL_RUN_PAGES \\|\\| '${OFFICIAL_RUN_PAGES}'`));
  const dispatch = readdirSync(new URL("supabase/migrations/", repo)).find(name => name.endsWith("_crawl_dispatch_from_supabase.sql"));
  assert.ok(dispatch, "the dispatch migration exists");
  assert.match(readFileSync(new URL(`supabase/migrations/${dispatch}`, repo), "utf8"), new RegExp(`cron\\.schedule\\(\\s*'catalogue-crawl-dispatch',\\s*'${CRON.replaceAll("*", "\\*")}'`), "the pg_cron schedule differs from what the admin shows");
  assert.equal(RUN_MINUTES, scripts.RUN_MINUTES);
  assert.equal(JOB_TIMEOUT_MINUTES, scripts.JOB_TIMEOUT_MINUTES);
  assert.equal(INTERRUPTED_AFTER_MINUTES, scripts.INTERRUPTED_AFTER_MINUTES);
  assert.equal(DEFAULT_DAILY_SPEND_USD, scripts.DEFAULT_DAILY_SPEND_USD);
  assert.equal(DEFAULT_SOURCE_DAILY_PAGES, scripts.DEFAULT_SOURCE_DAILY_PAGES);
  assert.match(workflow, new RegExp(`vars.CRAWL_DAILY_SPEND_USD \\|\\| '${DEFAULT_DAILY_SPEND_USD}'`));
  assert.match(workflow, new RegExp(`vars.CRAWL_SOURCE_DAILY_PAGES \\|\\| '${DEFAULT_SOURCE_DAILY_PAGES}'`));
  assert.match(workflow, new RegExp(`timeout-minutes: ${JOB_TIMEOUT_MINUTES}`));
});

test("the re-read intervals shown are the ones the database policy uses", () => {
  const sql = readFileSync(new URL("supabase/migrations/20261107233921_incremental_crawl_scheduling.sql", repo), "utf8");
  for (const days of new Set(Object.values(REREAD_DAYS))) {
    assert.match(sql, new RegExp(`interval '${days} days?'`), `no ${days} day interval in crawl_refresh_policy`);
  }
  assert.match(sql, /task_stage = 'directory' then interval '30 days'/);
  assert.match(sql, /then interval '1 day' else interval '7 days'/);
});

test("the next run is the next :17 or :47 after a moment", () => {
  const at = (iso: string) => nextRunAfter(new Date(iso)).toISOString();
  assert.equal(at("2026-11-12T10:00:00Z"), "2026-11-12T10:17:00.000Z");
  assert.equal(at("2026-11-12T10:17:00Z"), "2026-11-12T10:47:00.000Z", "a run at exactly :17 is not the next one");
  assert.equal(at("2026-11-12T10:47:30Z"), "2026-11-12T11:17:00.000Z");
  assert.equal(at("2026-11-12T23:50:00Z"), "2026-11-13T00:17:00.000Z");
});

const run = (overrides = {}) => ({
  id: "r1", started_at: "2026-11-12T12:17:00Z", finished_at: "2026-11-12T12:26:00Z", trigger: "schedule" as const, log_url: null,
  per_source: { london_theatre: { pages: 34 }, playbill: { pages: 33 } }, stop_reason: "page_allowance" as const, model_spend_usd: 0, ...overrides,
});
const schedule = (overrides: Partial<CrawlSchedule> = {}): CrawlSchedule => ({
  server_time: "2026-11-12T13:00:00Z", running: null, last_run: run(), limits: { daily_spend_usd: 2, source_daily_pages: 1000 }, total: 1,
  runs: [run()], window: [], forecast: {}, ...overrides,
});

test("run rows read in words", () => {
  assert.equal(pagesText(run().per_source, { london_theatre: "London Theatre", playbill: "Playbill" }), "London Theatre 34 · Playbill 33");
  assert.equal(pagesText({}, {}), "No pages");
  assert.equal(durationText("2026-11-12T12:17:00Z", "2026-11-12T12:26:05Z"), "9 min 05 s");
  assert.equal(durationText("2026-11-12T12:17:00Z", null), "Not finished");
  assert.equal(stopReasonText("daily_spend_cap"), "Daily model limit reached");
  assert.equal(stopReasonText(null, true), "Interrupted");
  assert.equal(publishedRunDates({ playbill: { runs: { observed_segments: 12 } }, london_theatre: { runs: { inactive: true } } }), 12);
});

test("a capped source says when it resumes: when enough of the last day has aged out", () => {
  const entries = [{ startedAt: "2026-11-12T01:00:00Z", amount: 600 }, { startedAt: "2026-11-12T06:00:00Z", amount: 300 }, { startedAt: "2026-11-12T11:00:00Z", amount: 100 }];
  assert.equal(resumesAt(entries, 1000)?.toISOString(), "2026-11-13T01:00:00.000Z");
  assert.equal(resumesAt(entries, 1001), null, "under the cap, nothing to wait for");
  const limits = todaysLimits(schedule({ window: entries.map(e => ({ started_at: e.startedAt, per_source: { playbill: { pages: e.amount } }, model_spend_usd: 0.5 })) }), ["playbill", "london_theatre"]);
  assert.equal(limits.sources.playbill.used, 1000);
  assert.equal(limits.sources.playbill.resumes?.toISOString(), "2026-11-13T01:00:00.000Z");
  assert.equal(limits.sources.london_theatre.resumes, null);
  assert.deepEqual([limits.model.used, limits.model.cap], [1.5, 2]);
});

test("the schedule warns when nothing has run for two hours", () => {
  assert.equal(scheduleAlert(schedule()), null);
  assert.match(scheduleAlert(schedule({ server_time: "2026-11-12T14:30:00Z" })) ?? "", /No run in the last 2 hours.*CRAWL_LOOP_ENABLED/);
  assert.equal(scheduleAlert(schedule({ server_time: "2026-11-12T14:30:00Z", running: { id: "x", started_at: "2026-11-12T14:17:00Z", trigger: "manual", log_url: null } })), null);
  assert.match(scheduleAlert(schedule({ runs: [], last_run: null })) ?? "", /No run has been recorded/);
});

test("the next run plan says how many pages are due and about how many it will read", () => {
  assert.deepEqual(nextRunPlan({ claimable: true, new: 80, retry: 26, reread: 0 }, runAllowance(null, "london_theatre"), 1000), { due: 106, thisRun: 106 });
  assert.deepEqual(nextRunPlan({ claimable: true, new: 6212, retry: 0, reread: 0 }, runAllowance({ allowances: { playbill: 30 } }, "playbill"), 1000), { due: 6212, thisRun: 30 }, "a slowed source reads only its own allowance");
  assert.equal(runAllowance(null, "official"), 50);
  assert.equal(runAllowance({ source_run_pages: 200 }, "playbill"), 200);
  assert.deepEqual(nextRunPlan({ claimable: true, new: 5, retry: 0, reread: 0 }, 150, 1000), { due: 5, thisRun: 5 });
  assert.deepEqual(nextRunPlan({ claimable: true, new: 6212, retry: 0, reread: 0 }, 150, 20), { due: 6212, thisRun: 20 }, "a source near its daily cap reads only what it has left");
});

test("every waiting page says who acts next", () => {
  const now = new Date("2026-11-12T13:55:00Z");
  const base = { available_at: "2026-11-12T14:02:00Z", refresh_at: null, last_success_at: null, last_error: null, consecutive_failures: 0 };
  assert.equal(nextActionText({ ...base, status: "retry_wait", consecutive_failures: 3, last_error: "Page answered 404" }, now),
    "Tries again automatically from 14:02 UTC (next run after that: about 14:17 UTC). Retry 3 of 5.");
  assert.equal(nextActionText({ ...base, status: "retry_wait", available_at: "2026-11-12T15:00:00Z", last_error: "The site answered 429" }, now),
    "The site asked us to wait until 15:00 UTC. Automatic.");
  assert.match(nextActionText({ ...base, status: "failed" }, now), /Gave up after 5 retries\. Won’t retry by itself\./);
  assert.match(nextActionText({ ...base, status: "blocked" }, now), /whole source is paused\. Won’t resume by itself\./);
  assert.equal(nextActionText({ ...base, status: "succeeded", refresh_at: "2026-11-18T09:00:00Z", last_success_at: "2026-11-11T09:00:00Z" }, now), "Re-read automatically on 18 Nov.");
  assert.equal(nextActionText({ ...base, status: "succeeded", refresh_at: null, last_success_at: "2026-11-01T09:00:00Z" }, now), "Re-read automatically on 1 Dec.");
  assert.match(nextActionText({ ...base, status: "succeeded", refresh_at: "2026-11-10T09:00:00Z" }, now), /Due to be re-read automatically in the next run \(about 14:17 UTC\)/);
  assert.equal(nextActionText({ ...base, status: "pending" }, now), "Queued. Read in an upcoming run (next run about 14:17 UTC).");
  assert.equal(nextActionText({ ...base, status: "leased" }, now), "Being read right now.");
});

const ok = (sentAt: string) => ({ sent_at: sentAt, outcome: "sent" as const, status_code: 204, error: null });
const refused = (sentAt: string) => ({ sent_at: sentAt, outcome: "sent" as const, status_code: 401, error: '{"message":"Bad credentials"}' });
const dispatch = (token: CrawlDispatch["token"], recent: CrawlDispatch["recent"]): CrawlDispatch => ({ job: { schedule: CRON, active: true }, token, recent });

test("the trigger from Supabase is described by what it is doing", () => {
  assert.match(dispatchText(dispatch("missing", [])), /Not set up: the GitHub token is missing.*often late/);
  assert.match(dispatchText(dispatch("untested", [])), /token is set\. No start has been sent/);
  assert.equal(dispatchText(dispatch("working", [ok("2026-11-12T10:47:00Z")])), "Supabase starts the crawl at :17 and :47. The token works. Last start sent 10:47 UTC: GitHub accepted it (204).");
  assert.match(dispatchText(dispatch("failing", [refused("2026-11-12T10:47:00Z")])), /GitHub refused\. Last start sent 10:47 UTC: failed \(401: .*Bad credentials/);
  assert.match(dispatchText(dispatch("working", [{ sent_at: "2026-11-12T10:47:00Z", outcome: "sent", status_code: null, error: null }])), /waiting for GitHub’s answer/);
});

test("two failed starts in a row need an admin; one failure or a missing token does not", () => {
  assert.equal(dispatchFailing(dispatch("failing", [refused("2026-11-12T10:47:00Z")])), null, "one failure is not yet a pattern");
  assert.match(dispatchFailing(dispatch("failing", [refused("2026-11-12T10:47:00Z"), refused("2026-11-12T10:17:00Z")]))?.detail ?? "", /GitHub answered 401: .*Bad credentials/);
  assert.equal(dispatchFailing(dispatch("failing", [refused("2026-11-12T10:47:00Z"), ok("2026-11-12T10:17:00Z")])), null, "a start that worked in between breaks the run");
  const missing = { sent_at: "2026-11-12T10:47:00Z", outcome: "token_missing" as const, status_code: null, error: null };
  assert.equal(dispatchFailing(dispatch("missing", [missing, { ...missing, sent_at: "2026-11-12T10:17:00Z" }])), null, "a missing token is shown in the card, not as failures");
});

test("a scheduled run says who sent its start", () => {
  assert.equal(viaLabel("supabase"), "Started by Supabase on time");
  assert.equal(viaLabel("github_schedule"), "Started by GitHub’s schedule");
  assert.equal(viaLabel(null), null);
  assert.equal(stopReasonText("daily_cap"), "Reached a daily page limit");
});
