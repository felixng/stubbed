import type { MembershipInfo, ProConfig } from "@/lib/membership";
import type { Offer } from "@/lib/paywall";

// Web checkout (#468, docs/PAYWALL.md section 7). Everything here is pure or takes its
// dependencies, so tests mock the RevenueCat SDK wrapper. The SDK, a forged success URL or a
// purchase promise never grants Pro: only `my_membership()` does, after the server has refreshed.

export type Plan = { id: string; name: string; price: string; period: string; trial: boolean };
export type LoadedOffer = { offer: Offer; plans: Plan[] };
export type PurchaseOutcome = "purchased" | "cancelled";

// The browser SDK behind an interface (lib/revenuecat-web.ts is the real one).
export interface PurchasesClient {
  loadOffer(): Promise<LoadedOffer>;
  /** Resolves "cancelled" when the person closes checkout; rejects on a real failure. */
  purchase(planId: string): Promise<PurchaseOutcome>;
  managementURL(): Promise<string | null>;
}

export const APP_STORE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

// The offer line under the button, from the provider's own formatted values.
export function termsFor(plan: Pick<Plan, "price" | "period" | "trial">): string {
  return plan.trial
    ? `Free trial, then ${plan.price} per ${plan.period}. Renews until you cancel.`
    : `${plan.price} per ${plan.period}. Renews until you cancel.`;
}

// Never offer checkout to someone who is already Pro, from the web or the App Store, or while
// sales are off or the provider has nothing to sell.
export function checkoutAvailable(info: MembershipInfo | null, config: ProConfig, offer: Offer): boolean {
  return info != null && info.tier !== "pro" && config.salesEnabled && offer.available;
}

// Poll my_membership() after a purchase: refresh on the server first (a failed refresh is only a
// slower path, the webhook still arrives), then read with a growing delay for up to `timeoutMs`.
export async function confirmMembership(deps: {
  refresh: () => Promise<unknown>;
  read: () => Promise<MembershipInfo>;
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}): Promise<"pro" | "timeout"> {
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.timeoutMs ?? 30_000);
  await deps.refresh().catch(() => {});
  for (let attempt = 0; ; attempt++) {
    const info = await deps.read().catch(() => null);
    if (info?.tier === "pro") return "pro";
    if (now() >= deadline) return "timeout";
    await deps.sleep(Math.min(1000 * 2 ** attempt, 5000));
  }
}

export type PurchaseState = "idle" | "purchasing" | "confirming" | "timeout" | "cancelled" | "error" | "pro";

// One purchase at a time: a second start() while one is in flight does nothing, so a double click
// can't buy twice. After a timeout only retry() runs, which re-checks membership and never opens
// checkout again.
export class PurchaseFlow {
  state: PurchaseState = "idle";
  private deps: {
    client: Pick<PurchasesClient, "purchase">;
    confirm: () => Promise<"pro" | "timeout">;
    onChange?: (state: PurchaseState) => void;
  };
  constructor(deps: PurchaseFlow["deps"]) {
    this.deps = deps;
  }

  private set(state: PurchaseState) {
    this.state = state;
    this.deps.onChange?.(state);
  }

  async start(planId: string): Promise<PurchaseState> {
    if (this.state === "purchasing" || this.state === "confirming") return this.state;
    this.set("purchasing");
    try {
      if ((await this.deps.client.purchase(planId)) === "cancelled") {
        this.set("cancelled");
        return this.state;
      }
    } catch {
      this.set("error");
      return this.state;
    }
    return this.confirm();
  }

  async retry(): Promise<PurchaseState> {
    if (this.state !== "timeout") return this.state;
    return this.confirm();
  }

  private async confirm(): Promise<PurchaseState> {
    this.set("confirming");
    this.set((await this.deps.confirm()) === "pro" ? "pro" : "timeout");
    return this.state;
  }
}

export const busy = (state: PurchaseState) => state === "purchasing" || state === "confirming";

// The membership page.
export type ManageTarget = "web" | "app_store";

export function manageTargets(info: MembershipInfo): ManageTarget[] {
  return info.tier === "pro" ? info.manage.filter((m): m is ManageTarget => m === "web" || m === "app_store") : [];
}

export function sourceLabel(info: MembershipInfo): string {
  const t = manageTargets(info);
  if (t.length === 2) return "App Store and the web";
  if (t[0] === "app_store") return "the App Store";
  if (t[0] === "web") return "the web";
  return info.source === "grant" ? "a gift from Stubbed" : "a subscription";
}

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

export function statusLine(info: MembershipInfo): string {
  if (info.tier !== "pro") return "You’re on the free plan.";
  const date = info.expires_at ? DATE.format(new Date(info.expires_at)) : null;
  if (info.is_trial) return date ? `Free trial until ${date}, then it renews.` : "Free trial.";
  if (info.will_renew) return date ? `Renews on ${date}.` : "Renews automatically.";
  return date ? `Ends on ${date}. It won’t renew.` : "It won’t renew.";
}

// Development-only previews for screenshots (ignored in production builds).
export type CheckoutPreview = "trial" | "standard" | "confirming" | "timeout";
export function checkoutPreview(value: string | string[] | null | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): CheckoutPreview | null {
  const v = Array.isArray(value) ? value[0] : value;
  return nodeEnv !== "production" && (v === "trial" || v === "standard" || v === "confirming" || v === "timeout") ? v : null;
}
export function membershipPreview(value: string | string[] | null | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): "free" | "web" | "app_store" | null {
  const v = Array.isArray(value) ? value[0] : value;
  return nodeEnv !== "production" && (v === "free" || v === "web" || v === "app_store") ? v : null;
}
