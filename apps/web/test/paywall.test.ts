import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYWALL_BENEFITS, buttonLabel, parseSource, paywallHref, previewFree, safePaywallNext, sourceForFeature, unavailableOfferProvider, withPreview } from "../src/lib/paywall";
import { DEFAULT_CONFIG, FREE, PREVIEW_STATE, loadMembership, parseConfig } from "../src/lib/membership";
import { CARD_NEEDS, isCardLocked, periodChoices, periodNext, previewStats, type OwnInsights } from "../src/lib/insights";
import { sampleInsightData } from "../src/lib/share-card-insights";

test("next is accepted only as a path inside /app/", () => {
  assert.equal(safePaywallNext("/app/stats?year=all"), "/app/stats?year=all");
  assert.equal(safePaywallNext("/app/profile"), "/app/profile");
  for (const bad of ["//evil.com", "//evil.com/app/x", "https://evil.com", "http://evil.com/app/x", "/\\evil.com", "/app//evil.com", "/app/\\evil", "/appx/y", "/app", "/app/", "/stats", "javascript:alert(1)", "", null, undefined, "/app/x\nHost: evil"]) {
    assert.equal(safePaywallNext(bad), "/app/stats", String(bad));
  }
});

test("the paywall link carries the source and a safe next", () => {
  const url = new URL(paywallHref("show_mix", "/app/stats?year=2026"), "https://x");
  assert.equal(url.pathname, "/app/pro");
  assert.equal(url.searchParams.get("from"), "show_mix");
  assert.equal(url.searchParams.get("next"), "/app/stats?year=2026");
  assert.equal(new URL(paywallHref("profile", "//evil.com"), "https://x").searchParams.get("next"), "/app/stats");
  assert.equal(parseSource("past_year"), "past_year");
  assert.equal(parseSource("nonsense"), "profile");
  assert.equal(sourceForFeature("insights.show_mix"), "show_mix");
  assert.equal(sourceForFeature("insights.all_time"), "all_time");
  assert.equal(sourceForFeature("insights.past_years"), "past_year");
});

test("the preview override works outside production only", () => {
  assert.equal(previewFree("free", "development"), true);
  assert.equal(previewFree("free", "production"), false);
  assert.equal(previewFree(["free"], "test"), true);
  assert.equal(previewFree("pro", "development"), false);
  assert.equal(previewFree(undefined, "development"), false);
  assert.equal(withPreview("/app/stats", true), "/app/stats?paywallPreview=free");
  assert.equal(withPreview("/app/stats?year=all", true), "/app/stats?year=all&paywallPreview=free");
  assert.equal(withPreview("/app/stats?paywallPreview=free", true), "/app/stats?paywallPreview=free");
  assert.equal(withPreview("/app/stats", false), "/app/stats");
  const next = new URL(paywallHref("profile", "/app/profile", true), "https://x");
  assert.equal(next.searchParams.get("paywallPreview"), "free");
  assert.equal(next.searchParams.get("next"), "/app/profile?paywallPreview=free");
});

test("until checkout exists the offer is unavailable and the button says Upgrade", async () => {
  const offer = await unavailableOfferProvider.load();
  assert.equal(offer.available, false);
  assert.equal(buttonLabel(offer), "Upgrade");
  assert.equal(buttonLabel({ available: true, trialEligible: true, terms: null }), "Start free trial");
  assert.equal(PAYWALL_BENEFITS.length, 3);
});

test("config: missing keys mean off; the name comes from app_config", () => {
  assert.deepEqual(parseConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(parseConfig([]), { name: "Pro", salesEnabled: false, gatesEnabled: false });
  assert.deepEqual(parseConfig([{ key: "pro_display_name", value: " Plus " }, { key: "paywall_sales_enabled", value: "true" }, { key: "paywall_gates_enabled", value: "false" }]),
    { name: "Plus", salesEnabled: true, gatesEnabled: false });
  assert.equal(PREVIEW_STATE.info, FREE);
  assert.equal(PREVIEW_STATE.config.gatesEnabled, true);
});

test("membership loads from my_membership and app_config; an unreadable membership throws", async () => {
  const reader = (membership: { data: unknown; error: unknown }, config: unknown) => ({
    rpc: async () => membership,
    from: () => ({ select: async () => { if (config === "throw") throw new Error("x"); return { data: config as never }; } }),
  });
  const ok = await loadMembership(reader({ data: { ...FREE, tier: "pro" }, error: null }, [{ key: "paywall_sales_enabled", value: "true" }]) as never);
  assert.equal(ok.info.tier, "pro");
  assert.equal(ok.config.salesEnabled, true);
  assert.deepEqual((await loadMembership(reader({ data: FREE, error: null }, "throw") as never)).config, DEFAULT_CONFIG);
  await assert.rejects(loadMembership(reader({ data: null, error: { message: "no" } }, []) as never));
});

test("an admin testing the paywall sees both switches on; nobody else does", async () => {
  const reader = (data: unknown) => ({
    rpc: async () => ({ data, error: null }),
    from: () => ({ select: async () => ({ data: [{ key: "paywall_sales_enabled", value: "false" }] }) }),
  });
  const admin = await loadMembership(reader({ ...FREE, paywall_preview: true }) as never);
  assert.equal(admin.config.salesEnabled, true);
  assert.equal(admin.config.gatesEnabled, true);
  const user = await loadMembership(reader({ ...FREE, paywall_preview: false }) as never);
  assert.deepEqual(user.config, DEFAULT_CONFIG);
  assert.deepEqual((await loadMembership(reader(FREE) as never)).config, DEFAULT_CONFIG);
});

const free = (locked: string[]) => ({ access: { tier: "free" as const, period: "current" as const, locked } });

test("a card locks from its declared data needs, via access.locked only", () => {
  assert.deepEqual(Object.keys(CARD_NEEDS).sort(), ["show-mix", "weekly-streak", "year-in-theatre"]);
  const currentFree = free(["years", "types"]);
  assert.equal(isCardLocked("weekly-streak", currentFree), false);
  assert.equal(isCardLocked("year-in-theatre", currentFree), false);
  assert.equal(isCardLocked("show-mix", currentFree), true);
  // A past year for a Free caller: everything but the current streaks is locked.
  const past = free(["total", "months", "types", "years"]);
  assert.equal(isCardLocked("year-in-theatre", past), true);
  assert.equal(isCardLocked("weekly-streak", past), false);
  // Gates off, or an old response with no access: nothing locks.
  assert.equal(isCardLocked("show-mix", {}), false);
  assert.equal(isCardLocked("show-mix", free([])), false);
  // One policy: show_mix made free in the database empties `locked`, and the card unlocks.
  assert.equal(isCardLocked("show-mix", free(["years"])), false);
  assert.equal(isCardLocked("unknown-card", currentFree), false);
});

test("sample card data never carries the person's numbers", () => {
  const sample = sampleInsightData(2026);
  assert.equal(sample.handle, null);
  assert.equal(sample.year, 2026);
  assert.ok(sample.stats.total > 0 && sample.stats.types.length > 0 && sample.stats.months.length === 12);
});

test("the period menu hides earlier years while they're locked and offers a lock instead", () => {
  const unlocked = periodChoices(2026, { years: [{ year: 2025, count: 3 }, { year: 2024, count: 1 }] });
  assert.deepEqual(unlocked.map((c) => [c.value, c.locked]), [["2026", false], ["2025", false], ["2024", false], ["all", false]]);
  const locked = periodChoices(2026, { years: [], ...free(["years", "types"]) });
  assert.deepEqual(locked.map((c) => [c.value, c.label, c.locked]), [["2026", "2026", false], ["earlier", "Earlier years", true], ["all", "All time", true]]);
  assert.ok(!JSON.stringify(locked).includes("2025"));
  assert.equal(periodNext(locked[1], 2026), "/app/stats?year=2025");
  assert.equal(periodNext(locked[2], 2026), "/app/stats?year=all");
  assert.equal(periodNext(unlocked[1], 2026), "/app/stats?year=2025");
});

test("the development preview builds what a Free caller would get", () => {
  const stats: OwnInsights = {
    total: 5, unique_shows: 4, unlocated: 1, repeated_shows: [{ id: "a", title: "A", count: 2, rank: 1 }],
    streaks: { current_daily: 1, longest_daily: 2, current_weekly: 3, longest_weekly: 4 },
    years: [{ year: 2025, count: 9 }], months: [{ month: "2026-01", count: 5 }], days: [{ date: "2026-01-02", count: 5 }],
    types: [{ type: "play", count: 5 }], countries: [{ country: "GB", count: 4 }],
  };
  const current = previewStats(stats, 2026, 2026);
  assert.deepEqual(current.access, { tier: "free", period: "current", locked: ["years", "types"] });
  assert.equal(current.total, 5);
  assert.deepEqual([current.years, current.types], [[], []]);
  const past = previewStats(stats, 2025, 2026);
  assert.equal(past.access?.period, "past");
  assert.equal(past.total, 0);
  assert.equal(past.streaks.current_weekly, 3);
  assert.equal(past.streaks.longest_weekly, 0);
  assert.equal(previewStats(stats, null, 2026).access?.period, "all");
});
