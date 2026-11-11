import assert from "node:assert/strict";
import { test } from "node:test";

import { summariseCrawlShow, summariseCrawlTask, crawlSourceFilters, crawlSourceHref, crawlStageProgress, rerunCommand, scoreLine, settingsLine, shareRight, sumScores, UUID } from "@/lib/admin-crawl";

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

test("source progress keeps the discovered denominator and paginated filters", () => {
  const counts = { discovered: 1000, processed: 3, pending: 994, leased: 1, succeeded: 3, retry_wait: 0, blocked: 2, failed: 0 };
  assert.equal(crawlStageProgress("venue", counts), "3 of 1,000 discovered venue pages processed");
  const scan = "1a1a1a1a-0000-0000-0000-000000000001";
  const filters = crawlSourceFilters({ source: "london_theatre", scan, stage: "event", status: "retry_wait", page: "5" });
  assert.equal(crawlSourceHref(filters, 6), `/app/backstage/crawl/sources?source=london_theatre&stage=event&scan=${scan}&status=retry_wait&page=6`);
  assert.deepEqual(crawlSourceFilters({ source: ["x"], scan: "bad", stage: "private", status: "weird", page: "-1" }), {
    source: "london_theatre", scan: undefined, stage: "venue", status: undefined, page: 1,
  });
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
