import type { DeliveryQueue, PreparedJob, SendResult } from "./contracts.ts";

/** Policy is rechecked by prepare immediately before each send. Leases and
 * retry schedules belong to Postgres, not the provider adapters. */
export async function dispatchBatch(queue: DeliveryQueue, send: (job: PreparedJob) => Promise<SendResult>) {
  const leases = await queue.claim();
  let processed = 0;
  for (const lease of leases) {
    const job = await queue.prepare(lease);
    if (!job) continue;
    let result: SendResult;
    try { result = new Date(job.expires_at).getTime() <= Date.now() ? "permanent" : await send(job); }
    catch { result = "retryable"; }
    // A failed acknowledgement leaves a lease to recover, rather than claiming
    // successful persistence. A crash here may cause a duplicate device alert.
    await queue.finish(lease, result);
    processed++;
  }
  return { claimed: leases.length, processed };
}
