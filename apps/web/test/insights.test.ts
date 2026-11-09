import { test } from "node:test";
import assert from "node:assert/strict";
import { gridYear, heatLevel, heatmapWeeks, isLocked, isPeriodLocked, monthlyCounts, parsePeriod, periodOptions, typeShares, upgradeRequired } from "../src/lib/insights";
import { fetchProName } from "../src/lib/pro-config";

test("locks come only from access.locked; a response without access locks nothing", () => {
  assert.equal(isLocked({}, "types"), false);
  assert.equal(isLocked(null, "types"), false);
  const free = { access: { tier: "free" as const, period: "current" as const, locked: ["years", "types"] } };
  assert.equal(isLocked(free, "types"), true);
  assert.equal(isLocked(free, "months"), false);
  assert.equal(isPeriodLocked(free), false);
  assert.equal(isPeriodLocked({ access: { tier: "free", period: "past", locked: ["total", "months"] } }), true);
});

test("a locked drill-down is told apart from other errors", () => {
  assert.equal(upgradeRequired({ code: "42501", message: "upgrade_required:insights.show_mix" }), "insights.show_mix");
  assert.equal(upgradeRequired({ code: "42501", message: "Not signed in" }), null);
  assert.equal(upgradeRequired({ code: "500", message: "upgrade_required:x" }), null);
  assert.equal(upgradeRequired(null), null);
});

test("period selection", () => {
  assert.equal(parsePeriod("all", 2026), null);
  assert.equal(parsePeriod("2025", 2026), 2025);
  assert.equal(parsePeriod("junk", 2026), 2026);
  assert.equal(parsePeriod(undefined, 2026), 2026);
  assert.equal(parsePeriod("1800", 2026), 2026);
  assert.deepEqual(periodOptions(2026, []), [2026, null]);
  assert.deepEqual(periodOptions(2026, [{ year: 2024 }, { year: 2025 }]), [2026, 2025, 2024, null]);
});

test("the activity grid is Monday-first and covers the year", () => {
  const weeks = heatmapWeeks(2026, [{ date: "2026-01-05", count: 2 }]);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[0][0].date, "2025-12-29"); // 1 Jan 2026 is a Thursday
  assert.equal(weeks[0][0].inYear, false);
  assert.equal(weeks[0][3].date, "2026-01-01");
  assert.equal(weeks[0][3].inYear, true);
  assert.equal(weeks[1][0].count, 2);
  assert.equal(weeks.at(-1)!.some((c) => c.date === "2026-12-31"), true);
});

test("heat levels, monthly counts and show mix shares", () => {
  assert.deepEqual([0, 1, 2, 4].map((n) => heatLevel(n, 4)), [0, 1, 2, 4]);
  assert.equal(heatLevel(3, 0), 0);
  assert.deepEqual(monthlyCounts([{ month: "2026-03", count: 4 }], 2026).slice(0, 4), [0, 0, 4, 0]);
  const shares = typeShares([{ type: "play", count: 1 }, { type: "musical", count: 3 }, { type: "opera", count: 0 }], 4);
  assert.deepEqual(shares.map((s) => [s.name, s.percent]), [["Musical", 75], ["Play", 25]]);
  assert.deepEqual(typeShares([], 0), []);
});

test("All time labels its grid with the latest year that has visits", () => {
  assert.equal(gridYear(2025, 2026, []), 2025);
  assert.equal(gridYear(null, 2026, [{ date: "2024-05-01" }, { date: "2025-02-02" }]), 2025);
  assert.equal(gridYear(null, 2026, []), 2026);
});

test("the tier name comes from app_config, defaulting to Pro", async () => {
  const client = (value: string | undefined | "throw") => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { if (value === "throw") throw new Error("x"); return { data: value === undefined ? null : { value } }; } }) }) }) });
  assert.equal(await fetchProName(client("Plus")), "Plus");
  assert.equal(await fetchProName(client(undefined)), "Pro");
  assert.equal(await fetchProName(client("  ")), "Pro");
  assert.equal(await fetchProName(client("throw")), "Pro");
});
