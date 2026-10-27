import assert from "node:assert/strict";
import { test } from "node:test";

import { randomNonce, sha256Hex } from "@/lib/google-nonce";

test("randomNonce: URL-safe and different every time", () => {
  const a = randomNonce();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, randomNonce());
});

test("sha256Hex: the hex digest Google and Supabase compare", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
