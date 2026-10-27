import assert from "node:assert/strict";
import { test } from "node:test";

import { exchangeGoogleCode, googleOAuthConfig } from "@/lib/google-oauth";

const ENV = { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "web-client", GOOGLE_CLIENT_SECRET: "secret" };

test("googleOAuthConfig: needs both the client ID and the secret", () => {
  assert.equal(googleOAuthConfig({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "web-client" }), null);
  assert.deepEqual(googleOAuthConfig(ENV), { clientId: "web-client", clientSecret: "secret" });
});

test("exchangeGoogleCode: not configured without the secret, and never calls Google", async () => {
  let called = false;
  const result = await exchangeGoogleCode("code", {}, (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch);
  assert.deepEqual(result, { ok: false, reason: "not-configured" });
  assert.equal(called, false);
});

test("exchangeGoogleCode: posts the popup code flow and returns the ID token", async () => {
  let sent: URLSearchParams | null = null;
  const result = await exchangeGoogleCode("abc", ENV, (async (_url: string, init: RequestInit) => {
    sent = init.body as URLSearchParams;
    return Response.json({ id_token: "id.jwt", access_token: "access" });
  }) as typeof fetch);
  assert.deepEqual(result, { ok: true, tokens: { idToken: "id.jwt", accessToken: "access" } });
  assert.equal(sent!.get("redirect_uri"), "postmessage");
  assert.equal(sent!.get("client_secret"), "secret");
  assert.equal(sent!.get("code"), "abc");
});

test("exchangeGoogleCode: a refused code is a failure", async () => {
  const result = await exchangeGoogleCode("bad", ENV, (async () =>
    Response.json({ error: "invalid_grant" }, { status: 400 })) as typeof fetch);
  assert.deepEqual(result, { ok: false, reason: "failed" });
});
