// @ts-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import { createBrowserPushSender } from "../_shared/notifications/browser-push.ts";
import { createAPNsSender } from "../_shared/notifications/apns.ts";
import { dispatchBatch } from "../_shared/notifications/dispatch.ts";
import type { DeliveryQueue, Lease, PreparedJob, SendResult } from "../_shared/notifications/contracts.ts";

const required = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
const sameSecret = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0; for (let i=0; i<a.length; i++) mismatch |= a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch === 0;
};
Deno.serve(async request => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const expected = Deno.env.get("NOTIFICATION_WORKER_SECRET");
  if (!expected || !sameSecret(request.headers.get("x-notification-worker-secret") ?? "", expected)) return new Response(null, { status: 401 });
  try {
    const url = required("SUPABASE_URL");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    async function rpc<T>(name: string, params: unknown = {}): Promise<T> {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", signal: AbortSignal.timeout(10000), headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: JSON.stringify(params) });
      if (!response.ok) throw new Error("Queue operation failed");
      const body = await response.text();
      return JSON.parse(body || "null");
    }
    const queue: DeliveryQueue = {
      claim: () => rpc<Lease[]>("claim_notification_jobs", { batch_size: 3 }),
      prepare: lease => rpc<PreparedJob | null>("prepare_notification_job", { job: lease.job_id, lease_token: lease.lease_id }),
      finish: (lease, result: SendResult) => rpc<void>("finish_notification_job", { job: lease.job_id, lease_token: lease.lease_id, result }),
    };
    const nativeConfig = { teamId: Deno.env.get("APNS_TEAM_ID"), keyId: Deno.env.get("APNS_KEY_ID"), privateKey: Deno.env.get("APNS_PRIVATE_KEY") };
    const native = nativeConfig.teamId && nativeConfig.keyId && nativeConfig.privateKey
      ? createAPNsSender({ teamId: nativeConfig.teamId, keyId: nativeConfig.keyId, privateKey: nativeConfig.privateKey, topic: "app.getstubbed" }) : null;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const browser = vapidPublic && vapidPrivate ? createBrowserPushSender((subscription, alert, ttl) => {
      const details = webpush.generateRequestDetails(subscription, JSON.stringify(alert), {
        TTL: ttl, urgency: "normal", topic: alert.id.replace(/-/g, "").slice(0,32),
        vapidDetails: { subject: "mailto:support@getstubbed.app", publicKey: vapidPublic, privateKey: vapidPrivate },
      });
      if (!details.body) throw new Error("Payload encoding failed");
      return { endpoint: details.endpoint, headers: Object.fromEntries(Object.entries(details.headers).map(([key,value]) => [key,String(value)])), body: new Uint8Array(details.body) };
    }) : null;
    const result = await dispatchBatch(queue, job => {
      if (job.kind === "apns" && native) return native.send({ token: job.token, environment: job.environment }, job.notification, new Date(job.expires_at));
      if (job.kind === "web" && browser && job.subscription) return browser.send(job.subscription, job.notification, new Date(job.expires_at));
      return Promise.resolve("retryable");
    });
    // Counts only: never log tokens, endpoints, actors, entry titles or bodies.
    return Response.json(result);
  } catch {
    return Response.json({ error: "Notification worker unavailable" }, { status: 503 });
  }
});
