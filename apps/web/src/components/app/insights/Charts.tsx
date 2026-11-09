import { MONTHS, SHOW_TYPE_NAMES, monthlyCounts, typeShares } from "@/lib/insights";

// Bars for a year's months. The bars are decorative; the list below is the accessible version.
export function MonthBars({ months, year }: { months: { month: string; count: number }[]; year: number }) {
  const counts = monthlyCounts(months, year);
  const max = Math.max(1, ...counts);
  return (
    <div className="flex flex-col gap-3">
      <svg viewBox="0 0 240 90" role="img" aria-label={`Visits by month in ${year}`} className="h-28 w-full text-tint">
        {counts.map((n, i) => {
          const h = (n / max) * 60;
          return (
            <g key={MONTHS[i]}>
              <rect x={i * 20 + 3} y={70 - h} width={14} height={Math.max(h, n > 0 ? 2 : 0)} rx={3} fill="currentColor" opacity={n > 0 ? 1 : 0.15} />
              <text x={i * 20 + 10} y={84} textAnchor="middle" fontSize={7} fill="currentColor" className="text-label-secondary">{MONTHS[i][0]}</text>
            </g>
          );
        })}
      </svg>
      <ul className="grid grid-cols-3 gap-x-4 text-footnote text-label-secondary sm:grid-cols-4">
        {counts.map((n, i) => <li key={MONTHS[i]}>{MONTHS[i]}: <span className="text-label">{n}</span></li>)}
      </ul>
    </div>
  );
}

// Show mix: a radar of the nine show types, with the counts and shares as a list beside it.
export function ShowMix({ types, total, onPick }: { types: { type: string; count: number }[]; total: number; onPick?: (type: string, name: string) => void }) {
  const ids = Object.keys(SHOW_TYPE_NAMES);
  const max = Math.max(1, ...ids.map((id) => types.find((t) => t.type === id)?.count ?? 0));
  const point = (i: number, f: number): [number, number] => {
    const a = (i * 2 * Math.PI) / ids.length - Math.PI / 2;
    return [100 + Math.cos(a) * 70 * f, 100 + Math.sin(a) * 70 * f];
  };
  const poly = (fs: number[]) => fs.map((f, i) => point(i, f).join(",")).join(" ");
  const values = ids.map((id) => (types.find((t) => t.type === id)?.count ?? 0) / max);
  const shares = typeShares(types, total);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="-30 0 260 200" role="img" aria-label="Show mix radar" className="h-52 w-64 flex-none text-tint">
        {[0.25, 0.5, 0.75, 1].map((l) => <polygon key={l} points={poly(ids.map(() => l))} fill="none" stroke="currentColor" opacity={0.15} />)}
        {ids.map((id, i) => <line key={id} x1={100} y1={100} x2={point(i, 1)[0]} y2={point(i, 1)[1]} stroke="currentColor" opacity={0.15} />)}
        <polygon points={poly(values)} fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth={2} />
        {ids.map((id, i) => <text key={id} x={point(i, 1.3)[0]} y={point(i, 1.3)[1]} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="currentColor" className="text-label-secondary">{SHOW_TYPE_NAMES[id]}</text>)}
      </svg>
      <ul className="flex w-full flex-col divide-y divide-separator">
        {shares.map((s) => (
          <li key={s.type}>
            {onPick ? (
              <button type="button" onClick={() => onPick(s.type, s.name)} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 text-left text-subheadline focus-visible:outline-2 focus-visible:outline-focus">
                <span>{s.name}</span><span className="text-label-secondary">{s.count} · {s.percent}%</span>
              </button>
            ) : (
              <p className="flex min-h-11 items-center justify-between gap-3 text-subheadline"><span>{s.name}</span><span className="text-label-secondary">{s.count} · {s.percent}%</span></p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
