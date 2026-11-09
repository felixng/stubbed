import { billingDeps } from "@/lib/billing/store";
import { handleRefresh } from "@/lib/billing/sync";
import { requireUserId } from "@/lib/supabase/require-user";

// POST: re-fetch the signed-in caller's subscriptions from RevenueCat and return their
// membership. The caller is the session or bearer token, never the request body.
export async function POST() {
  return handleRefresh(await requireUserId(), billingDeps());
}
