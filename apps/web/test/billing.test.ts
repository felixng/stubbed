import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { toSubscriptionRows, type RcSubscription } from "../src/lib/billing/revenuecat";
import { handleReconcile, handleRefresh, handleWebhook, type BillingDeps, type BillingStore } from "../src/lib/billing/sync";

const NOW = new Date("2026-11-09T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();
const sub = (patch: RcSubscription): RcSubscription => ({ store: "app_store", store_transaction_id: "tx", is_sandbox: false, expires_date: day(10), period_type: "normal", ...patch });
const rows = (subs: Record<string, RcSubscription>) => toSubscriptionRows({ subscriptions: subs }, NOW);
const statusOf = (patch: RcSubscription) => rows({ pro: sub(patch) })[0];

test("mapping: statuses, first match wins", () => {
  assert.equal(statusOf({}).status, "active");
  assert.equal(statusOf({ period_type: "trial" }).status, "trial");
  assert.equal(statusOf({ unsubscribe_detected_at: day(-1) }).status, "cancelled");
  assert.equal(statusOf({ unsubscribe_detected_at: day(-1) }).will_renew, false);
  assert.equal(statusOf({ billing_issues_detected_at: day(-1), expires_date: day(-1), grace_period_expires_date: day(3) }).status, "grace");
  assert.equal(statusOf({ billing_issues_detected_at: day(-1), expires_date: day(-1), grace_period_expires_date: day(3) }).period_end, day(3));
  assert.equal(statusOf({ refunded_at: day(-2) }).status, "refunded");
  assert.equal(statusOf({ refunded_at: day(-2), expires_date: day(-5) }).status, "refunded");
  assert.equal(statusOf({ expires_date: day(-1), period_type: "trial" }).status, "expired");
  assert.equal(statusOf({ refunded_at: day(-2) }).will_renew, false);
  assert.equal(statusOf({}).will_renew, true);
});

test("mapping: provider, environment and skipped entries", () => {
  const skipped: string[] = [];
  const out = toSubscriptionRows({ subscriptions: {
    ios: sub({ store_transaction_id: "a", is_sandbox: true }),
    web: sub({ store: "rc_billing", store_transaction_id: "b" }),
    play: sub({ store: "play_store", store_transaction_id: "c" }),
    noexpiry: sub({ store_transaction_id: "d", expires_date: null }),
    notx: sub({ store_transaction_id: null }),
  } }, NOW, (why) => skipped.push(why));
  assert.deepEqual(out.map((r) => [r.product_id, r.provider, r.environment]), [["ios", "app_store", "sandbox"], ["web", "rc_web", "production"]]);
  assert.equal(skipped.length, 3);
});

test("mapping: the same user on iOS and web gives two rows; a duplicate transaction keeps the later period", () => {
  const both = rows({ ios: sub({ store_transaction_id: "a" }), web: sub({ store: "rc_billing", store_transaction_id: "a" }) });
  assert.equal(both.length, 2);
  const dup = rows({ monthly: sub({ store_transaction_id: "a", expires_date: day(5) }), annual: sub({ store_transaction_id: "a", expires_date: day(50) }) });
  assert.deepEqual(dup.map((r) => r.product_id), ["annual"]);
});

// A fake store and a RevenueCat that serves the latest state for each user.
const USER = "aaaaaaaa-0000-0000-0000-000000000000";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000000";
function setup(options: { failApply?: boolean; states?: Record<string, Record<string, RcSubscription>> } = {}) {
  const state = { events: new Map<string, { processed: boolean; error?: string }>(), applied: [] as { user: string; rows: unknown; event?: string }[], deleted: [] as string[], rcDeleted: [] as string[], cleared: [] as string[], reconciles: 0, users: new Set([USER, OTHER]) };
  const states = options.states ?? { [USER]: { pro: sub({}) }, [OTHER]: {} };
  const store: BillingStore = {
    async userExists(id) { return state.users.has(id); },
    async recordEvent(id) { const e = state.events.get(id) ?? { processed: false }; state.events.set(id, e); return { processed: e.processed }; },
    async recordReconcile() { state.reconciles++; },
    async failEvent(id, error) { state.events.get(id)!.error = error; },
    async applySnapshot(user, rows, event) {
      if (options.failApply) throw new Error("db down");
      state.applied.push({ user, rows, event });
      if (event) state.events.get(event)!.processed = true;
      return { tier: "pro" };
    },
    async usersToReconcile() { return [USER, OTHER]; },
    async queuedDeletions() { return ["gone-user"]; },
    async clearDeletion(id) { state.cleared.push(id); },
  };
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const id = decodeURIComponent(String(url).split("/").pop()!);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer rc-key");
    if (init?.method === "DELETE") { state.rcDeleted.push(id); return new Response(null, { status: 200 }); }
    return Response.json({ subscriber: { subscriptions: states[id] ?? {} } });
  }) as typeof fetch;
  const deps: BillingDeps = { secrets: { revenuecatKey: "rc-key", webhookAuth: "hook-secret", cronSecret: "cron" }, store, fetcher, now: () => NOW };
  return { state, deps };
}
const hook = (event: object, auth: string | null = "hook-secret") =>
  new Request("https://x/api/billing/revenuecat", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify({ event }) });

test("webhook: wrong or missing auth is 401 and applies nothing", async () => {
  const { state, deps } = setup();
  for (const auth of ["nope", null, "Bearer nope", "Bearer ", "hook-secretX"]) {
    assert.equal((await handleWebhook(hook({ id: "e", app_user_id: USER }, auth), deps)).status, 401);
  }
  assert.equal(state.applied.length, 0);
});

test("webhook: a Bearer prefix or stray whitespace on either side still matches the secret", async () => {
  for (const [header, stored] of [["Bearer hook-secret", "hook-secret"], ["hook-secret", "Bearer hook-secret"], ["bearer hook-secret", "hook-secret\n"], [" hook-secret ", " hook-secret"]]) {
    const { deps } = setup();
    deps.secrets.webhookAuth = stored;
    assert.equal((await handleWebhook(hook({ id: `e-${header}`, app_user_id: USER }, header), deps)).status, 200, `${JSON.stringify(header)} vs ${JSON.stringify(stored)}`);
  }
});

test("webhook: applies the fetched state once; a duplicate is not applied twice", async () => {
  const { state, deps } = setup();
  assert.equal((await handleWebhook(hook({ id: "e1", type: "RENEWAL", app_user_id: USER }), deps)).status, 200);
  assert.equal(state.applied.length, 1);
  assert.equal(state.applied[0].event, "e1");
  const again = await handleWebhook(hook({ id: "e1", type: "RENEWAL", app_user_id: USER }), deps);
  assert.equal(again.status, 200);
  assert.equal(state.applied.length, 1);
});

test("webhook: out-of-order events converge on the same state", async () => {
  const a = setup(), b = setup();
  for (const id of ["e-new", "e-old"]) await handleWebhook(hook({ id, app_user_id: USER }), a.deps);
  for (const id of ["e-old", "e-new"]) await handleWebhook(hook({ id, app_user_id: USER }), b.deps);
  assert.deepEqual(a.state.applied.at(-1)!.rows, b.state.applied.at(-1)!.rows);
});

test("webhook: a failing apply is 500 and leaves the event unprocessed", async () => {
  const { state, deps } = setup({ failApply: true });
  assert.equal((await handleWebhook(hook({ id: "e1", app_user_id: USER }), deps)).status, 500);
  assert.equal(state.events.get("e1")!.processed, false);
  assert.equal(state.events.get("e1")!.error, "db down");
});

test("webhook: anonymous and unknown ids are acknowledged and ignored", async () => {
  const { state, deps } = setup();
  for (const id of ["$RCAnonymousID:abc", "cccccccc-0000-0000-0000-000000000000"]) {
    assert.equal((await handleWebhook(hook({ id: "e", app_user_id: id }), deps)).status, 200);
  }
  assert.equal(state.applied.length, 0);
  assert.equal(state.events.size, 0);
});

test("webhook: a transfer syncs both sides and marks the event processed last", async () => {
  const { state, deps } = setup();
  await handleWebhook(hook({ id: "t1", type: "TRANSFER", transferred_from: [USER], transferred_to: ["$RCAnonymousID:x", OTHER] }), deps);
  assert.deepEqual(state.applied.map((a) => [a.user, a.event]), [[USER, undefined], [OTHER, "t1"]]);
});

test("refresh: no session is 401; the caller comes from the session, not the body", async () => {
  const { state, deps } = setup();
  assert.equal((await handleRefresh(null, deps)).status, 401);
  assert.equal(state.applied.length, 0);
  const response = await handleRefresh(USER, deps); // a body naming OTHER never reaches the handler
  assert.deepEqual(await response.json(), { membership: { tier: "pro" } });
  assert.deepEqual(state.applied.map((a) => a.user), [USER]);
});

test("reconcile: needs the cron secret, re-syncs users and clears queued deletions", async () => {
  const { state, deps } = setup();
  const call = (auth?: string) => handleReconcile(new Request("https://x", { headers: auth ? { authorization: auth } : {} }), deps);
  assert.equal((await call()).status, 401);
  assert.equal((await call("Bearer wrong")).status, 401);
  const response = await call("Bearer cron");
  assert.deepEqual(await response.json(), { reconciled: 2, failed: 0, deleted: 1, remaining_deletions: 0 });
  assert.deepEqual(state.rcDeleted, ["gone-user"]);
  assert.deepEqual(state.cleared, ["gone-user"]);
  assert.equal(state.reconciles, 1);
});

test("every route is 503 when its configuration is missing", async () => {
  const { deps } = setup();
  const bare = (secrets: BillingDeps["secrets"], store: BillingDeps["store"] = deps.store): BillingDeps => ({ ...deps, secrets, store });
  const req = new Request("https://x", { method: "POST", headers: { authorization: "hook-secret" }, body: "{}" });
  for (const d of [bare({}), bare({ revenuecatKey: "k", webhookAuth: "h" }, null), bare({ webhookAuth: "h" }), bare({ revenuecatKey: "k" })]) {
    assert.equal((await handleWebhook(req, d)).status, 503);
  }
  assert.equal((await handleRefresh(USER, bare({}))).status, 503);
  assert.equal((await handleRefresh(USER, bare({ revenuecatKey: "k" }, null))).status, 503);
  assert.equal((await handleReconcile(req, bare({ revenuecatKey: "k" }))).status, 503);
  assert.equal((await handleReconcile(req, bare({ cronSecret: "c" }))).status, 503);
});

test("only the billing code imports the service-key client", () => {
  const src = join(import.meta.dirname, "../src");
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  })(src);
  const importers = files.filter((f) => /supabase\/admin["']/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(src.length + 1));
  assert.deepEqual(importers, ["lib/billing/store.ts"]);
});

import { billingHealth, resyncAsAdmin, testRevenueCatKey } from "../src/lib/billing/admin";

test("billing health reports whether each variable is set and never its value", () => {
  const env = { SUPABASE_SECRET_KEY: "super-secret-value", CRON_SECRET: "", REVENUECAT_SECRET_API_KEY: "sk_live_x" };
  const health = billingHealth(env);
  assert.deepEqual(health.map((v) => [v.name, v.set]), [
    ["SUPABASE_SECRET_KEY", true], ["REVENUECAT_SECRET_API_KEY", true], ["REVENUECAT_WEBHOOK_AUTH", false],
    ["CRON_SECRET", false], ["NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY", false]]);
  assert.ok(!JSON.stringify(health).includes("super-secret-value") && !JSON.stringify(health).includes("sk_live_x"));
});

test("re-sync: a non-admin is refused before anything is fetched; an admin syncs the member", async () => {
  const { state, deps } = setup();
  const refused = await resyncAsAdmin(false, USER, deps);
  assert.equal(refused.ok, false);
  assert.equal(state.applied.length, 0);
  assert.equal((await resyncAsAdmin(true, USER, deps)).ok, true);
  assert.deepEqual(state.applied.map((a) => a.user), [USER]);
  assert.equal((await resyncAsAdmin(true, USER, setup({ failApply: true }).deps)).ok, false);
});

test("key test: refused for a non-admin, reports success or failure for an admin", async () => {
  const ok = (async () => Response.json({ subscriber: {} })) as unknown as typeof fetch;
  const denied = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
  assert.equal((await testRevenueCatKey(false, "k", ok)).ok, false);
  assert.equal((await testRevenueCatKey(true, undefined, ok)).ok, false);
  assert.equal((await testRevenueCatKey(true, "k", ok)).ok, true);
  assert.equal((await testRevenueCatKey(true, "k", denied)).ok, false);
});
