import { Button } from "@/components/ui/Button";

// Close existing matches for a show or venue about to be added (#146). Picking
// one uses it; doing nothing keeps the new one.
export function DidYouMean({
  options,
  keep,
}: {
  options: { key: string; label: string; onPick: () => void }[];
  keep: string;
}) {
  if (!options.length) return null;
  return (
    <div role="group" aria-label="Did you mean" className="flex flex-col gap-2 rounded-md bg-fill px-4 py-3">
      <p className="text-subheadline font-semibold text-label">Did you mean…?</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.key} size="sm" variant="secondary" onClick={o.onPick}>
            {o.label}
          </Button>
        ))}
      </div>
      <p className="text-footnote text-label-secondary">Or keep {keep}.</p>
    </div>
  );
}
