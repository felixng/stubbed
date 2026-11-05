import assert from "node:assert/strict";
import { test } from "node:test";

import { bulkStatus, candidateHref, parseCandidateFilters } from "@/lib/admin-candidates";

test("parseCandidateFilters: defaults to pending, ignores junk", () => {
  assert.deepEqual(parseCandidateFilters({}), { q: "", type: "", status: "pending", sample: "", page: 1 });
  assert.deepEqual(parseCandidateFilters({ type: "ballet", status: "x", sample: "nope", page: "0" }), { q: "", type: "", status: "pending", sample: "", page: 1 });
  const f = parseCandidateFilters({ q: " six ", type: "musical", status: "all", sample: "c0000000-0000-0000-0000-00000000000a", page: "3" });
  assert.deepEqual(f, { q: "six", type: "musical", status: "all", sample: "c0000000-0000-0000-0000-00000000000a", page: 3 });
  assert.equal(candidateHref(f), "/app/backstage/shows/candidates?q=six&type=musical&status=all&sample=c0000000-0000-0000-0000-00000000000a&page=3");
  assert.equal(candidateHref(f, 1).includes("page="), false);
  assert.equal(candidateHref(parseCandidateFilters({})), "/app/backstage/shows/candidates");
});

test("bulkStatus: needs 20 reviewed and 95% right", () => {
  assert.equal(bulkStatus(null).ok, false);
  assert.match(bulkStatus({ size: 50, reviewed: 10, good: 10, bad: 0, share: 1 }).message, /at least 20/);
  const low = bulkStatus({ size: 50, reviewed: 40, good: 36, bad: 4, share: 0.9 });
  assert.equal(low.ok, false);
  assert.match(low.message, /90% right; 95% is needed/);
  const ok = bulkStatus({ size: 50, reviewed: 40, good: 38, bad: 2, share: 0.95 });
  assert.equal(ok.ok, true);
  assert.match(ok.message, /95% right \(38 of 40\)/);
});
