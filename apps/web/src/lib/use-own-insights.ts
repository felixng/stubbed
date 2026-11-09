"use client";

import { useEffect, useState } from "react";

import { localDate, previewStats, type OwnInsights } from "@/lib/insights";
import { fetchProName } from "@/lib/pro-config";
import { createClient } from "@/lib/supabase/client";

type State = { year: number | null; stats: OwnInsights } | null;

// Loads own_insights for a period (null = All time) with the device's local date for streaks.
// With cacheComponents a hidden page keeps its state and only effects re-run when it is shown
// again, so the numbers refresh on return by themselves; `retry` re-asks after an error.
export function useOwnInsights(year: number | null, preview = false) {
  const [loaded, setLoaded] = useState<State>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [proName, setProName] = useState("Pro");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data, error }, name] = await Promise.all([
        supabase.rpc("own_insights", { selected_year: year as number, today: localDate() }),
        fetchProName(supabase as never),
      ]);
      if (cancelled) return;
      if (error || !data) { setFailed(true); return; }
      const stats = data as unknown as OwnInsights;
      setLoaded({ year, stats: preview ? previewStats(stats, year, new Date().getFullYear()) : stats });
      setProName(name);
      setFailed(false);
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [year, attempt, preview]);

  return {
    stats: loaded && loaded.year === year ? loaded.stats : null,
    failed,
    proName,
    retry: () => { setFailed(false); setAttempt((n) => n + 1); },
  };
}
