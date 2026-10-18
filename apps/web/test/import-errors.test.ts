import assert from "node:assert/strict";
import { test } from "node:test";

import { importErrorText } from "@/lib/import/errors";

test("usage limits and outages read as unavailable", () => {
  const limit =
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."}}';
  assert.equal(importErrorText("photo", limit), "Couldn’t work out the show: reading is unavailable right now. Try again later.");
  assert.match(importErrorText("email", "Gemini 503: overloaded"), /^Couldn’t read this email: reading is unavailable/);
  assert.match(importErrorText("email", "Groq 429: slow down"), /unavailable/);
});

test("anything else stays short, never the raw response", () => {
  assert.equal(importErrorText("photo", '400 {"type":"error","error":{"message":"bad image"}}'), "Couldn’t work out the show.");
  assert.equal(importErrorText("email", null), "Couldn’t read this email.");
});
