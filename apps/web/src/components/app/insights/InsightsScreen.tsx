"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { PlaceholderRows } from "@/components/ui/PlaceholderRows";
import { gridYear, isLocked, isPeriodLocked, periodLabel, periodOptions, type InsightFilter } from "@/lib/insights";
import { count } from "@/lib/plural";
import { useOwnInsights } from "@/lib/use-own-insights";
import { ActivityGrid } from "./ActivityGrid";
import { MonthBars, ShowMix } from "./Charts";
import { InsightVisits } from "./InsightVisits";
import { LockedInsight } from "./LockedInsight";

const CARD = "flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={CARD}>
      <h2 className="text-headline text-label">{title}</h2>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-subheadline text-label-secondary">{children}</p>;

// The owner's Insights (#226). Every number comes from own_insights; a section the server
// reports in `access.locked` becomes a LockedInsight slot, never zeros or an empty chart.
export function InsightsScreen({ initialYear, thisYear }: { initialYear: number | null; thisYear: number }) {
  const [year, setYear] = useState<number | null>(initialYear);
  const [filter, setFilter] = useState<InsightFilter | null>(null);
  const { stats, failed, proName, retry } = useOwnInsights(year);
  const periodId = useId();
  const options = periodOptions(thisYear, stats?.years ?? []);

  const choose = (next: number | null) => { setYear(next); setFilter(null); };
  const open = (f: InsightFilter) => setFilter(f);
  const label = periodLabel(year);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-subheadline font-medium">
        <label htmlFor={periodId}>Period</label>
        <select id={periodId} value={year ?? "all"} onChange={(e) => choose(e.target.value === "all" ? null : Number(e.target.value))}
          className="min-h-11 rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus">
          {options.map((o) => <option key={o ?? "all"} value={o ?? "all"}>{periodLabel(o)}</option>)}
        </select>
      </div>

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-subheadline text-label-secondary">Your stats couldn’t load.</p>
          <Button variant="secondary" onClick={retry}>Try again</Button>
        </div>
      ) : !stats ? <PlaceholderRows rows={3} />
      : isPeriodLocked(stats) ? (
        <>
          <LockedInsight feature={stats.access?.period === "all" ? "insights.all_time" : "insights.past_years"} name={proName} title={`Your ${label} stats`} />
          <Section title="Weekly streak"><p className="text-subheadline">Current streak: {count(stats.streaks.current_weekly, "week")}</p></Section>
        </>
      ) : (
        <>
          {filter && <InsightVisits year={year} filter={filter} proName={proName} onClose={() => setFilter(null)} />}

          <Section title={`${label} overview`}>
            {stats.total === 0 ? <Empty>Log a show to start your Insights. Only logged visits count.</Empty> : (
              <>
                <p className="text-title font-display text-label">{count(stats.total, "visit")}</p>
                <p className="text-subheadline text-label-secondary">{count(stats.unique_shows, "unique show")} · repeat visits included</p>
                <dl className="grid grid-cols-2 gap-3 text-subheadline">
                  <div><dt className="text-footnote text-label-secondary">Current weekly streak</dt><dd>{count(stats.streaks.current_weekly, "week")}</dd></div>
                  <div><dt className="text-footnote text-label-secondary">Longest weekly streak</dt><dd>{count(stats.streaks.longest_weekly, "week")}</dd></div>
                  <div><dt className="text-footnote text-label-secondary">Current daily streak</dt><dd>{count(stats.streaks.current_daily, "day")}</dd></div>
                  <div><dt className="text-footnote text-label-secondary">Longest daily streak</dt><dd>{count(stats.streaks.longest_daily, "day")}</dd></div>
                </dl>
              </>
            )}
          </Section>

          <Section title="Most seen">
            {stats.repeated_shows.length === 0 ? <Empty>Shows you’ve seen more than once in this period will appear here.</Empty> : (
              <ol className="flex flex-col divide-y divide-separator">
                {stats.repeated_shows.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => open({ show: s.id, title: s.title })} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 text-left text-subheadline focus-visible:outline-2 focus-visible:outline-focus">
                      <span>{s.rank}. {s.title}</span><span className="text-label-secondary">{count(s.count, "visit")}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title={year == null ? "Activity" : `${label} activity`}>
            <ActivityGrid year={gridYear(year, thisYear, stats.days)} days={stats.days} onPick={(day) => open({ day, title: day })} />
          </Section>

          {year != null && (
            <Section title="By month">
              {stats.total === 0 ? <Empty>Your months appear after your first logged show.</Empty> : <MonthBars months={stats.months} year={year} />}
            </Section>
          )}

          {isLocked(stats, "years")
            ? <LockedInsight feature="insights.past_years" name={proName} title="Year by year" />
            : (
              <Section title="Year by year">
                {stats.years.length === 0 ? <Empty>Your history appears after your first logged show.</Empty> : (
                  <ul className="flex flex-col divide-y divide-separator">
                    {stats.years.map((y) => (
                      <li key={y.year} className="flex min-h-11 items-center justify-between text-subheadline"><span>{y.year}</span><span className="text-label-secondary">{count(y.count, "visit")}</span></li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

          <Section title="Countries">
            {stats.countries.length === 0 ? <Empty>Add a theatre with a country to place your shows on the map.</Empty> : (
              <ul className="flex flex-col divide-y divide-separator">
                {stats.countries.map((c) => {
                  const name = new Intl.DisplayNames(["en"], { type: "region" }).of(c.country) ?? c.country;
                  return (
                    <li key={c.country}>
                      <button type="button" onClick={() => open({ country: c.country, title: name })} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 text-left text-subheadline focus-visible:outline-2 focus-visible:outline-focus">
                        <span>{name}</span><span className="text-label-secondary">{count(c.count, "visit")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {stats.unlocated > 0 && <p className="text-footnote text-label-secondary">{count(stats.unlocated, "visit")} without a theatre location aren’t placed.</p>}
          </Section>

          {isLocked(stats, "types")
            ? <LockedInsight feature="insights.show_mix" name={proName} title="Show mix" />
            : (
              <Section title="Show mix">
                {stats.types.length === 0 ? <Empty>Log a show to see your favourite show types.</Empty>
                  : <ShowMix types={stats.types} total={stats.total} onPick={(type, name) => open({ type, title: name })} />}
              </Section>
            )}
        </>
      )}
      <Link href="/app/insights/share" className="self-start text-subheadline font-semibold text-tint-text">Share theatre stats</Link>
    </div>
  );
}
