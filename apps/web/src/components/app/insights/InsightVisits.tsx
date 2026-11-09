"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { upgradeRequired, type InsightFilter, type InsightVisit } from "@/lib/insights";
import { paywallHref, sourceForFeature } from "@/lib/paywall";
import { createClient } from "@/lib/supabase/client";
import { LockedInsight } from "./LockedInsight";

// The visits behind a number: a day, country, show type or repeated show for the period.
// Read through own_insight_entries; a locked filter shows the locked slot, not an error.
export function InsightVisits({ year, filter, proName, sales = false, preview = false, next, onLeave, onClose }: {
  year: number | null; filter: InsightFilter; proName: string; sales?: boolean; preview?: boolean; next: string; onLeave?: () => void; onClose: () => void;
}) {
  const router = useRouter();
  // Sends the person to the paywall for a locked drill-down; it reads the latest props without re-running the load.
  const openPaywall = useEffectEvent((feature: string) => {
    if (!sales) return;
    onLeave?.();
    router.push(paywallHref(sourceForFeature(feature), next, preview));
  });
  const [rows, setRows] = useState<InsightVisit[] | null>(null);
  const [state, setState] = useState<"ok" | "error" | { locked: string }>("ok");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Development preview: Free with gates on locks a type filter and any period but this year.
      if (preview && (filter.type || year !== new Date().getFullYear())) {
        const feature = filter.type ? "insights.show_mix" : year == null ? "insights.all_time" : "insights.past_years";
        if (!cancelled) setState({ locked: feature });
        return;
      }
      const { data, error } = await createClient().rpc("own_insight_entries", {
        selected_year: year as number,
        selected_day: filter.day as string,
        selected_country: filter.country as string,
        selected_type: filter.type as string,
        selected_show: filter.show as string,
      });
      if (cancelled) return;
      const locked = upgradeRequired(error);
      if (locked) {
        setState({ locked });
        // A locked drill-down opens the paywall rather than showing an error.
        openPaywall(locked);
      }
      else if (error) setState("error");
      else { setRows((data ?? []) as InsightVisit[]); setState("ok"); }
    })().catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [year, filter, attempt, preview]);

  return (
    <section aria-label={`Visits: ${filter.title}`} className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-headline text-label">{filter.title}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {typeof state === "object" ? <LockedInsight feature={state.locked} name={proName} title="These visits" sales={sales} preview={preview} onLeave={onLeave}
        upgrade={{ headline: state.locked === "insights.show_mix" ? "See your Show mix" : "See every visit", source: sourceForFeature(state.locked), next }} />
        : state === "error" ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-subheadline text-label-secondary">Couldn’t load these visits.</p>
            <Button size="sm" variant="secondary" onClick={() => { setState("ok"); setRows(null); setAttempt((n) => n + 1); }}>Try again</Button>
          </div>
        ) : rows === null ? <p role="status" className="text-subheadline text-label-secondary">Loading…</p>
        : rows.length === 0 ? <p className="text-subheadline text-label-secondary">Only logged visits appear in Insights.</p>
        : (
          <ul className="flex flex-col divide-y divide-separator">
            {rows.map((v) => (
              <li key={v.id}>
                <Link href={`/app/entries/${v.id}`} className="flex min-h-11 flex-col justify-center py-2 focus-visible:outline-2 focus-visible:outline-focus">
                  <span className="text-body text-label">{v.title}</span>
                  <span className="text-footnote text-label-secondary">{v.date}{v.venue ? ` · ${v.venue}` : ""}{v.rating ? ` · ${v.rating}★` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
