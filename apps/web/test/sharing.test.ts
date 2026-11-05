import assert from "node:assert/strict";
import { test } from "node:test";
import { availableEntryDesigns, cardBackground, entryMetrics, type CardData } from "@/lib/share-card";
import { availableInsightDesigns, availableShowDesigns, isInsightDesign, monthlyShareCounts, radarShareValues, type InsightCardData } from "@/lib/share-card-insights";
const entry: CardData = { title: "Operation Mincemeat", venue: "Fortune Theatre", where: "London", date: "1 Nov 2026", year: 2026, rating: 0.5, showOfYear: 24, venueVisit: 3, timesSeen: 5, handle: "sillyelphaba" };
const insights: InsightCardData = { year: 2026, handle: "sillyelphaba", stats: { total: 24, unique_shows: 18,
  streaks: { current_weekly: 8, longest_weekly: 12, current_daily: 0, longest_daily: 4 },
  years: [{ year: 2026, count: 24 }], months: [{ month: "2025-01", count: 99 }, { month: "2026-10", count: 24 }],
  types: [{ type: "play", count: 6 }, { type: "musical", count: 12 }, { type: "opera", count: 2 }, { type: "comedy", count: 2 }, { type: "dance", count: 1 }, { type: "standup", count: 1 }] } };
test("entry sharing separates photo eligibility, saved ratings and repeat visits", () => {
  assert.deepEqual(availableEntryDesigns(entry, true).map(d => d.id), ["stats", "name", "data", "encore", "show-number", "overlay", "ticket"]);
  assert.deepEqual(availableEntryDesigns({ ...entry, rating: null, timesSeen: 1 }, false).map(d => d.id), ["data", "encore", "show-number", "overlay", "ticket"]);
  assert.ok(!availableEntryDesigns({ ...entry, rating: null }, true).some(d => d.id === "name"));
  for (const design of availableEntryDesigns(entry, true)) assert.equal(cardBackground(design, "transparent"), design.background ? "transparent" : "photo");
});
test("data cards never acquire rating fields or duplicate the missing venue", () => {
  assert.deepEqual(entryMetrics(entry).map(m => m.value), ["24th", "3rd visit", "5"]);
  assert.deepEqual(entryMetrics({ ...entry, venue: null }).map(m => m.label), ["Show of 2026", "Times seen"]);
});
test("Insights period selection cannot relabel live streaks or make a fake All time year", () => {
  assert.deepEqual(availableInsightDesigns(insights, 2026).map(d => d.id), ["weekly-streak", "year-in-theatre", "show-mix"]);
  assert.deepEqual(availableInsightDesigns({ ...insights, year: 2025 }, 2026).map(d => d.id), ["year-in-theatre", "show-mix"]);
  assert.deepEqual(availableInsightDesigns({ ...insights, year: null }, 2026).map(d => d.id), ["weekly-streak", "show-mix"]);
  assert.deepEqual(availableInsightDesigns({ ...insights, stats: { ...insights.stats, total: 0, streaks: { ...insights.stats.streaks, current_weekly: 0 } } }, 2026), []);
});
test("charts preserve monthly periods and canonical show-type order", () => {
  const months = monthlyShareCounts(insights);
  assert.equal(months.length, 12); assert.equal(months[0], 0); assert.equal(months[9], 24);
  assert.deepEqual(radarShareValues(insights), [12, 6, 2, 1, 2, 1, 0]);
});

test("one show offers all ten designs and names the first count card truthfully", () => {
  const designs = availableShowDesigns({ ...entry, timesSeen: 1, year: 2025 }, true, { ...insights, year: new Date().getFullYear() });
  assert.equal(designs.length, 10);
  assert.equal(designs.find(d => d.id === "encore")?.name, "First visit");
  assert.equal(availableEntryDesigns(entry, true).find(d => d.id === "encore")?.name, "Encore");
  assert.deepEqual(designs.filter(d => isInsightDesign(d.id)).map(d => d.id), ["weekly-streak", "year-in-theatre", "show-mix"]);
  const empty = { ...insights, year: new Date().getFullYear(), stats: { ...insights.stats, total: 0, streaks: { ...insights.stats.streaks, current_weekly: 0 } } };
  assert.equal(availableShowDesigns(entry, true, empty).length, 10);
  assert.equal(availableInsightDesigns(empty).length, 0);
});
