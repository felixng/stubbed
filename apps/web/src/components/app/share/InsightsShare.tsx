"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ShareSheet, type ShareSubject } from "@/components/app/share/ShareSheet";
import { Button } from "@/components/ui/Button";
import { availableInsightDesigns, type InsightStats } from "@/lib/share-card-insights";
import { periodChoices, periodNext, previewStats, type OwnInsights } from "@/lib/insights";
import { paywallHref } from "@/lib/paywall";
import { createClient } from "@/lib/supabase/client";
import { useMembership } from "@/lib/use-membership";

export function InsightsShare({ handle, preview = false }: { handle: string; preview?: boolean }) {
  const router = useRouter();
  const { config, leave } = useMembership(preview);
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
      // Development preview: the response a Free caller gets with gates on.
      const stats = preview ? previewStats(data as unknown as OwnInsights, year, currentYear) as unknown as InsightStats : data as InsightStats;
      if (!cancelled) { setLoaded({ year, stats }); setError(null); }
    })().catch(() => { if (!cancelled) setError("Couldn’t load your stats. Try again."); });
    return () => { cancelled = true; };
  }, [year, attempt, preview, currentYear]);
  const stats = loaded?.year === year ? loaded.stats : null;
  const subject = useMemo<ShareSubject | null>(() => stats ? ({ kind: "insights", data: { stats, year, handle } }) : null, [stats, year, handle]);
  // Locked periods are offered as a lock that opens the paywall, never as a shareable year.
  const choices = periodChoices(currentYear, loaded?.stats ? { years: loaded.stats.years, access: loaded.stats.access } : null);
  function choose(value: string) {
    const choice = choices.find(c => c.value === value);
    if (!choice) return;
    if (choice.locked) { leave(); router.push(paywallHref(choice.year === null ? "all_time" : "past_year", periodNext(choice, currentYear), preview)); return; }
    setYear(choice.year as number | null); setError(null);
  }
  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-2 text-subheadline font-medium"><label htmlFor={periodId}>Period</label>
      <select id={periodId} value={year ?? "all"} onChange={event => choose(event.target.value)}
        className="min-h-11 rounded-md border border-separator bg-surface px-3 py-2 text-body text-label">
        {choices.map(c => <option key={c.value} value={c.value}>{c.locked ? `${c.label} (Part of ${config.name})` : c.label}</option>)}
      </select>
    </div>
    {error ? <div role="alert" className="flex flex-col gap-3"><p>{error}</p><Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>Try again</Button></div>
      : subject && subject.kind === "insights" ? availableInsightDesigns(subject.data).length
        ? <ShareSheet subject={subject} slug={`theatre-${year ?? "all-time"}`} preview={preview} />
        : <p className="rounded-md bg-fill p-5 text-label-secondary">No shows to share for this period. Choose another year or log a show.</p>
      : <div className="aspect-square animate-pulse rounded-md bg-fill motion-reduce:animate-none" role="status" aria-label="Loading your stats" />}
  </div>;
}
