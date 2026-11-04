import assert from "node:assert/strict";
import { test } from "node:test";

import { nameVerdict, parseShowFilters, parseTitles, showFilterArgs, showsHref } from "@/lib/admin-shows";

test("parseShowFilters: defaults, junk and each filter", () => {
  const empty = { q: "", type: "", source: "", entries: "", problems: false, page: 1 };
  assert.deepEqual(parseShowFilters({}), empty);
  assert.deepEqual(parseShowFilters({ type: "ballet", source: "x", entries: "y", problems: "yes", page: "0" }), empty);
  const f = parseShowFilters({ q: " six ", type: "musical", source: "typed", entries: "has", problems: "1", page: "2" });
  assert.deepEqual(f, { q: "six", type: "musical", source: "typed", entries: "has", problems: true, page: 2 });
  assert.deepEqual(showFilterArgs(f), { q: "six", in_type: "musical", in_source: "typed", in_entries: "has", only_problems: true });
  assert.equal(showsHref(f), "/app/admin/shows?q=six&type=musical&source=typed&entries=has&problems=1&page=2");
  assert.equal(showsHref(f, 1), "/app/admin/shows?q=six&type=musical&source=typed&entries=has&problems=1");
  assert.equal(showsHref(parseShowFilters({})), "/app/admin/shows");
});

test("nameVerdict", () => {
  assert.equal(nameVerdict(1, 3), "first");
  assert.equal(nameVerdict(3, 3), "lower");
  assert.equal(nameVerdict(null, 3), "wrong");
  assert.equal(nameVerdict(null, 0), "missing");
});

test("parseTitles: one per line, blanks and repeats dropped", () => {
  assert.deepEqual(parseTitles("Titanique\r\n\n  Fleabag  \ntitanique\nBaby   Reindeer"), ["Titanique", "Fleabag", "Baby Reindeer"]);
  assert.deepEqual(parseTitles(""), []);
});
