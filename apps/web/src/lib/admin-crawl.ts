// Helpers for the crawl pages under /app/backstage/crawl.

export type Score = { right: number; wrong: number; unsure: number; unreviewed: number; findings: number; missed: number };

// Share right among findings that were marked right or wrong; null before any
// is. "Unsure" and unmarked findings are left out of both sides.
export function shareRight(s: Pick<Score, "right" | "wrong">): number | null {
  const marked = s.right + s.wrong;
  return marked === 0 ? null : s.right / marked;
}

export function scoreLine(s: Score): string {
  const share = shareRight(s);
  const parts = [`${s.findings} ${s.findings === 1 ? "finding" : "findings"}`];
  if (share !== null) parts.push(`${Math.round(share * 100)}% right`);
  parts.push(`${s.wrong} wrong`, `${s.missed} missed`);
  if (s.unsure) parts.push(`${s.unsure} unsure`);
  if (s.unreviewed) parts.push(`${s.unreviewed} not reviewed`);
  return parts.join(" · ");
}

export function sumScores(rows: Score[]): Score {
  return rows.reduce(
    (t, r) => ({
      right: t.right + r.right,
      wrong: t.wrong + r.wrong,
      unsure: t.unsure + r.unsure,
      unreviewed: t.unreviewed + r.unreviewed,
      findings: t.findings + r.findings,
      missed: t.missed + r.missed,
    }),
    { right: 0, wrong: 0, unsure: 0, unreviewed: 0, findings: 0, missed: 0 },
  );
}

export type RunSettings = {
  pipeline?: string;
  id: string;
  method: string;
  model: string | null;
  prompt: string | null;
  branch: string | null;
  commit_sha: string | null;
  budget_usd: number | string;
  cost_usd: number | string;
  venue_ids: string[];
};

// The settings of a run on one line, for the header and for comparing.
export function settingsLine(r: RunSettings): string {
  const parts = [r.pipeline === "discover" ? "discover links, prepare rules, then crawl" : r.method === "rules_model" ? "rules, then model" : "rules only"];
  if (r.method === "rules_model") parts.push(r.model || "default model");
  parts.push(r.prompt ? "custom prompt" : "default prompt");
  if (r.branch) parts.push(`branch ${r.branch}${r.commit_sha ? ` @ ${r.commit_sha.slice(0, 7)}` : ""}`);
  parts.push(`cost $${Number(r.cost_usd).toFixed(4)}`);
  return parts.join(" · ");
}

// The command that repeats a run with the same settings, until the admin form
// (#358) can. The prompt is not in the command: save it to a file first.
export function rerunCommand(r: RunSettings): string {
  const args = ["node supabase/scripts/crawl/index.mjs", `--venues ${r.venue_ids.join(",")}`, `--method ${r.method}`];
  if (r.method === "rules_model") {
    if (r.model) args.push(`--model ${r.model}`);
    args.push(`--budget ${Number(r.budget_usd)}`);
    if (r.prompt) args.push("--prompt-file prompt.md");
  }
  return args.join(" ");
}

export const COMPARE_LABEL: Record<string, string> = {
  added: "Added in this run",
  lost: "Lost since the other run",
  changed: "Changed",
  same: "Same",
};
export const COMPARE_ORDER = ["added", "lost", "changed", "same"] as const;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CRAWL_SOURCES_PATH = "/app/backstage/crawl/sources";
export const CRAWL_PAGE_SIZE = 25;
export const CRAWL_STAGES = ["directory", "venue", "event"] as const;
export const CRAWL_STATUS_LABELS = {
  pending: "Queued",
  leased: "In flight",
  succeeded: "Succeeded",
  retry_wait: "Retrying",
  blocked: "Blocked",
  failed: "Failed",
} as const;

export type CrawlStage = (typeof CRAWL_STAGES)[number];
export type CrawlStatus = keyof typeof CRAWL_STATUS_LABELS;
export type CrawlSource = {
  source_key: string;
  collection_enabled: boolean;
  publication_enabled: boolean;
  operator_paused_at: string | null;
  paused_reason: string | null;
  withdrawn_at: string | null;
  adapter_version: string;
};
export type CrawlScan = {
  id: string;
  scope_key: string;
  enumeration_status: "enumerating" | "enumerated" | "not_applicable";
  started_at: string;
  completed_at: string | null;
  is_current: boolean;
  paused_reason?: string | null;
};
export type CrawlStageCounts = Record<CrawlStatus, number> & { discovered: number; processed: number };
export type CrawlPage = {
  id: string;
  stage: CrawlStage;
  canonical_url: string;
  status: CrawlStatus;
  attempts: number;
  http_requests: number;
  last_success_at: string | null;
  last_error: string | null;
  available_at: string;
  parser_version: string | null;
  enriched: boolean | null;
};
export type CrawlSourceProgress = {
  sources: CrawlSource[];
  source_key: string;
  scans: CrawlScan[];
  scan: CrawlScan | null;
  stages: Record<CrawlStage, CrawlStageCounts>;
  enriched_venue_pages: number;
  filtered_total: number;
  rows: CrawlPage[];
  last_activity_at: string | null;
  attempts: number;
  http_requests: number;
  model_calls: number | null;
  model_spend_usd: number;
  identities: {
    matched_venues: number; crawler_venues: number; unresolved_venues: number;
    matched_shows: number; crawler_shows: number; unresolved_events: number;
  };
  evidence: { published_runs: number; conflicting_runs: number; stale_runs: number; unsupported_closing: number };
};

const sourceNames: Record<string, string> = {
  london_theatre: "London Theatre",
  playbill: "Playbill",
  official: "Official theatre sites",
};

export function crawlSourceName(key: string) {
  return sourceNames[key] ?? key;
}

export function crawlSourceFilters(input: Record<string, string | string[] | undefined>) {
  const source = typeof input.source === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(input.source)
    ? input.source : "london_theatre";
  const scan = typeof input.scan === "string" && UUID.test(input.scan) ? input.scan : undefined;
  const stage = CRAWL_STAGES.find(stage => stage === input.stage) ?? "venue";
  const status = Object.keys(CRAWL_STATUS_LABELS).find(status => status === input.status) as CrawlStatus | undefined;
  const page = typeof input.page === "string" && /^[1-9]\d{0,5}$/.test(input.page) ? Number(input.page) : 1;
  return { source, scan, stage, status, page };
}

export function crawlSourceHref(filters: ReturnType<typeof crawlSourceFilters>, page = filters.page) {
  const params = new URLSearchParams({ source: filters.source, stage: filters.stage });
  if (filters.scan) params.set("scan", filters.scan);
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  return `${CRAWL_SOURCES_PATH}?${params}`;
}

const countFormat = new Intl.NumberFormat("en-GB");
export function crawlStageProgress(stage: CrawlStage, counts: CrawlStageCounts) {
  const label = stage === "event" ? "event detail pages" : `${stage} pages`;
  return `${countFormat.format(counts.processed)} of ${countFormat.format(counts.discovered)} discovered ${label} processed`;
}

// What a crawled page produced (admin_crawl_task_results). Absent for pages not read yet.
export type CrawlTaskResult = {
  stage: CrawlStage;
  venues_listed?: number;
  name?: string | null; street?: string | null; city?: string | null; postcode?: string | null;
  located?: boolean; located_by?: string | null;
  shows_total?: number; shows_read?: number; shows_stuck?: number; shows?: CrawlShowResult[];
  title?: string | null; show_type?: string | null; event_kind?: string | null; venue_name?: string | null;
  dates?: { date: string; kind: string }[];
};
export type CrawlShowResult = { title: string; status: CrawlStatus; opens: string | null; closes: string | null; ends: string | null };
export type TaskTone = "good" | "waiting" | "bad" | "neutral";
export type TaskSummary = { title: string; outcome: { label: string; tone: TaskTone }; got: string[]; missing: string[] };

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const when = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

function slug(url: string) {
  try { return new URL(url).pathname.split("/").filter(Boolean).pop() ?? url; } catch { return url; }
}

// One plain answer per page: did we get what we wanted, what is it, what is missing.
// Fetch details (attempts, requests, parser) stay out of this; the page keeps them under "Details".
export function summariseCrawlTask(row: Pick<CrawlPage, "stage" | "status" | "canonical_url">, result?: CrawlTaskResult, resultsKnown = true): TaskSummary {
  const fallback = slug(row.canonical_url);
  const title = (row.stage === "directory" ? "Theatre directory" : result?.name ?? result?.title) || fallback;
  const waiting = { queued: ["Queued", "neutral"], leased: ["Reading now", "waiting"], retry_wait: ["Retrying", "waiting"], blocked: ["Blocked", "bad"], failed: ["Failed", "bad"] } as const;
  if (row.status !== "succeeded") {
    const [label, tone] = waiting[row.status === "pending" ? "queued" : row.status];
    return { title, outcome: { label, tone }, got: [], missing: [] };
  }
  if (!resultsKnown) return { title, outcome: { label: "Succeeded", tone: "neutral" }, got: [], missing: [] };
  if (!result) return { title, outcome: { label: "Read, nothing saved", tone: "bad" }, got: [], missing: ["No data was saved from this page"] };

  const got: string[] = [];
  const missing: string[] = [];
  if (row.stage === "directory") {
    const n = result.venues_listed ?? 0;
    if (n) got.push(`${plural(n, "theatre")} listed`); else missing.push("No theatres found");
    return { title, outcome: n ? { label: "Complete", tone: "good" } : { label: "Nothing found", tone: "bad" }, got, missing };
  }
  if (row.stage === "venue") {
    const address = [result.street, result.city, result.postcode].filter(Boolean).join(", ");
    if (address) got.push(address); else missing.push("No address");
    if (result.located) {
      const by = result.located_by?.includes("postcodes") ? " from its postcode" : result.located_by?.includes("nominatim") ? " from its address" : "";
      got.push(`Located${by}`);
    } else missing.push("No location found");
    const total = result.shows_total ?? 0, read = result.shows_read ?? 0, stuck = result.shows_stuck ?? 0;
    const pending = Math.max(total - read - stuck, 0);
    if (total) got.push(`${read.toLocaleString("en-GB")} of ${plural(total, "show page")} read`); else missing.push("No show pages found");
    if (stuck) return { title, outcome: { label: `${plural(stuck, "show page")} stuck`, tone: "bad" }, got, missing };
    if (pending) return { title, outcome: { label: `Waiting on ${plural(pending, "show page")}`, tone: "waiting" }, got, missing };
    if (missing.length) return { title, outcome: { label: missing[0], tone: "waiting" }, got, missing };
    return { title, outcome: { label: "Complete", tone: "good" }, got, missing };
  }
  const dates = result.dates ?? [];
  const first = (...kinds: string[]) => dates.filter(d => kinds.includes(d.kind)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const opens = first("opening", "start"), closes = first("closing"), end = first("end");
  if (opens) got.push(`Opens ${when(opens.date)}`);
  if (closes) got.push(`Closes ${when(closes.date)}`);
  else if (end) got.push(`Scheduled until ${when(end.date)} (not a confirmed close)`);
  if (result.venue_name) got.push(`At ${result.venue_name}`);
  if (result.show_type) got.push(`Type: ${result.show_type}`); else missing.push("Show type not on the page");
  if (result.event_kind && result.event_kind !== "show") got.push(`Not a show (${result.event_kind})`);
  if (!opens && !closes && !end) return { title, outcome: { label: "No dates found", tone: "bad" }, got, missing: ["No dates", ...missing] };
  return { title, outcome: { label: "Complete", tone: "good" }, got, missing };
}

// One line per show listed on a venue page: what we have, or why we have nothing yet.
export function summariseCrawlShow(show: CrawlShowResult): { title: string; mark: "✓" | "…" | "✕"; detail: string } {
  const title = show.title.startsWith("http") ? slug(show.title) : show.title;
  if (show.status === "succeeded") {
    const parts: string[] = [];
    if (show.opens) parts.push(`opens ${when(show.opens)}`);
    if (show.closes) parts.push(`closes ${when(show.closes)}`);
    else if (show.ends) parts.push(`scheduled until ${when(show.ends)}`);
    return { title, mark: "✓", detail: parts.length ? parts.join(", ") : "no dates found" };
  }
  if (show.status === "failed" || show.status === "blocked") return { title, mark: "✕", detail: show.status === "blocked" ? "blocked" : "failed" };
  if (show.status === "retry_wait") return { title, mark: "✕", detail: "retrying" };
  return { title, mark: "…", detail: "not read yet" };
}
