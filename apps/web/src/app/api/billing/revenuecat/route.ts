import { billingDeps } from "@/lib/billing/store";
import { handleWebhook } from "@/lib/billing/sync";

// RevenueCat webhook (#259). Authenticated by the shared Authorization header; the event only
// says whose state changed, and the server then fetches that state from RevenueCat.
export async function POST(request: Request) {
  return handleWebhook(request, billingDeps());
}
