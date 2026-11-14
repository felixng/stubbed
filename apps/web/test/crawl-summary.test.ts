import assert from "node:assert/strict";
import { test } from "node:test";

import { areaLabel, areaLines, areaName, finishText, hubTotals, readingRate, sourceLine, stepsLine, type AreaSummary, type CrawlSummary, type SourceSummary } from "@/lib/crawl-summary";
import { crawlingState } from "@/lib/admin-crawl";

const now = new Date("2026-11-12T23:20:00Z");
const on = crawlingState({ collection_enabled: true, operator_paused_at: null, paused_reason: null });

const area = (scope_key: string, venue: [number, number], event: [number, number], extra: Partial<AreaSummary> = {}): AreaSummary => {
  const known = venue[0] + event[0], read = venue[1] + event[1];
  return {
    id: `id-${scope_key}`, scope_key, started_at: "2026-11-08T10:00:00Z", enumeration_status: "enumerated", known, read, waiting: known - read, due: known - read, stuck: 0, read_3h: 0, last_read_at: null,
    stages: { venue: { known: venue[0], read: venue[1] }, event: { known: event[0], read: event[1] } }, ...extra,
  };
};
const sum = (areas: AreaSummary[], key: keyof AreaSummary) => areas.reduce((total, a) => total + (a[key] as number), 0);
const source = (areas: AreaSummary[], over: Partial<SourceSummary["totals"]> = {}): SourceSummary => ({
  collection_enabled: true, publication_enabled: true, operator_paused_at: null, paused_reason: null, withdrawn_at: null,
  totals: { known: sum(areas, "known"), read: sum(areas, "read"), waiting: sum(areas, "waiting"), due: sum(areas, "due"), stuck: sum(areas, "stuck"), retrying: 0, read_3h: sum(areas, "read_3h"), last_read_at: null, ...over },
  stages: {
    venue: { known: areas.reduce((t, a) => t + (a.stages.venue?.known ?? 0), 0), read: areas.reduce((t, a) => t + (a.stages.venue?.read ?? 0), 0) },
    event: { known: areas.reduce((t, a) => t + (a.stages.event?.known ?? 0), 0), read: areas.reduce((t, a) => t + (a.stages.event?.read ?? 0), 0) },
  },
  areas,
});

// Playbill on 12 Nov: four current areas. The hub used to show only the newest (London: 454 of 548).
const playbillAreas = [
  area("broadway-directory", [60, 41], [6220, 2549], { read_3h: 900, last_read_at: "2026-11-12T23:10:00Z" }),
  area("london-listing", [45, 45], [548, 454]),
  area("supplied-circle-in-the-square", [1, 1], [115, 115]),
  area("supplied-stratford-east", [1, 1], [15, 15]),
];

test("a source row counts every area, not just the newest", () => {
  const line = sourceLine("playbill", source(playbillAreas), on, now);
  assert.equal(line.known, 60 + 6220 + 45 + 548 + 1 + 115 + 1 + 15);
  assert.equal(line.read, 41 + 2549 + 45 + 454 + 1 + 115 + 1 + 15);
  assert.equal(line.percent, 46, "about 46%, not the 84% the newest area alone gave");
  const newestOnly = sourceLine("playbill", source([playbillAreas[1]]), on, now);
  assert.equal(newestOnly.percent, 84, "that was the old, misleading number");
});

test("the hub total, the source rows and every source's areas always agree", () => {
  const summary: CrawlSummary = { playbill: source(playbillAreas), london_theatre: source([area("venue-directory", [57, 56], [1100, 980])]) };
  const totals = hubTotals(summary);
  assert.equal(totals.known, totals.fromAreas, "hub total equals the sum of the areas");
  assert.equal(totals.known, summary.playbill.totals.known + summary.london_theatre.totals.known);
  assert.equal(summary.playbill.totals.known, sum(playbillAreas, "known"));
  // A source row that dropped an area would be caught here.
  const dropped: CrawlSummary = { playbill: { ...source(playbillAreas), totals: source([playbillAreas[1]]).totals, areas: playbillAreas } };
  assert.notEqual(hubTotals(dropped).known, hubTotals(dropped).fromAreas);
});

test("moving: pages an hour and when it will finish", () => {
  const line = sourceLine("playbill", source(playbillAreas), on, now);
  assert.equal(line.state, "moving");
  assert.equal(line.movement, "Reading ~300 pages/hour");
  assert.equal(line.finish, "done around 13 Nov 11:56 UTC", "more than half a day away reads as a date and time");
  const soon = sourceLine("playbill", source([area("a", [0, 0], [600, 0], { read_3h: 900 })]), on, now);
  assert.equal(soon.finish, "done in about 2 hours");
  assert.equal(sourceLine("playbill", source([area("a", [0, 0], [100, 0], { read_3h: 900 })]), on, now).finish, "done within an hour");
});

test("stalled: work is due but nothing was read recently", () => {
  const stalled = source([area("a", [0, 0], [100, 90], { read_3h: 0, due: 10 })], { last_read_at: "2026-11-12T21:00:00Z" });
  const line = sourceLine("london_theatre", stalled, on, now);
  assert.equal(line.state, "stalled");
  assert.equal(line.movement, "Stalled: nothing read for 2 h");
  assert.equal(line.finish, null, "no estimate when stalled");
  assert.equal(sourceLine("london_theatre", source([area("a", [0, 0], [100, 90], { due: 10 })]), on, now).movement, "Stalled: nothing read yet");
});

test("keeping up to date: nothing waiting, only re-reads", () => {
  const line = sourceLine("london_theatre", source([area("venue-directory", [57, 57], [1100, 1100])]), on, now);
  assert.equal(line.state, "keeping_up");
  assert.equal(line.movement, "Keeping up to date");
  assert.equal(line.finish, null);
  assert.equal(line.percent, 100);
});

test("waiting to retry is not a stall, and a paused source says so", () => {
  const retrying = source([area("a", [0, 0], [100, 95], { due: 0 })]);
  assert.equal(sourceLine("london_theatre", retrying, on, now).state, "waiting_retry");
  const paused = sourceLine("playbill", source(playbillAreas), crawlingState({ collection_enabled: true, operator_paused_at: "2026-11-12T10:00:00Z", paused_reason: null }), now);
  assert.equal(paused.state, "not_running");
  assert.match(paused.movement, /^Paused by you · 3,784 pages waiting$/);
});

test("needs you is only the pages that are stuck", () => {
  assert.equal(sourceLine("london_theatre", source([area("a", [0, 0], [10, 7], { stuck: 3 })]), on, now).needs, 3);
  assert.equal(sourceLine("london_theatre", source([area("a", [0, 0], [10, 7])]), on, now).needs, 0);
});

test("areas list in plain words, largest first, with their state", () => {
  const lines = areaLines(source(playbillAreas));
  assert.deepEqual(lines.map(line => line.name), ["Broadway", "London", "Circle in the Square", "Stratford East"]);
  assert.equal(lines[0].text, "2,549 of 6,220 show pages · reading now");
  assert.equal(lines[1].text, "454 of 548 show pages · waiting its turn", "due work, nothing read for 3 h, while another area is read");
  assert.equal(lines[2].text, "done");
  assert.equal(lines[3].state, "done");
  const quiet = areaLines(source([area("london-listing", [45, 45], [548, 454])]));
  assert.equal(quiet[0].state, "waiting", "with nothing else being read it is just waiting");
});

test("area names: known keys, supplied theatres, and no raw keys", () => {
  assert.equal(areaName("broadway-directory"), "Broadway");
  assert.equal(areaName("london-listing"), "London");
  assert.equal(areaName("venue-directory"), "All venues");
  assert.equal(areaName("supplied-circle-in-the-square"), "Circle in the Square");
  assert.equal(areaName("supplied-stratford-east"), "Stratford East");
  assert.equal(areaName("some_new_scope"), "Some New Scope");
  assert.equal(areaName(""), "Other pages");
});

test("the steps in one line", () => {
  const stages = { directory: { known: 2, read: 2 }, venue: { known: 106, read: 86 }, event: { known: 6898, read: 3118 } };
  assert.equal(stepsLine(stages), "Find venues ✓ · Read venues 86/106 · Read shows 3,118/6,898");
  assert.equal(stepsLine({}), "Find venues — · Read venues — · Read shows —");
});

test("rate and finish estimates read the way a person says them", () => {
  assert.equal(readingRate(900), 300);
  assert.equal(readingRate(9), 3);
  assert.equal(readingRate(1010), 340);
  assert.equal(finishText(0, 100, now), null);
  assert.equal(finishText(100, 0, now), null);
  assert.equal(finishText(150, 100, now), "about 2 hours");
  assert.equal(finishText(100, 100, now), "about 1 hour");
});

test("an area with a label shows it; one without falls back to its tidied scope key", () => {
  assert.equal(areaLabel({ scope_key: "b5460000-0000-0000-0000-000000000001", label: "almeida.co.uk" }), "almeida.co.uk");
  assert.equal(areaLabel({ scope_key: "london-listing", label: null }), areaName("london-listing"));
  assert.equal(areaLabel({ scope_key: "broadway-directory" }), "Broadway");
});
