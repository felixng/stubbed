import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Sources are registered in the adapter files and the database (#540). The web app reads their names
// and kinds from admin_crawl_sources(), so no source key is written into it.
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : /\.(ts|tsx|css|json)$/.test(entry.name) ? [join(dir, entry.name)] : []);
}

test("no web source file names a crawl source", () => {
  const root = new URL("../src", import.meta.url).pathname;
  const offenders = files(root).filter(file => /london_theatre|playbill/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});
