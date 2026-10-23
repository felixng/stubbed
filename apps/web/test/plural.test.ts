import assert from "node:assert/strict";
import { test } from "node:test";

import { count, plural } from "@/lib/plural";

test("plural: one is singular, zero and many are plural", () => {
  assert.equal(plural(1, "Show"), "Show");
  assert.equal(plural(0, "Show"), "Shows");
  assert.equal(plural(2, "Theatre"), "Theatres");
  assert.equal(plural(1, "City", "Cities"), "City");
  assert.equal(plural(3, "City", "Cities"), "Cities");
});

test("count: the number and its label", () => {
  assert.equal(count(1, "follow request"), "1 follow request");
  assert.equal(count(4, "private show"), "4 private shows");
  assert.equal(count(0, "city", "cities"), "0 cities");
});
