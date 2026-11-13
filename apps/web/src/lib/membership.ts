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
  // An admin testing the paywall before launch (`paywall_preview_admins`): show it as if both
  // switches were on. The database already locks their paid stats.
  paywall_preview?: boolean;
};

export type ProConfig = { name: string; salesEnabled: boolean; gatesEnabled: boolean; mediaGalleries?: boolean; mediaVideo?: boolean };

export const FREE: MembershipInfo = { tier: "free", source: null, expires_at: null, will_renew: false, is_trial: false, manage: [] };
// A missing key means off, never a crash.
export const DEFAULT_CONFIG: ProConfig = { name: DEFAULT_PRO_NAME, salesEnabled: false, gatesEnabled: false };

// `adminPreview`: the caller is an admin testing the paywall, so both switches count as on.
export function parseConfig(rows: { key: string; value: string }[] | null | undefined, adminPreview = false): ProConfig {
  const map = new Map((rows ?? []).map((r) => [r.key, r.value]));
  return {
    name: map.get("pro_display_name")?.trim() || DEFAULT_PRO_NAME,
    ...(map.get("media_gallery_uploads_enabled") === "true" && { mediaGalleries: true }),
    ...(map.get("media_video_uploads_enabled") === "true" && { mediaVideo: true }),
    salesEnabled: adminPreview || map.get("paywall_sales_enabled") === "true",
    gatesEnabled: adminPreview || map.get("paywall_gates_enabled") === "true",
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
  const info = membership.data as MembershipInfo;
  return { info, config: parseConfig(config.data, info.paywall_preview === true) };
}

// Whether to show the upgrade banner (sales on) rather than the plain "Part of {Pro}" note.
export const showsUpgrade = (config: ProConfig) => config.salesEnabled;
export const isPro = (info: MembershipInfo) => info.tier === "pro";
