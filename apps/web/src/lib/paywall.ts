import type { ProConfig } from "./membership";
// The one paywall (#261, docs/PAYWALL.md section 7). Pure helpers: where it was opened from, where
// to return to, what it offers, and the development-only preview. No React, no network.

export type PaywallSource = "profile" | "show_mix" | "past_year" | "all_time" | "additional_media" | "video";

const SOURCES: readonly PaywallSource[] = ["profile", "show_mix", "past_year", "all_time", "additional_media", "video"];

export function parseSource(value: string | null | undefined): PaywallSource {
  return (SOURCES as readonly string[]).includes(value ?? "") ? (value as PaywallSource) : "profile";
}

export const PAYWALL_PATH = "/app/pro";
export const DEFAULT_NEXT = "/app/stats";

// Where to go once Pro is confirmed. Only a path inside the owner app, so a crafted link can't
// send anyone off-site: "/app/..." with a plain character after the slash, never "//host",
// "/\host", "https://..." or a path outside /app/.
export function safePaywallNext(value: string | null | undefined): string {
  const next = typeof value === "string" ? value : "";
  return /^\/app\/[^/\\]/.test(next) && !/[\u0000-\u001f]/.test(next) ? next : DEFAULT_NEXT;
}

// The development-only override (?paywallPreview=free): pretend gates are on and the caller is
// Free, so every locked state can be seen. Ignored in production builds.
export function previewFree(value: string | string[] | null | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return nodeEnv !== "production" && v === "free";
}

// Keeps the preview flag on a link, so it survives the trip to the paywall and back.
export function withPreview(path: string, preview: boolean): string {
  if (!preview || path.includes("paywallPreview=")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}paywallPreview=free`;
}

export function paywallHref(source: PaywallSource, next: string, preview = false): string {
  const params = new URLSearchParams({ from: source, next: withPreview(safePaywallNext(next), preview) });
  return withPreview(`${PAYWALL_PATH}?${params}`, preview);
}

// The source for a locked feature_access key, as the server names it in `upgrade_required:<feature>`.
export function sourceForFeature(feature: string): PaywallSource {
  return feature === "insights.show_mix" ? "show_mix" : feature === "insights.all_time" ? "all_time" : "past_year";
}

// What the plan costs and whether a trial applies. Comes from the provider at runtime (RevenueCat,
// #468); nothing about prices lives in code.
export type Offer = {
  available: boolean;
  trialEligible: boolean;
  /** Localised price, billing period and trial terms, shown under the button. */
  terms: string | null;
};

export interface OfferProvider {
  load(): Promise<Offer>;
}

export const UNAVAILABLE_OFFER: Offer = { available: false, trialEligible: false, terms: null };

// Until checkout exists (#468) there is nothing to buy: "Upgrades aren't available yet".
export const unavailableOfferProvider: OfferProvider = { load: async () => UNAVAILABLE_OFFER };

export const buttonLabel = (offer: Offer) => (offer.trialEligible ? "Start free trial" : "Upgrade");

export const PAYWALL_BENEFITS = [
  { title: "Show mix", text: "How your shows split across musicals, plays, opera and more." },
  { title: "Earlier years", text: "Insights for any year you’ve logged, not just this one." },
  { title: "All time", text: "Every show you’ve logged, together." },
] as const;

export const benefitsLine = (name: string) => `${name} adds Show mix, earlier years and All time stats.`;


export function availablePaywallBenefits(config: ProConfig) {
  return [
    ...PAYWALL_BENEFITS,
    ...(config.mediaGalleries ? [{ title: config.mediaVideo ? "Up to 10 photos and videos per entry" : "Up to 10 photos per entry", text: "Keep more of the night in one memory." }] : []),
    ...(config.mediaVideo ? [{ title: "Videos up to 30 seconds", text: "Save a short clip alongside your photos." }] : []),
  ];
}
