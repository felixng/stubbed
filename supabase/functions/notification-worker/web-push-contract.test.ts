// @ts-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import { createECDH, randomBytes } from "node:crypto";

Deno.test("web-push encodes a VAPID-authenticated encrypted payload without network delivery", () => {
  const vapid = webpush.generateVAPIDKeys();
  const recipient = createECDH("prime256v1");
  recipient.generateKeys();
  const payload = JSON.stringify({ title: "Stubbed", body: "test-only private preview" });
  const details = webpush.generateRequestDetails({ endpoint: "https://web.push.apple.com/test-only", keys: { p256dh: recipient.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } }, payload,
    { TTL: 60, vapidDetails: { subject: "mailto:support@getstubbed.app", publicKey: vapid.publicKey, privateKey: vapid.privateKey } });
  const headers = Object.fromEntries(Object.entries(details.headers).map(([key,value]) => [key.toLowerCase(),String(value)]));
  if (headers["content-encoding"] !== "aes128gcm") throw new Error("Missing encryption");
  if (!headers.authorization.startsWith("vapid ")) throw new Error("Missing VAPID authentication");
  if (!details.body || new TextDecoder().decode(details.body).includes("test-only private preview")) throw new Error("Payload was not encrypted");
  if (headers.ttl !== "60") throw new Error("Expiry contract changed");
});
