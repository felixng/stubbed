import type { NativePushSender, SendResult } from "./contracts.ts";

export function apnsResult(status: number, reason?: string): SendResult {
  if (status === 200) return "accepted";
  if (status === 410 || (status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason ?? ""))) return "invalid_destination";
  if (status === 429 || status >= 500 || reason === "ExpiredProviderToken") return "retryable";
  return "permanent";
}
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
export function createAPNsSender(config: { teamId: string; keyId: string; privateKey: string; topic: string }, request: typeof fetch = fetch): NativePushSender {
  let cached: { jwt: string; created: number } | undefined;
  let key: CryptoKey | undefined;
  async function authorization() {
    if (cached && Date.now() - cached.created < 50 * 60 * 1000) return cached.jwt;
    if (!key) {
      const pem = config.privateKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
      key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    }
    const unsigned = `${encode({ alg: "ES256", kid: config.keyId })}.${encode({ iss: config.teamId, iat: Math.floor(Date.now()/1000) })}`;
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
    cached = { jwt: `${unsigned}.${base64url(new Uint8Array(signature))}`, created: Date.now() };
    return cached.jwt;
  }
  return {
    async send(destination, alert, expiresAt) {
      const host = destination.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
      const response = await request(`https://${host}/3/device/${destination.token}`, {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: {
          authorization: `bearer ${await authorization()}`, "apns-topic": config.topic,
          "apns-push-type": "alert", "apns-priority": "5", "apns-collapse-id": alert.id,
          "apns-expiration": String(Math.floor(expiresAt.getTime()/1000)), "content-type": "application/json",
        },
        body: JSON.stringify({ aps: { alert: { title: alert.title, body: alert.body }, sound: "default", "thread-id": alert.id }, url: alert.url, notification_id: alert.id }),
      });
      const reason = response.ok ? undefined : (await response.json().catch(() => ({})) as { reason?: string }).reason;
      if (reason === "ExpiredProviderToken") cached = undefined;
      return apnsResult(response.status, reason);
    },
  };
}
