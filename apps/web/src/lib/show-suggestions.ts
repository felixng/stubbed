// Optional show suggestions for the log form (#360, epic #419; #278 extends
// this with crawled runs). Chips only: nothing fills on its own, nothing waits
// on this, and any failure just means no chips (today's route).
import type { SupabaseClient } from "@supabase/supabase-js";

/** Where a logged show's choice came from, for `entry_logged.show_source`.
 *  Older clients send nothing, which stays "unknown" in the data. */
export type ShowSource = "manual" | "community" | "yours" | "photo_text" | "run";

/** `show_id` is null only for crawled runs with no show yet (#278). */
export type ShowSuggestion = {
  show_id: string | null;
  title: string;
  venue_id: string;
  source: string;
  score: number;
  /** Run chips only (#278): the evidence reference and why it matched. */
  run_id?: string | null;
  eligibility_reason?: string | null;
  /** Server decision, behind its own flag. No client autofills yet. */
  autofill_eligible?: boolean;
};

export const SUGGESTION_DEBOUNCE_MS = 250;
export const SUGGESTION_TIMEOUT_MS = 1500;
export const MAX_PER_SOURCE = 3;

export type SuggestionFetcher = (venueIds: string[], date: string) => Promise<unknown>;

/** The RPC, as a fetcher. Errors reject; callers treat that as "no chips". */
export function rpcFetcher(supabase: SupabaseClient): SuggestionFetcher {
  return async (venueIds, date) => {
    const { data, error } = await supabase.rpc("suggest_shows_v2", { venue_ids: venueIds, on_date: date });
    if (error) throw error;
    return data;
  };
}

/** Validate untrusted rows: known shape, at most 3 per source, one chip per show+venue. */
export function normaliseSuggestions(rows: unknown): ShowSuggestion[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const perSource = new Map<string, number>();
  const out: ShowSuggestion[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const { show_id, title, venue_id, source, score } = r as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim() || typeof venue_id !== "string" || typeof source !== "string") continue;
    if (show_id !== null && typeof show_id !== "string") continue;
    const key = `${show_id ?? `t:${title.trim().toLowerCase()}`}|${venue_id}`;
    if (seen.has(key)) continue;
    if ((perSource.get(source) ?? 0) >= MAX_PER_SOURCE) continue;
    seen.add(key);
    perSource.set(source, (perSource.get(source) ?? 0) + 1);
    const extra = r as Record<string, unknown>;
    out.push({
      show_id,
      title: title.trim(),
      venue_id,
      source,
      score: Number(score) || 0,
      run_id: typeof extra.run_id === "string" ? extra.run_id : null,
      eligibility_reason: typeof extra.eligibility_reason === "string" ? extra.eligibility_reason : null,
      autofill_eligible: extra.autofill_eligible === true,
    });
  }
  return out;
}

/** Runs the fetch with a timeout. Never rejects: failure and timeout give []. */
export async function loadSuggestions(
  fetcher: SuggestionFetcher,
  venueId: string,
  date: string,
  timeoutMs = SUGGESTION_TIMEOUT_MS,
): Promise<ShowSuggestion[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const rows = await Promise.race([fetcher([venueId], date), timeout]);
    return rows === null ? [] : normaliseSuggestions(rows);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** One draft's suggestion requests. A newer request, `cancel()` (save, unmount,
 *  navigation, import deselection) or a changed venue/date makes older
 *  responses invisible: they are dropped here, not applied. */
export class SuggestionSession {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly fetcher: SuggestionFetcher;
  private readonly options: { debounceMs?: number; timeoutMs?: number };

  constructor(fetcher: SuggestionFetcher, options: { debounceMs?: number; timeoutMs?: number } = {}) {
    this.fetcher = fetcher;
    this.options = options;
  }

  request(venueId: string, date: string, onResult: (items: ShowSuggestion[]) => void) {
    this.cancel();
    const mine = this.generation;
    this.timer = setTimeout(async () => {
      const items = await loadSuggestions(this.fetcher, venueId, date, this.options.timeoutMs);
      if (mine === this.generation) onResult(items);
    }, this.options.debounceMs ?? SUGGESTION_DEBOUNCE_MS);
  }

  cancel() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
