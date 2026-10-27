import assert from "node:assert/strict";
import { test } from "node:test";

import { randomNonce } from "@/lib/google-nonce";

test("randomNonce: URL-safe and different every time", () => {
  const a = randomNonce();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, randomNonce());
});
