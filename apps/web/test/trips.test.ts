import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate, formatTripDates, statusFor, tripCovers, tripsCovering, WITH_WEEKDAY, type Collection } from "@/lib/entries";

const trip = (over: Partial<Collection>): Collection => ({
  id: "t1",
  name: "NYC Oct 2026",
  kind: "trip",
  start_date: "2026-10-10",
  end_date: "2026-10-14",
  ...over,
});

test("a date after today is a planned show; today or earlier is logged", () => {
  assert.equal(statusFor("2026-10-15", "2026-10-14"), "planned");
  assert.equal(statusFor("2026-10-14", "2026-10-14"), "logged");
  assert.equal(statusFor("2026-01-01", "2026-10-14"), "logged");
});

test("a trip covers its first and last days and everything between", () => {
  const t = trip({});
  assert.equal(tripCovers(t, "2026-10-10"), true);
  assert.equal(tripCovers(t, "2026-10-12"), true);
  assert.equal(tripCovers(t, "2026-10-14"), true);
  assert.equal(tripCovers(t, "2026-10-09"), false);
  assert.equal(tripCovers(t, "2026-10-15"), false);
});

test("only trips covering a date are offered", () => {
  const nyc = trip({});
  const fringe = trip({ id: "t2", name: "Fringe", start_date: "2026-08-01", end_date: "2026-08-25" });
  assert.deepEqual(tripsCovering([nyc, fringe], "2026-10-11"), [nyc]);
  assert.deepEqual(tripsCovering([nyc, fringe], "2026-09-01"), []);
});

test("trip dates read as a range, shortened within a year", () => {
  assert.equal(formatTripDates(trip({})), "10 Oct – 14 Oct 2026");
  assert.equal(formatTripDates(trip({ end_date: "2026-10-10" })), "10 Oct 2026");
  assert.equal(formatTripDates(trip({ start_date: "2026-12-30", end_date: "2027-01-02" })), "30 Dec 2026 – 2 Jan 2027");
});

test("dates use two styles: plain, or with a short weekday; no comma, three-letter months", () => {
  assert.equal(formatDate("2026-09-12"), "12 Sep 2026");
  assert.equal(formatDate("2026-10-05", WITH_WEEKDAY), "Mon 5 Oct 2026");
  assert.equal(formatDate("2026-10-05", { weekday: "long", day: "numeric", month: "long" }), "Monday 5 October");
});
