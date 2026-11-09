import { fetchSubscriber } from "./revenuecat";
import { syncUser, type BillingDeps } from "./sync";

// Backstage billing support (#466). Pure, so tests need no network, session or database.

// The configuration billing needs. Only whether each is set; a value never leaves the server.
export const BILLING_ENV = [
  "SUPABASE_SECRET_KEY",
  "REVENUECAT_SECRET_API_KEY",
  "REVENUECAT_WEBHOOK_AUTH",
  "CRON_SECRET",
  "NEXT_PUBLIC_REVENUECAT_WEB_BILLING_KEY",
] as const;

export function billingHealth(env: Record<string, string | undefined>): { name: string; set: boolean }[] {
  return BILLING_ENV.map((name) => ({ name, set: Boolean(env[name]) }));
}

// Re-fetch one member's state from RevenueCat and apply it, as `/api/billing/refresh` does for
// the caller. Only for an admin; anyone else is refused before anything is read.
export async function resyncAsAdmin(isAdmin: boolean, userId: string, deps: BillingDeps): Promise<{ ok: boolean; message: string }> {
  if (!isAdmin) return { ok: false, message: "Admins only." };
  if (!deps.store || !deps.secrets.revenuecatKey) return { ok: false, message: "Billing isn’t configured." };
  try {
    await syncUser(userId, deps);
    return { ok: true, message: "Re-synced from RevenueCat." };
  } catch (error) {
    return { ok: false, message: `Re-sync failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// A throwaway lookup that proves the secret key is accepted. RevenueCat creates an empty
// anonymous customer for an unknown id, so this runs on a button, not on every page view.
export async function testRevenueCatKey(isAdmin: boolean, secretKey: string | undefined, fetcher?: typeof fetch): Promise<{ ok: boolean; message: string }> {
  if (!isAdmin) return { ok: false, message: "Admins only." };
  if (!secretKey) return { ok: false, message: "REVENUECAT_SECRET_API_KEY isn’t set." };
  try {
    await fetchSubscriber("$RCAnonymousID:stubbed-health-check", secretKey, fetcher);
    return { ok: true, message: "RevenueCat accepted the key." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "RevenueCat could not be reached." };
  }
}
