// Deliberately neutral until the real app captures are approved (#386).
// Replace this component at each call site with a fitted image; dimensions
// belong to the surrounding layout so swapping assets cannot shift the page.
export function AssetPlaceholder({ label, status, className = "" }: {
  label: string; status: string; className?: string;
}) {
  return (
    <div role="img" aria-label={`${label} — ${status}`} className={`flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-md border border-dashed border-outline/60 bg-fill p-6 text-center ${className}`}>
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-label-secondary">
        <rect x="5" y="5" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="15" cy="15" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="m6 29 9-9 7 7 5-5 8 8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="text-headline font-semibold text-label">{label}</span>
      <span className="text-footnote text-label-secondary">{status}</span>
    </div>
  );
}
