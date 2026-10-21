import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { COLORS, designSystemMarkdown } from "@/lib/design-system";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

// The first block of each appearance in globals.css: dark is the :root
// default, light the prefers-color-scheme override.
function cssVars(block: string) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}
const dark = cssVars(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: light)")));
const light = cssVars(css.slice(css.indexOf("@media (prefers-color-scheme: light)"), css.indexOf("data-theme")));

test("design system colours match globals.css", () => {
  assert.deepEqual(Object.keys(light).sort(), COLORS.map((c) => c.name).sort());
  for (const c of COLORS) {
    assert.equal(c.light, light[c.name], `${c.name} light`);
    assert.equal(c.dark, dark[c.name], `${c.name} dark`);
  }
});

test("designSystemMarkdown: every token and the page link", () => {
  const md = designSystemMarkdown("https://example.com/design-system");
  assert.match(md, /^# Stubbed design system/);
  assert.ok(md.includes("https://example.com/design-system"));
  for (const c of COLORS) assert.ok(md.includes(`--${c.name}: ${c.light};`), c.name);
});
