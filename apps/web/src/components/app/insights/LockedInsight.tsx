// A neutral slot where a paid section would be: it keeps the section's place and says it is part
// of the paid tier (#226). No button yet: #261 turns it into the upgrade banner. `feature` is the
// feature_access key that locked it. Never draws the real chart or numbers.
export function LockedInsight({ feature, name, title }: { feature: string; name: string; title: string }) {
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
