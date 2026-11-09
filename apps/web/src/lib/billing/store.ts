import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingDeps, BillingStore } from "./sync";

// Secrets come from the environment; a missing one makes the route answer 503.
export function billingDeps(): BillingDeps {
  return {
    secrets: {
      revenuecatKey: process.env.REVENUECAT_SECRET_API_KEY || undefined,
      webhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH || undefined,
      cronSecret: process.env.CRON_SECRET || undefined,
    },
    store: supabaseStore(),
    log: (message) => console.error(message),
  };
}

function supabaseStore(): BillingStore | null {
  const db = createAdminClient();
  if (!db) return null;
  const check = <T extends { error: { message: string } | null }>(result: T) => {
    if (result.error) throw new Error(result.error.message);
    return result;
  };
  return {
    async userExists(id) {
      const { data } = check(await db.from("profiles").select("id").eq("id", id).maybeSingle());
      return Boolean(data);
    },
    async recordEvent(eventId) {
      check(await db.from("billing_events").upsert({ event_id: eventId }, { onConflict: "event_id", ignoreDuplicates: true }));
      const { data } = check(await db.from("billing_events").select("processed_at").eq("event_id", eventId).single());
      return { processed: Boolean(data?.processed_at) };
    },
    async failEvent(eventId, error) {
      check(await db.from("billing_events").update({ error: error.slice(0, 500) }).eq("event_id", eventId));
    },
    async applySnapshot(userId, rows, eventId) {
      const { data } = check(await db.rpc("billing_apply_snapshot", { uid: userId, rows, event_id: eventId ?? null }));
      return data;
    },
    async usersToReconcile(since, limit) {
      const { data } = check(await db.from("subscriptions").select("user_id, updated_at")
        .gt("period_end", since.toISOString()).order("updated_at", { ascending: true }).limit(limit * 3));
      return [...new Set((data ?? []).map((row) => row.user_id as string))].slice(0, limit);
    },
    async queuedDeletions(limit) {
      const { data } = check(await db.from("billing_customer_deletions").select("app_user_id").order("queued_at").limit(limit));
      return (data ?? []).map((row) => row.app_user_id as string);
    },
    async clearDeletion(appUserId) {
      check(await db.from("billing_customer_deletions").delete().eq("app_user_id", appUserId));
    },
  };
}
