import assert from "node:assert/strict";
import { test } from "node:test";

import { attentionItems, crawlBuckets, crawlingState, crawlPagesFilters, hubHeadline, legacySourcesRedirect, pagesHref, recentActionText, sourceKeyFromPath, sourcePath, sourceStatusSentence, summariseCrawlShow, summariseCrawlTask, rerunCommand, scoreLine, settingsLine, shareRight, sumScores, UUID } from "@/lib/admin-crawl";

const score = { right: 3, wrong: 1, unsure: 1, unreviewed: 2, findings: 7, missed: 2 };

test("shareRight: right among right and wrong only", () => {
  assert.equal(shareRight(score), 0.75);
  assert.equal(shareRight({ right: 0, wrong: 0 }), null);
  assert.equal(shareRight({ right: 0, wrong: 2 }), 0);
});

test("scoreLine and sumScores", () => {
  assert.equal(scoreLine(score), "7 findings · 75% right · 1 wrong · 2 missed · 1 unsure · 2 not reviewed");
  assert.equal(scoreLine({ right: 0, wrong: 0, unsure: 0, unreviewed: 1, findings: 1, missed: 0 }), "1 finding · 0 wrong · 0 missed · 1 not reviewed");
  assert.deepEqual(sumScores([score, score]), { right: 6, wrong: 2, unsure: 2, unreviewed: 4, findings: 14, missed: 4 });
  assert.deepEqual(sumScores([]).findings, 0);
});

const run = { id: "r", method: "rules_model", model: "claude-haiku-5-5", prompt: "x", branch: "main", commit_sha: "abcdef1234", budget_usd: "0.50", cost_usd: "0.0123", venue_ids: ["a", "b"] };

test("settingsLine and rerunCommand", () => {
  assert.equal(settingsLine(run), "rules, then model · claude-haiku-5-5 · custom prompt · branch main @ abcdef1 · cost $0.0123");
  assert.equal(settingsLine({ ...run, method: "rules", prompt: null, branch: null, cost_usd: 0 }), "rules only · default prompt · cost $0.0000");
  assert.equal(rerunCommand(run), "node supabase/scripts/crawl/index.mjs --venues a,b --method rules_model --model claude-haiku-5-5 --budget 0.5 --prompt-file prompt.md");
  assert.equal(rerunCommand({ ...run, method: "rules" }), "node supabase/scripts/crawl/index.mjs --venues a,b --method rules");
});

test("UUID", () => {
  assert.ok(UUID.test("c0000000-0000-0000-0000-00000000000a"));
  assert.ok(!UUID.test("nope"));
});

const counts = { discovered: 1085, processed: 979, pending: 80, leased: 2, succeeded: 979, retry_wait: 26, blocked: 3, failed: 1 };
const scanId = "1a1a1a1a-0000-0000-0000-000000000001";

test("six statuses group into four buckets", () => {
  assert.deepEqual(crawlBuckets(counts), { done: 979, todo: 82, retrying: 26, stuck: 4 });
});

test("collection, pause and block read as one crawling state", () => {
  assert.deepEqual(crawlingState({ collection_enabled: true, operator_paused_at: null, paused_reason: null }), { key: "on", label: "Crawling" });
  assert.equal(crawlingState({ collection_enabled: true, operator_paused_at: "2026-11-01", paused_reason: null }).label, "Paused by you");
  assert.equal(crawlingState({ collection_enabled: true, operator_paused_at: "2026-11-01", paused_reason: "HTTP 403" }).key, "blocked");
  assert.equal(crawlingState({ collection_enabled: false, operator_paused_at: null, paused_reason: null }).label, "Not enabled");
});

test("page filters take steps, buckets and old names, and build links", () => {
  const filters = crawlPagesFilters("london_theatre", { step: "event", status: "stuck", area: scanId, page: "5" });
  assert.equal(crawlPagesFilters("london_theatre", { pass: scanId }).scan, scanId, "old pass= links still work");
  assert.equal(crawlPagesFilters("london_theatre", { scan: scanId }).scan, scanId, "old scan= links still work");
  assert.equal(crawlPagesFilters("london_theatre", {}).scan, undefined, "no area means all areas");
  assert.deepEqual(filters, { source: "london_theatre", step: "event", status: "stuck", scan: scanId, page: 5 });
  assert.equal(pagesHref(filters, { page: 6 }), `/app/backstage/crawl/sources/london-theatre/pages?step=event&status=stuck&area=${scanId}&page=6`);
  assert.deepEqual(crawlPagesFilters("playbill", { stage: "private", status: "weird", scan: "bad", page: "-1" }), { source: "playbill", step: "venue", status: undefined, scan: undefined, page: 1 });
  assert.equal(crawlPagesFilters("playbill", { stage: "event", status: "retry_wait" }).status, "retry_wait");
  assert.equal(sourceKeyFromPath("london-theatre"), "london_theatre");
  assert.equal(sourcePath("official"), "/app/backstage/crawl/sources/official");
});

test("old crawl addresses land somewhere sensible", () => {
  assert.equal(legacySourcesRedirect({}), "/app/backstage/crawl");
  assert.equal(legacySourcesRedirect({ source: "nope" }), "/app/backstage/crawl");
  assert.equal(legacySourcesRedirect({ source: "playbill" }), "/app/backstage/crawl/sources/playbill");
  assert.equal(legacySourcesRedirect({ source: "london_theatre", stage: "event", status: "retry_wait", page: "2" }),
    "/app/backstage/crawl/sources/london-theatre/pages?step=event&status=retry_wait&page=2");
});

test("the hub headline answers where we are in a sentence", () => {
  const on = { key: "london_theatre", state: { key: "on", label: "Crawling" } as const, publishing: true };
  const paused = { key: "playbill", state: { key: "paused", label: "Paused by you" } as const, publishing: false };
  assert.equal(hubHeadline([on, paused], 27, 26, 0),
    "London Theatre is crawling and publishing. Playbill is paused by you. 27 pages are stuck. 26 pages are retrying. No run dates published yet.");
  assert.equal(hubHeadline([{ ...on, publishing: false }], 0, 0, 12), "London Theatre is crawling but not publishing. 12 run dates published.");
});

test("a source status sentence says what is running and what needs you", () => {
  const scan = { started_at: "2026-11-08T10:00:00Z", completed_at: "2026-11-08T11:10:00Z", enumeration_status: "enumerated", is_current: true } as const;
  assert.equal(sourceStatusSentence({ state: { key: "on", label: "Crawling" }, publishing: true, scan, needAttention: 27 }),
    "Crawling and publishing. Current pass started 8 Nov; finding venues finished 8 Nov. 27 pages need attention.");
  assert.equal(sourceStatusSentence({ state: { key: "paused", label: "Paused by you" }, publishing: false, scan: null, needAttention: 0 }),
    "Paused by you. No pass recorded yet. Nothing needs you.");
});

test("needs attention lists each problem with a reason and a place to go", () => {
  const overview = {
    run_dates: { total: 0, from_sources: 0 },
    sources: {
      london_theatre: { next_refresh_at: null, unchecked_pages: 0, attention: [
        { stage: "event", status: "retry_wait", n: 26, reason: "Page redirect limit exceeded" },
        { stage: "event", status: "failed", n: 1, reason: "HTTP 404" },
      ] },
      playbill: { next_refresh_at: null, unchecked_pages: 0, attention: [] },
    },
    official: { sites: 9, sites_needing_attention: 3, last_run_at: null, last_run_status: null, findings_to_review: 0 },
    recent_actions: [],
  } as const;
  const items = attentionItems(overview as never, [{ source_key: "london_theatre", paused_reason: null }, { source_key: "playbill", paused_reason: "HTTP 403" }, { source_key: "official", paused_reason: null }]);
  assert.deepEqual(items.map(i => i.text), ["26 show pages retrying", "1 show page failed", "Blocked by the site", "3 sites need attention"]);
  assert.equal(items[0].href, "/app/backstage/crawl/sources/london-theatre/pages?step=event&status=retrying");
  assert.equal(items[1].reason, "HTTP 404");
  assert.equal(items[2].reason, "HTTP 403");
  assert.equal(attentionItems({ ...overview, official: { ...overview.official, sites_needing_attention: 0 } } as never, [{ source_key: "playbill", paused_reason: null }]).length, 0);
});

test("recent changes read as sentences", () => {
  assert.equal(recentActionText({ at: "x", source: "playbill", operation: "pause", affected: 1, who: "Felix" }), "Felix paused crawling for Playbill");
  assert.equal(recentActionText({ at: "x", source: "london_theatre", operation: "retry_failed", affected: 27, who: "Felix" }), "Felix retried failed pages for London Theatre (27 pages)");
});

test("a venue page says what we got and what it is waiting on", () => {
  const row = { stage: "venue", status: "succeeded", canonical_url: "https://playbill.com/venue/adelphi-theatre-coms-1" } as const;
  const base = { stage: "venue", name: "Adelphi Theatre", street: "The Strand", city: "London", postcode: "WC2E 7NA", located: true, located_by: "geocoded:postcodes.io" } as const;
  const waiting = summariseCrawlTask(row, { ...base, shows_total: 4, shows_read: 1, shows_stuck: 0 });
  assert.equal(waiting.title, "Adelphi Theatre");
  assert.deepEqual(waiting.outcome, { label: "Waiting on 3 show pages", tone: "waiting" });
  assert.ok(waiting.got.includes("1 of 4 show pages read") && waiting.got.includes("Located from its postcode"));
  assert.deepEqual(summariseCrawlTask(row, { ...base, shows_total: 4, shows_read: 4, shows_stuck: 0 }).outcome, { label: "Complete", tone: "good" });
  assert.deepEqual(summariseCrawlTask(row, { ...base, shows_total: 4, shows_read: 2, shows_stuck: 1 }).outcome, { label: "1 show page stuck", tone: "bad" });
  assert.equal(summariseCrawlTask(row, { ...base, located: false, shows_total: 1, shows_read: 1, shows_stuck: 0 }).outcome.label, "No location found");
});

test("an event page separates a confirmed close from a booking horizon", () => {
  const row = { stage: "event", status: "succeeded", canonical_url: "https://www.londontheatre.co.uk/show/1-matilda" } as const;
  const horizon = summariseCrawlTask(row, { stage: "event", title: "Matilda", show_type: "musical", venue_name: "Cambridge Theatre", dates: [{ date: "2021-11-12", kind: "start" }, { date: "2027-09-05", kind: "end" }] });
  assert.ok(horizon.got.includes("Scheduled until 5 Sept 2027 (not a confirmed close)") || horizon.got.some(g => g.startsWith("Scheduled until")));
  assert.ok(!horizon.got.some(g => g.startsWith("Closes")));
  const closed = summariseCrawlTask(row, { stage: "event", title: "Oliver Twist", show_type: null, dates: [{ date: "1912-02-26", kind: "opening" }, { date: "1912-05-01", kind: "closing" }] });
  assert.ok(closed.got.includes("Closes 1 May 1912"));
  assert.deepEqual(closed.missing, ["Show type not on the page"]);
  assert.equal(summariseCrawlTask(row, { stage: "event", title: "X", dates: [] }).outcome.label, "No dates found");
  assert.equal(summariseCrawlTask({ ...row, status: "failed" }).outcome.tone, "bad");
});

test("a listed show says what we have or why we have nothing yet", () => {
  const read = summariseCrawlShow({ title: "Elf The Musical", status: "succeeded", opens: "2025-11-01", closes: "2026-01-04", ends: null });
  assert.deepEqual(read, { title: "Elf The Musical", mark: "✓", detail: "opens 1 Nov 2025, closes 4 Jan 2026" });
  assert.equal(summariseCrawlShow({ title: "X", status: "succeeded", opens: "2021-11-12", closes: null, ends: "2027-09-05" }).detail, "opens 12 Nov 2021, scheduled until 5 Sept 2027");
  assert.equal(summariseCrawlShow({ title: "https://playbill.com/production/tina-1", status: "pending", opens: null, closes: null, ends: null }).title, "tina-1");
  assert.equal(summariseCrawlShow({ title: "X", status: "pending", opens: null, closes: null, ends: null }).detail, "not read yet");
  assert.equal(summariseCrawlShow({ title: "X", status: "failed", opens: null, closes: null, ends: null }).mark, "✕");
});
