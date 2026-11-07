import assert from "node:assert/strict";
import { test } from "node:test";

import { crawlSourceFilters, crawlSourceHref, crawlStageProgress, rerunCommand, scoreLine, settingsLine, shareRight, sumScores, UUID } from "@/lib/admin-crawl";

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
