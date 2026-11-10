import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repo = join(process.cwd(), "..", "..");
const templates = join(repo, "supabase/templates");
const route = readFileSync(join(process.cwd(), "src/app/auth/confirm/route.ts"), "utf8");
const config = readFileSync(join(repo, "supabase/config.toml"), "utf8");
const files = readdirSync(templates).filter((f) => f.endsWith(".html"));

test("auth emails: every link type is one /auth/confirm accepts", () => {
  const accepted = route.match(/new Set<EmailOtpType>\(\[(.*?)\]\)/)?.[1] ?? "";
  for (const f of files) {
    const html = readFileSync(join(templates, f), "utf8");
    for (const [, type] of html.matchAll(/\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=(\w+)/g)) {
      assert.ok(accepted.includes(`"${type}"`), `${f} links type=${type}`);
    }
  }
  assert.ok(accepted.includes('"magiclink"') && accepted.includes('"invite"'));
});

test("auth emails: seven branded emails, all wired in config.toml, sign-up shows the code", () => {
  assert.equal(files.length, 7);
  for (const f of files) {
    assert.ok(config.includes(`./supabase/templates/${f}`), `${f} is wired`);
    const html = readFileSync(join(templates, f), "utf8");
    assert.ok(html.includes("Stubbed"), f);
    assert.ok(!/<script|<link /i.test(html), `${f} loads nothing external`);
  }
  assert.match(readFileSync(join(templates, "confirmation.html"), "utf8"), /\{\{ \.Token \}\}/);
  assert.match(config, /otp_length = 6/);
});
