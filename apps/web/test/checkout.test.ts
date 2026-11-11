import { test } from "node:test";
import assert from "node:assert/strict";
import { FREE, type MembershipInfo, type ProConfig } from "../src/lib/membership";
import { checkoutEmail } from "../src/lib/revenuecat-web";
import {
  PurchaseFlow, checkoutAvailable, checkoutPreview, confirmMembership, manageTargets, membershipPreview, sourceLabel, statusLine, termsFor,
  type PurchaseState, type PurchasesClient,
} from "../src/lib/web-checkout";

const PRO: MembershipInfo = { tier: "pro", source: "subscription", expires_at: "2026-12-01T00:00:00Z", will_renew: true, is_trial: false, manage: ["web"] };
const ON: ProConfig = { name: "Pro", salesEnabled: true, gatesEnabled: true };
const OFFER = { available: true, trialEligible: true, terms: "t" };

// A clock that only moves when the test sleeps, so a 30 s timeout takes no real time.
function clock() { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; }

test("purchase → confirming → Pro", async () => {
  const c = clock(); const states: PurchaseState[] = []; let reads = 0, refreshes = 0;
  const flow = new PurchaseFlow({
    client: { purchase: async () => "purchased" },
    confirm: () => confirmMembership({ ...c, refresh: async () => { refreshes++; }, read: async () => (++reads < 3 ? FREE : PRO) }),
    onChange: (s) => states.push(s),
  });
  assert.equal(await flow.start("monthly"), "pro");
  assert.deepEqual(states, ["purchasing", "confirming", "pro"]);
  assert.equal(refreshes, 1);
  assert.equal(reads, 3);
});

test("the SDK reporting success alone never shows Pro: membership still Free times out", async () => {
  const c = clock();
  const flow = new PurchaseFlow({ client: { purchase: async () => "purchased" }, confirm: () => confirmMembership({ ...c, refresh: async () => {}, read: async () => FREE }) });
  assert.equal(await flow.start("monthly"), "timeout");
  assert.ok(c.now() >= 30_000, "polled for the full 30 seconds");
});

test("a failed refresh only slows things down", async () => {
  const c = clock();
  const result = await confirmMembership({ ...c, refresh: async () => { throw new Error("503"); }, read: async () => PRO });
  assert.equal(result, "pro");
});

test("timeout then retry re-checks membership and never opens checkout again", async () => {
  const c = clock(); let purchases = 0; let pro = false;
  const flow = new PurchaseFlow({
    client: { purchase: async () => { purchases++; return "purchased"; } },
    confirm: () => confirmMembership({ ...c, refresh: async () => {}, read: async () => (pro ? PRO : FREE) }),
  });
  assert.equal(await flow.start("monthly"), "timeout");
  pro = true;
  assert.equal(await flow.retry(), "pro");
  assert.equal(purchases, 1);
  assert.equal(await flow.retry(), "pro", "retry outside a timeout does nothing");
});

test("cancel returns quietly; a failure is an error, not Pro", async () => {
  const cancelled = new PurchaseFlow({ client: { purchase: async () => "cancelled" }, confirm: async () => "pro" });
  assert.equal(await cancelled.start("annual"), "cancelled");
  const failed = new PurchaseFlow({ client: { purchase: async () => { throw new Error("card declined"); } }, confirm: async () => "pro" });
  assert.equal(await failed.start("annual"), "error");
});

test("a double submit buys once", async () => {
  let purchases = 0; let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const client: Pick<PurchasesClient, "purchase"> = { purchase: async () => { purchases++; await gate; return "purchased"; } };
  const flow = new PurchaseFlow({ client, confirm: async () => "pro" });
  const first = flow.start("monthly");
  assert.equal(await flow.start("monthly"), "purchasing");
  release();
  assert.equal(await first, "pro");
  assert.equal(purchases, 1);
});

test("checkout is never offered to a Pro member, from the web or the App Store, or while sales are off", () => {
  assert.equal(checkoutAvailable(FREE, ON, OFFER), true);
  assert.equal(checkoutAvailable({ ...PRO, manage: ["app_store"] }, ON, OFFER), false);
  assert.equal(checkoutAvailable(PRO, ON, OFFER), false);
  assert.equal(checkoutAvailable(FREE, { ...ON, salesEnabled: false }, OFFER), false);
  assert.equal(checkoutAvailable(FREE, ON, { ...OFFER, available: false }), false);
  assert.equal(checkoutAvailable(null, ON, OFFER), false);
});

test("an empty key means the unavailable offer", async () => {
  const { webBillingKey } = await import("../src/lib/revenuecat-web");
  const saved = process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY;
  delete process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY;
  assert.equal(webBillingKey(), "");
  if (saved !== undefined) process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY = saved;
});

test("offer terms come from the provider's formatted values", () => {
  assert.equal(termsFor({ price: "£19.99", period: "year", trial: true }), "Free trial, then £19.99 per year. Renews until you cancel.");
  assert.equal(termsFor({ price: "£2.99", period: "month", trial: false }), "£2.99 per month. Renews until you cancel.");
});

test("membership page: manage targets, source and status wording", () => {
  assert.deepEqual(manageTargets(PRO), ["web"]);
  assert.deepEqual(manageTargets({ ...PRO, manage: ["app_store", "web"] }), ["app_store", "web"]);
  assert.deepEqual(manageTargets(FREE), []);
  assert.equal(sourceLabel({ ...PRO, manage: ["app_store"] }), "the App Store");
  assert.equal(sourceLabel({ ...PRO, manage: ["app_store", "web"] }), "App Store and the web");
  assert.equal(statusLine(PRO), "Renews on 1 December 2026.");
  assert.equal(statusLine({ ...PRO, is_trial: true }), "Free trial until 1 December 2026, then it renews.");
  assert.equal(statusLine({ ...PRO, will_renew: false }), "Ends on 1 December 2026. It won’t renew.");
  assert.equal(statusLine(FREE), "You’re on the free plan.");
});

test("preview overrides are ignored in production", () => {
  assert.equal(checkoutPreview("trial", "development"), "trial");
  assert.equal(checkoutPreview("trial", "production"), null);
  assert.equal(checkoutPreview("nonsense", "development"), null);
  assert.equal(membershipPreview("web", "development"), "web");
  assert.equal(membershipPreview("web", "production"), null);
});

test("checkout gets the account's email, so it doesn't ask again; anything odd is left out", () => {
  assert.equal(checkoutEmail("nfelix@example.com"), "nfelix@example.com");
  assert.equal(checkoutEmail("  someone@example.co.uk "), "someone@example.co.uk");
  for (const bad of [null, undefined, "", "   ", "not-an-email", "a@b", "a b@example.com"]) assert.equal(checkoutEmail(bad), undefined);
});
