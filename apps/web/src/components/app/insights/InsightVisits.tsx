"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { upgradeRequired, type InsightFilter, type InsightVisit } from "@/lib/insights";
import { createClient } from "@/lib/supabase/client";
import { LockedInsight } from "./LockedInsight";

// The visits behind a number: a day, country, show type or repeated show for the period.
// Read through own_insight_entries; a locked filter shows the locked slot, not an error.
export function InsightVisits({ year, filter, proName, onClose }: { year: number | null; filter: InsightFilter; proName: string; onClose: () => void }) {
  const [rows, setRows] = useState<InsightVisit[] | null>(null);
  const [state, setState] = useState<"ok" | "error" | { locked: string }>("ok");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await createClient().rpc("own_insight_entries", {
        selected_year: year as number,
        selected_day: filter.day as string,
        selected_country: filter.country as string,
        selected_type: filter.type as string,
        selected_show: filter.show as string,
      });
      if (cancelled) return;
      const locked = upgradeRequired(error);
      if (locked) setState({ locked });
      else if (error) setState("error");
      else { setRows((data ?? []) as InsightVisit[]); setState("ok"); }
    })().catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [year, filter, attempt]);

  return (
    <section aria-label={`Visits: ${filter.title}`} className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-headline text-label">{filter.title}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {typeof state === "object" ? <LockedInsight feature={state.locked} name={proName} title="These visits" />
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
