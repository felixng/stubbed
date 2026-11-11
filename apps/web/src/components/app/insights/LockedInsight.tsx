import { UpgradeBanner } from "./UpgradeBanner";
import type { PaywallSource } from "@/lib/paywall";

// Where a paid section would be (#226, #261). It keeps the section's place and never draws the real
// chart or numbers. With sales on and an `upgrade` given it is the upgrade banner; otherwise a plain
// "Part of {Pro}" note with nothing to tap. `feature` is the feature_access key that locked it.
export function LockedInsight({ feature, name, title, sales = false, upgrade, preview = false, onLeave }: {
  feature: string; name: string; title: string; sales?: boolean;
  upgrade?: { source: PaywallSource; next: string };
  preview?: boolean; onLeave?: () => void;
}) {
  if (sales && upgrade) {
    return <div data-feature={feature}><UpgradeBanner {...upgrade} name={name} preview={preview} onLeave={onLeave} /></div>;
  }
  return (
    <div data-feature={feature} className="flex items-center gap-3 rounded-md border border-dashed border-separator bg-fill p-4">
      <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="flex-none text-label-secondary">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <p className="text-subheadline text-label-secondary">
        <span className="font-semibold text-label">{title}</span>
        {" · "}Part of {name}
      </p>
    </div>
  );
}
