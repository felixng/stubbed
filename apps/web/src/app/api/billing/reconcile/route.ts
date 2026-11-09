import { billingDeps } from "@/lib/billing/store";
import { handleReconcile } from "@/lib/billing/sync";

export const maxDuration = 60;

// Daily cron (vercel.json), authorised with `Authorization: Bearer ${CRON_SECRET}`. Also runnable
// by hand for support.
export async function GET(request: Request) {
  return handleReconcile(request, billingDeps());
}
