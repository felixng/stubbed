import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanNote, REPORT_REASONS, reportError, targetNoun } from "@/lib/moderation";

test("reasons match the reports table's check", () => {
  assert.deepEqual(
    REPORT_REASONS.map((r) => r.value),
    ["spam", "harassment", "inappropriate", "other"],
  );
});

test("cleanNote: optional, trimmed, at most 500 characters", () => {
  assert.equal(cleanNote("   "), null);
  assert.equal(cleanNote("  rude  "), "rude");
  assert.equal(cleanNote("a".repeat(600))?.length, 500);
});

test("reportError: a repeat report is not an error", () => {
  assert.equal(reportError(undefined), null);
  assert.equal(reportError("23505"), null);
  assert.equal(reportError("22023"), "You can’t report your own posts.");
  assert.match(reportError("XX000") ?? "", /Try again/);
});

test("targetNoun: an entry is a show", () => {
  assert.equal(targetNoun("entry"), "show");
  assert.equal(targetNoun("comment"), "comment");
});
