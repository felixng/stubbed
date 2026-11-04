import assert from "node:assert/strict";
import { test } from "node:test";

import { filterArgs, parseTheatreFilters, theatresHref } from "@/lib/admin-theatres";

test("parseTheatreFilters: defaults and junk", () => {
  const f = parseTheatreFilters({});
  assert.deepEqual(f, { q: "", circuit: "", country: "", website: "", whatsOn: "", page: 1 });
  const bad = parseTheatreFilters({ circuit: "nope", country: "gbr", website: "x", page: "-3" });
  assert.deepEqual(bad, f);
});

test("parseTheatreFilters: reads each filter", () => {
  const f = parseTheatreFilters({ q: " old vic ", circuit: "west_end", country: "gb", website: "lacks", whats_on: "has", page: "3" });
  assert.deepEqual(f, { q: "old vic", circuit: "west_end", country: "GB", website: "lacks", whatsOn: "has", page: 3 });
  assert.deepEqual(filterArgs(f), { q: "old vic", in_circuit: "west_end", in_country: "GB", has_website: false, has_whats_on: true });
  assert.deepEqual(filterArgs(parseTheatreFilters({})), { q: null, in_circuit: null, in_country: null, has_website: null, has_whats_on: null });
});

test("theatresHref: round trips", () => {
  const f = parseTheatreFilters({ q: "vic", website: "lacks", page: "2" });
  assert.equal(theatresHref(f), "/app/admin/theatres?q=vic&website=lacks&page=2");
  assert.equal(theatresHref(f, 1), "/app/admin/theatres?q=vic&website=lacks");
  assert.equal(theatresHref(parseTheatreFilters({}), 1), "/app/admin/theatres");
});
