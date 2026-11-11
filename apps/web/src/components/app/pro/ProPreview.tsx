// A sample of what Pro unlocks, drawn rather than described (#497). It is an illustration: the
// numbers are made up, it says so, and it is hidden from assistive tech. It sits on the Footlight
// Glow halo, the one place the glow is allowed (behind a device mockup).
const MIX = [
  { label: "Musicals", share: 58, bar: "bg-tint" },
  { label: "Plays", share: 27, bar: "bg-label" },
  { label: "Opera", share: 10, bar: "bg-outline" },
  { label: "Other", share: 5, bar: "bg-separator" },
] as const;

export function ProPreview({ thisYear }: { thisYear: number }) {
  const periods = [String(thisYear), String(thisYear - 1), String(thisYear - 2), "All time"];
  return (
    <div aria-hidden="true" className="relative isolate">
      <div className="absolute inset-x-6 -inset-y-2 -z-10 rounded-lg bg-glow opacity-80 blur-2xl" />
      <div className="flex flex-col gap-4 rounded-lg border border-separator bg-surface p-4 shadow-lg">
        <div className="flex gap-1.5 overflow-hidden">
          {periods.map((p, i) => (
            <span key={p} className={`rounded-pill px-3 py-1 text-footnote font-semibold whitespace-nowrap ${i === 1 ? "bg-label text-background" : "bg-fill text-label"}`}>{p}</span>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-headline text-label">Show mix</span>
            <span className="text-footnote text-label-secondary">Example</span>
          </div>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-pill">
            {MIX.map((m) => <span key={m.label} className={m.bar} style={{ width: `${m.share}%` }} />)}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {MIX.map((m) => (
              <li key={m.label} className="flex items-center gap-2 text-footnote text-label-secondary">
                <span className={`size-2.5 flex-none rounded-full ${m.bar}`} />
                {m.label}
                <span className="ml-auto text-label tabular-nums">{m.share}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
