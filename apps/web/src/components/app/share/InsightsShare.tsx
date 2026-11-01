"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ShareSheet, type ShareSubject } from "@/components/app/share/ShareSheet";
import { Button } from "@/components/ui/Button";
import { availableInsightDesigns, type InsightStats } from "@/lib/share-card-insights";
import { createClient } from "@/lib/supabase/client";

export function InsightsShare({ handle }: { handle: string }) {
  const periodId = useId();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(currentYear);
  const [loaded, setLoaded] = useState<{ year: number | null; stats: InsightStats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    (async () => {
      const { data, error } = await createClient().rpc("own_insights", { selected_year: year, today });
      if (error || !data) throw new Error("Stats unavailable");
      if (!cancelled) { setLoaded({ year, stats: data as InsightStats }); setError(null); }
    })().catch(() => { if (!cancelled) setError("Couldn’t load your stats. Try again."); });
    return () => { cancelled = true; };
  }, [year, attempt]);
  const stats = loaded?.year === year ? loaded.stats : null;
  const subject = useMemo<ShareSubject | null>(() => stats ? ({ kind: "insights", data: { stats, year, handle } }) : null, [stats, year, handle]);
  const years = [...new Set([currentYear, ...(loaded?.stats.years.map(y => y.year) ?? [])])].sort((a, b) => b - a);
  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-2 text-subheadline font-medium"><label htmlFor={periodId}>Period</label>
      <select id={periodId} value={year ?? "all"} onChange={event => { setYear(event.target.value === "all" ? null : Number(event.target.value)); setError(null); }}
        className="min-h-11 rounded-md border border-separator bg-surface px-3 py-2 text-body text-label">
        {years.map(value => <option key={value} value={value}>{value}</option>)}
        <option value="all">All time</option>
      </select>
    </div>
    {error ? <div role="alert" className="flex flex-col gap-3"><p>{error}</p><Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>Try again</Button></div>
      : subject && subject.kind === "insights" ? availableInsightDesigns(subject.data).length
        ? <ShareSheet subject={subject} slug={`theatre-${year ?? "all-time"}`} />
        : <p className="rounded-md bg-fill p-5 text-label-secondary">No shows to share for this period. Choose another year or log a show.</p>
      : <div className="aspect-square animate-pulse rounded-md bg-fill motion-reduce:animate-none" role="status" aria-label="Loading your stats" />}
  </div>;
}
