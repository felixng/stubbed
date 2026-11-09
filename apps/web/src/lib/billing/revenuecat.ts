// RevenueCat REST API v1 (docs/PAYWALL.md section 5). RevenueCat's current view of a customer is
// what we trust, never an event body or a client's claim. Pure apart from `fetchSubscriber`.

export type SubscriptionRow = {
  provider: "app_store" | "rc_web";
  product_id: string;
  store_transaction_id: string;
  environment: "sandbox" | "production";
  status: "trial" | "active" | "grace" | "cancelled" | "expired" | "refunded";
  will_renew: boolean;
  period_end: string;
};

// The fields of a v1 subscriber's `subscriptions` entries that we read.
export type RcSubscription = {
  store?: string;
  store_transaction_id?: string | null;
  is_sandbox?: boolean;
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string;
  refunded_at?: string | null;
  billing_issues_detected_at?: string | null;
  unsubscribe_detected_at?: string | null;
};
export type RcSubscriber = { subscriptions?: Record<string, RcSubscription> };

const PROVIDERS: Record<string, SubscriptionRow["provider"]> = { app_store: "app_store", rc_billing: "rc_web" };
const API = "https://api.revenuecat.com/v1/subscribers";

export async function fetchSubscriber(appUserId: string, secretKey: string, fetcher: typeof fetch = fetch): Promise<RcSubscriber> {
  const response = await fetcher(`${API}/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`RevenueCat returned ${response.status}`);
  const body = (await response.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? {};
}

export async function deleteSubscriber(appUserId: string, secretKey: string, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(`${API}/${encodeURIComponent(appUserId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(15000),
  });
  // 404: RevenueCat never knew them, or already deleted. Either way it is gone.
  if (!response.ok && response.status !== 404) throw new Error(`RevenueCat returned ${response.status}`);
}

const time = (value: string | null | undefined) => (value ? Date.parse(value) : NaN);

// One row per subscription RevenueCat lists. Stores we don't sell through, and entries without
// an expiry or transaction id, are skipped and reported to `skip`.
export function toSubscriptionRows(subscriber: RcSubscriber, now = new Date(), skip: (why: string) => void = () => {}): SubscriptionRow[] {
  const rows = new Map<string, SubscriptionRow>();
  for (const [productId, sub] of Object.entries(subscriber.subscriptions ?? {})) {
    const provider = PROVIDERS[sub.store ?? ""];
    if (!provider) { skip(`unsupported store ${sub.store ?? "unknown"} for ${productId}`); continue; }
    const expires = time(sub.expires_date);
    if (!sub.store_transaction_id || Number.isNaN(expires)) { skip(`incomplete subscription ${productId}`); continue; }

    const periodEnd = Math.max(expires, time(sub.grace_period_expires_date) || 0);
    const refunded = Boolean(sub.refunded_at);
    const expired = periodEnd <= now.getTime();
    const status: SubscriptionRow["status"] = refunded ? "refunded"
      : expired ? "expired"
      : sub.billing_issues_detected_at ? "grace"
      : sub.period_type === "trial" ? "trial"
      : sub.unsubscribe_detected_at ? "cancelled"
      : "active";
    const row: SubscriptionRow = {
      provider,
      product_id: productId,
      store_transaction_id: sub.store_transaction_id,
      environment: sub.is_sandbox ? "sandbox" : "production",
      status,
      will_renew: !sub.unsubscribe_detected_at && !refunded && !expired,
      period_end: new Date(periodEnd).toISOString(),
    };
    // The table is unique on (provider, environment, transaction): keep the later period.
    const key = `${row.provider}|${row.environment}|${row.store_transaction_id}`;
    const seen = rows.get(key);
    if (!seen || seen.period_end < row.period_end) rows.set(key, row);
  }
  return [...rows.values()];
}
