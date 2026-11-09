import { DEFAULT_PRO_NAME } from "@/lib/pro-config";

// The caller's membership and the rollout switches (docs/PAYWALL.md sections 5 and 6), as the
// pages read them. Which fields are locked comes from `access.locked`, never from the tier here.

export type MembershipInfo = {
  tier: "free" | "pro";
  source: string | null;
  expires_at: string | null;
  will_renew: boolean;
  is_trial: boolean;
  manage: string[];
};

export type ProConfig = { name: string; salesEnabled: boolean; gatesEnabled: boolean };

export const FREE: MembershipInfo = { tier: "free", source: null, expires_at: null, will_renew: false, is_trial: false, manage: [] };
// A missing key means off, never a crash.
export const DEFAULT_CONFIG: ProConfig = { name: DEFAULT_PRO_NAME, salesEnabled: false, gatesEnabled: false };

export function parseConfig(rows: { key: string; value: string }[] | null | undefined): ProConfig {
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  return {
    name: map.get("pro_display_name")?.trim() || DEFAULT_PRO_NAME,
    salesEnabled: map.get("paywall_sales_enabled") === "true",
    gatesEnabled: map.get("paywall_gates_enabled") === "true",
  };
}

export type MembershipState = { info: MembershipInfo; config: ProConfig };

// What the development preview shows: Free, gates and sales on.
export const PREVIEW_STATE: MembershipState = { info: FREE, config: { name: DEFAULT_PRO_NAME, salesEnabled: true, gatesEnabled: true } };

type Reader = {
  rpc: (fn: "my_membership") => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: "app_config") => { select: (cols: string) => PromiseLike<{ data: { key: string; value: string }[] | null }> };
};

// `my_membership()` plus `app_config`. Unreadable config falls back to "off"; an unreadable
// membership throws, so a screen doesn't claim Free by accident.
export async function loadMembership(supabase: Reader): Promise<MembershipState> {
  const [membership, config] = await Promise.all([
    supabase.rpc("my_membership"),
    Promise.resolve(supabase.from("app_config").select("key, value")).catch(() => ({ data: null })),
  ]);
  if (membership.error || !membership.data) throw new Error("Membership unavailable");
  return { info: membership.data as MembershipInfo, config: parseConfig(config.data) };
}

// Whether to show the upgrade banner (sales on) rather than the plain "Part of {Pro}" note.
export const showsUpgrade = (config: ProConfig) => config.salesEnabled;
export const isPro = (info: MembershipInfo) => info.tier === "pro";
