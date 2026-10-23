import assert from "node:assert/strict";
import { test } from "node:test";

import { entryBack, PROFILE_BACK, readFrom, withFrom } from "@/lib/back-link";

const trip = { id: "c0000000-0000-0000-0000-0000000000a1", name: "Summer in London" };

test("entryBack: known sources", () => {
  assert.deepEqual(entryBack("home"), { href: "/app", label: "Home" });
  assert.deepEqual(entryBack("import"), { href: "/app/import", label: "Import" });
  assert.deepEqual(entryBack("admin-import"), { href: "/app/admin/import", label: "Import" });
  assert.deepEqual(entryBack(`trip-${trip.id}`, [trip]), { href: `/app/trips/${trip.id}`, label: trip.name });
});

test("entryBack: falls back to Profile", () => {
  for (const bad of [undefined, "", ["home", "home"], "//evil.com", "https://evil.com", "profile", "trip-", "trip-../x"]) {
    assert.deepEqual(entryBack(bad), PROFILE_BACK, String(bad));
  }
  // A trip the entry isn't in.
  assert.deepEqual(entryBack(`trip-${trip.id}`, []), PROFILE_BACK);
});

test("withFrom: adds the param", () => {
  assert.equal(withFrom("/app/entries/1", "home"), "/app/entries/1?from=home");
  assert.equal(withFrom("/app/entries/1?new=1", "import"), "/app/entries/1?new=1&from=import");
});

test("readFrom: passes on only known sources", () => {
  for (const ok of ["home", "import", "admin-import", `trip-${trip.id}`]) assert.equal(readFrom(ok), ok);
  for (const bad of [undefined, "", ["home"], "//evil.com", "profile", "trip-", "trip-../x"]) {
    assert.equal(readFrom(bad), null, String(bad));
  }
});
