import type { Alert, BrowserPushSender, BrowserSubscription, SendResult } from "./contracts.ts";
export type WebPushEncoder = (subscription: BrowserSubscription, alert: Alert, ttl: number) => { endpoint: string; headers: Record<string,string>; body: Uint8Array };
export function supportedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443")
      && ["web.push.apple.com", "fcm.googleapis.com", "updates.push.services.mozilla.com"].includes(url.hostname) && url.pathname.length > 1;
  } catch { return false; }
}
export function browserPushResult(status: number): SendResult {
  if (status >= 200 && status < 300) return "accepted";
  if (status === 404 || status === 410) return "invalid_destination";
  if (status === 429 || status >= 500) return "retryable";
  return "permanent";
}
export function createBrowserPushSender(encode: WebPushEncoder, request: typeof fetch = fetch): BrowserPushSender {
  return { async send(subscription, alert, expiresAt) {
    if (!supportedPushEndpoint(subscription.endpoint)) return "permanent";
    const ttl = Math.floor((expiresAt.getTime()-Date.now())/1000);
    if (ttl <= 0) return "permanent";
    let details: ReturnType<WebPushEncoder>;
    try { details = encode(subscription, alert, ttl); } catch { return "permanent"; }
    if (details.endpoint !== subscription.endpoint) return "permanent";
    try {
      const response = await request(details.endpoint, { method: "POST", headers: details.headers, body: new Uint8Array(details.body), redirect: "error", signal: AbortSignal.timeout(10000) });
      await response.body?.cancel();
      return browserPushResult(response.status);
    } catch { return "retryable"; }
  } };
}
