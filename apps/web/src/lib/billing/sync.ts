import { timingSafeEqual } from "node:crypto";
import { bearerToken } from "@/lib/supabase/bearer";
import { fetchSubscriber as rcFetch, deleteSubscriber as rcDelete, toSubscriptionRows, type SubscriptionRow } from "./revenuecat";

// Membership sync: webhook, refresh and daily reconcile (docs/PAYWALL.md section 5). The routes
// are thin; everything here takes its dependencies, so tests run it with fakes and no network.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BillingSecrets = { revenuecatKey?: string; webhookAuth?: string; cronSecret?: string };

export interface BillingStore {
  userExists(id: string): Promise<boolean>;
  /** Records an event id; reports whether it was already processed. */
  recordEvent(eventId: string, userId: string): Promise<{ processed: boolean }>;
  /** Notes that a reconcile run finished, for the backstage billing health. */
  recordReconcile(): Promise<void>;
  failEvent(eventId: string, error: string): Promise<void>;
  /** Replaces the user's subscriptions and returns the resulting membership. */
  applySnapshot(userId: string, rows: SubscriptionRow[], eventId?: string): Promise<unknown>;
  /** Users with a subscription ending after `since`, least recently synced first. */
  usersToReconcile(since: Date, limit: number): Promise<string[]>;
  queuedDeletions(limit: number): Promise<string[]>;
  clearDeletion(appUserId: string): Promise<void>;
}

export type BillingDeps = {
  secrets: BillingSecrets;
  store: BillingStore | null;
  fetcher?: typeof fetch;
  now?: () => Date;
  log?: (message: string) => void;
};

const notConfigured = () => Response.json({ error: "billing_not_configured" }, { status: 503 });

function safeEqual(a: string | null | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function syncUser(userId: string, deps: BillingDeps, eventId?: string) {
  const subscriber = await rcFetch(userId, deps.secrets.revenuecatKey!, deps.fetcher);
  const rows = toSubscriptionRows(subscriber, deps.now?.(), (why) => deps.log?.(`billing: skipped ${why}`));
  return deps.store!.applySnapshot(userId, rows, eventId);
}

export async function handleWebhook(request: Request, deps: BillingDeps): Promise<Response> {
  const { secrets, store } = deps;
  if (!store || !secrets.revenuecatKey || !secrets.webhookAuth) return notConfigured();
  if (!safeEqual(request.headers.get("authorization"), secrets.webhookAuth)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { event?: Record<string, unknown> } | null;
  const event = body?.event;
  const eventId = typeof event?.id === "string" ? event.id : null;
  if (!event || !eventId) return Response.json({ error: "invalid_event" }, { status: 400 });

  // A transfer moves purchases between two ids; every other event concerns one.
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const candidates = event.type === "TRANSFER"
    ? [...strings(event.transferred_from), ...strings(event.transferred_to)]
    : typeof event.app_user_id === "string" ? [event.app_user_id] : [];

  // Anonymous ids ($RCAnonymousID:…) and users we don't know have nothing to sync.
  const users: string[] = [];
  for (const id of new Set(candidates)) {
    if (UUID.test(id) && (await store.userExists(id.toLowerCase()))) users.push(id.toLowerCase());
  }
  if (!users.length) return Response.json({ ok: true, skipped: true });

  try {
    if ((await store.recordEvent(eventId, users[0])).processed) return Response.json({ ok: true, duplicate: true });
    // The event is marked processed by the last apply, so a failure part-way is retried in full.
    for (const [i, id] of users.entries()) await syncUser(id, deps, i === users.length - 1 ? eventId : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.failEvent(eventId, message).catch(() => {});
    deps.log?.(`billing: event ${eventId} failed: ${message}`);
    return Response.json({ error: "sync_failed" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// `userId` is the signed-in caller from the session or bearer token, never from the request body.
export async function handleRefresh(userId: string | null, deps: BillingDeps): Promise<Response> {
  if (!deps.store || !deps.secrets.revenuecatKey) return notConfigured();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ membership: await syncUser(userId, deps) });
  } catch (error) {
    deps.log?.(`billing: refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    return Response.json({ error: "sync_failed" }, { status: 502 });
  }
}

const RECONCILE_BATCH = 200;
const RECONCILE_BUDGET_MS = 45_000;
const RECONCILE_WINDOW_MS = 30 * 24 * 3600 * 1000;

export async function handleReconcile(request: Request, deps: BillingDeps): Promise<Response> {
  const { secrets, store } = deps;
  if (!store || !secrets.revenuecatKey || !secrets.cronSecret) return notConfigured();
  if (!safeEqual(bearerToken(request.headers.get("authorization")), secrets.cronSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = deps.now ?? (() => new Date());
  const started = Date.now();
  const counts = { reconciled: 0, failed: 0, deleted: 0, remaining_deletions: 0 };

  // Least recently synced first, so what a run can't finish comes first tomorrow.
  const users = await store.usersToReconcile(new Date(now().getTime() - RECONCILE_WINDOW_MS), RECONCILE_BATCH);
  for (const id of users) {
    if (Date.now() - started > RECONCILE_BUDGET_MS) break;
    try { await syncUser(id, deps); counts.reconciled++; }
    catch (error) { counts.failed++; deps.log?.(`billing: reconcile ${id} failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  for (const id of await store.queuedDeletions(50)) {
    if (Date.now() - started > RECONCILE_BUDGET_MS) { counts.remaining_deletions++; continue; }
    try { await rcDelete(id, secrets.revenuecatKey, deps.fetcher); await store.clearDeletion(id); counts.deleted++; }
    catch (error) { counts.failed++; counts.remaining_deletions++; deps.log?.(`billing: deleting ${id} failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  await store.recordReconcile().catch((error) => deps.log?.(`billing: could not record reconcile: ${error instanceof Error ? error.message : String(error)}`));
  return Response.json(counts);
}
