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
      return body ? JSON.parse(body) : undefined;
    }
    const queue: DeliveryQueue = {
      claim: () => rpc<Lease[]>("claim_notification_jobs", { batch_size: 3 }),
      prepare: lease => rpc<PreparedJob | null>("prepare_notification_job", { job: lease.job_id, lease_token: lease.lease_id }),
      finish: (lease, result: SendResult) => rpc<void>("finish_notification_job", { job: lease.job_id, lease_token: lease.lease_id, result }),
    };
    const native = Deno.env.get("APNS_PRIVATE_KEY") ? createAPNsSender({ teamId: required("APNS_TEAM_ID"), keyId: required("APNS_KEY_ID"), privateKey: required("APNS_PRIVATE_KEY"), topic: "app.getstubbed" }) : null;
    const result = await dispatchBatch(queue, job => job.kind === "apns" && native
      ? native.send({ token: job.token, environment: job.environment }, job.notification, new Date(job.expires_at))
      : Promise.resolve("retryable"));
    // Counts only: never log tokens, endpoints, actors, entry titles or bodies.
    return Response.json(result);
  } catch {
    return Response.json({ error: "Notification worker unavailable" }, { status: 503 });
  }
});
