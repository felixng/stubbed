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
