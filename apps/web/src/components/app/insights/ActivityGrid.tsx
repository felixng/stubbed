"use client";

import { heatLevel, heatmapWeeks } from "@/lib/insights";

const SHADE = ["bg-fill", "bg-tint/25", "bg-tint/50", "bg-tint/75", "bg-tint"];

// Day-by-day activity for one year. Each day with visits is a button that opens that day's visits;
// the grid is a picture, so a text summary names the totals for screen readers (#226).
export function ActivityGrid({ year, days, onPick }: { year: number; days: { date: string; count: number }[]; onPick?: (date: string) => void }) {
  const weeks = heatmapWeeks(year, days);
  const max = Math.max(0, ...days.map((d) => d.count));
  const active = days.filter((d) => d.date.startsWith(String(year)) && d.count > 0).length;
  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto pb-1" role="group" aria-label={`${year} activity, ${active} days with visits`}>
        <div className="flex w-max gap-[3px]">
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {week.map((cell) => {
                const base = `size-3 rounded-[3px] ${cell.inYear ? SHADE[heatLevel(cell.count, max)] : "bg-transparent"}`;
                if (!cell.inYear) return <span key={cell.date} aria-hidden="true" className={base} />;
                if (cell.count === 0 || !onPick) return <span key={cell.date} className={base} title={`${cell.date}: no visits`} />;
                return (
                  <button key={cell.date} type="button" onClick={() => onPick(cell.date)} aria-label={`${cell.date}: ${cell.count} ${cell.count === 1 ? "visit" : "visits"}`} title={`${cell.date}: ${cell.count}`}
                    className={`${base} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus`} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-footnote text-label-secondary">
        {active === 0 ? `No visits logged in ${year}.` : `${active} ${active === 1 ? "day" : "days"} with visits in ${year}.`}
      </figcaption>
    </figure>
  );
}
