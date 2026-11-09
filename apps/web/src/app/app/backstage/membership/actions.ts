"use server";

import { revalidatePath } from "next/cache";

import { resyncAsAdmin, testRevenueCatKey } from "@/lib/billing/admin";
import { billingDeps } from "@/lib/billing/store";
import { currentUser } from "@/lib/supabase/require-user";

export type SupportState = { ok?: boolean; message?: string };

// "Re-sync from RevenueCat" for the member on screen. The admin check happens here, not in the page.
export async function resyncMember(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const user = await currentUser();
  const result = await resyncAsAdmin(Boolean(user?.admin), String(formData.get("user_id") ?? ""), billingDeps());
  if (result.ok) revalidatePath("/app/backstage/membership");
  return result;
}

export async function testKey(): Promise<SupportState> {
  const user = await currentUser();
  return testRevenueCatKey(Boolean(user?.admin), process.env.REVENUECAT_SECRET_API_KEY || undefined);
}
