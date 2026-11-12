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
export const CRAWL_SOURCE_KEYS = ["london_theatre", "playbill", "official"] as const;
export const CRAWL_HUB_PATH = "/app/backstage/crawl";
export const CRAWL_GUIDE_PATH = `${CRAWL_HUB_PATH}/guide`;
export const OFFICIAL_SITES_PATH = `${CRAWL_HUB_PATH}/sources/official/sites`;

export function crawlSourceName(key: string) {
  return sourceNames[key] ?? key;
}
export const isCrawlSource = (key: string) => (CRAWL_SOURCE_KEYS as readonly string[]).includes(key);
// Source keys use underscores in the database and hyphens in addresses.
export const sourcePath = (key: string) => `${CRAWL_HUB_PATH}/sources/${key.replaceAll("_", "-")}`;
export const sourceKeyFromPath = (segment: string) => segment.replaceAll("-", "_");
export const runPath = (id: string) => `${CRAWL_HUB_PATH}/runs/${id}`;

// The six steps, named once. Steps 1 to 3 are crawl stages in the database.
export const CRAWL_STEPS = [
  { key: "directory", name: "Find venues", what: "Walk the source's theatre directory to list venue pages." },
  { key: "venue", name: "Read venues", what: "Read each venue page to list its shows." },
  { key: "event", name: "Read shows", what: "Read each show page for its title, dates and venue." },
  { key: "check", name: "Check", what: "Check dates and match venues and shows to the ones we already have." },
  { key: "publish", name: "Publish", what: "Put trusted shows, venues and run dates into the catalogue." },
  { key: "suggest", name: "Suggest", what: "Offer run chips to members when they log a show." },
] as const;
export const stepName = (stage: CrawlStage) => CRAWL_STEPS.find(step => step.key === stage)?.name ?? stage;
const stepNoun: Record<CrawlStage, string> = { directory: "directory page", venue: "venue page", event: "show page" };

// Six statuses grouped into four buckets for summaries. The six stay in drill-downs.
export const CRAWL_BUCKETS = ["done", "todo", "retrying", "stuck"] as const;
export type CrawlBucket = (typeof CRAWL_BUCKETS)[number];
export const CRAWL_BUCKET_LABELS: Record<CrawlBucket, string> = { done: "Done", todo: "To do", retrying: "Retrying", stuck: "Stuck" };
export function crawlBuckets(c: CrawlStageCounts): Record<CrawlBucket, number> {
  return { done: c.succeeded, todo: c.pending + c.leased, retrying: c.retry_wait, stuck: c.blocked + c.failed };
}

export type CrawlingState = { key: "on" | "paused" | "blocked" | "off"; label: string };
// Collection (database) and the Crawling switch read as one state.
export function crawlingState(source: Pick<CrawlSource, "collection_enabled" | "operator_paused_at" | "paused_reason">): CrawlingState {
  if (!source.collection_enabled) return { key: "off", label: "Not enabled" };
  if (source.paused_reason) return { key: "blocked", label: "Blocked by the site" };
  if (source.operator_paused_at) return { key: "paused", label: "Paused by you" };
  return { key: "on", label: "Crawling" };
}

export type CrawlPagesFilters = { source: string; step: CrawlStage; status?: CrawlBucket | CrawlStatus; scan?: string; page: number };
export function crawlPagesFilters(source: string, input: Record<string, string | string[] | undefined>): CrawlPagesFilters {
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const step = CRAWL_STAGES.find(stage => stage === one(input.step) || stage === one(input.stage)) ?? "venue";
  const raw = one(input.status);
  const status = (CRAWL_BUCKETS as readonly string[]).includes(raw ?? "") || Object.keys(CRAWL_STATUS_LABELS).includes(raw ?? "")
    ? (raw as CrawlBucket | CrawlStatus) : undefined;
  const scanValue = one(input.pass) ?? one(input.scan);
  const scan = scanValue && UUID.test(scanValue) ? scanValue : undefined;
  const pageValue = one(input.page);
  const page = pageValue && /^[1-9]\d{0,5}$/.test(pageValue) ? Number(pageValue) : 1;
  return { source, step, status, scan, page };
}
export function pagesHref(filters: CrawlPagesFilters, change: Partial<CrawlPagesFilters> = {}) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams({ step: next.step });
  if (next.status) params.set("status", next.status);
  if (next.scan) params.set("pass", next.scan);
  if (next.page > 1) params.set("page", String(next.page));
  return `${sourcePath(next.source)}/pages?${params}`;
}

// Where an old bookmark should land. Old pages used underscores in the source and "stage" for the step.
export function legacySourcesRedirect(input: Record<string, string | string[] | undefined>): string {
  const source = typeof input.source === "string" && isCrawlSource(input.source) ? input.source : null;
  if (!source) return CRAWL_HUB_PATH;
  const wantsPages = ["stage", "status", "page", "scan"].some(key => typeof input[key] === "string");
  if (!wantsPages) return sourcePath(source);
  return pagesHref(crawlPagesFilters(source, input));
}

const countFormat = new Intl.NumberFormat("en-GB");
const n = (value: number) => countFormat.format(value);
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
export const shortDate = (iso: string) => dayMonth.format(new Date(iso));
export const shortDateTime = (iso: string) => `${dayMonthTime.format(new Date(iso))} UTC`;
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export type CrawlOverviewAttention = { stage: CrawlStage; status: "failed" | "blocked" | "retry_wait"; n: number; reason: string | null };
export type CrawlOverview = {
  run_dates: { total: number; from_sources: number };
  sources: Record<string, { next_refresh_at: string | null; unchecked_pages: number; attention: CrawlOverviewAttention[] }>;
  official: { sites: number; sites_needing_attention: number; last_run_at: string | null; last_run_status: string | null; findings_to_review: number };
  recent_actions: { at: string; source: string; operation: string; affected: number; who: string }[];
};

// "1 show page is retrying", "26 show pages are retrying".
function attentionText(item: CrawlOverviewAttention) {
  const noun = `${n(item.n)} ${stepNoun[item.stage]}${item.n === 1 ? "" : "s"}`;
  const verb = item.status === "retry_wait" ? "retrying" : item.status === "blocked" ? "blocked" : "failed";
  return `${noun} ${verb}`;
}

export type AttentionItem = { source: string; text: string; reason?: string | null; href: string };
// One short list of what needs an admin, each with a place to go.
export function attentionItems(
  overview: CrawlOverview, sources: Pick<CrawlSource, "source_key" | "paused_reason">[],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const source of sources) {
    if (source.source_key === "official") continue;
    const name = crawlSourceName(source.source_key);
    if (source.paused_reason) items.push({ source: name, text: "Blocked by the site", reason: source.paused_reason, href: sourcePath(source.source_key) });
    for (const item of overview.sources[source.source_key]?.attention ?? []) {
      const bucket = item.status === "retry_wait" ? "retrying" : "stuck";
      items.push({
        source: name, text: attentionText(item), reason: item.reason,
        href: pagesHref({ source: source.source_key, step: item.stage, status: bucket, page: 1 }),
      });
    }
  }
  const official = overview.official;
  if (official.sites_needing_attention > 0) {
    items.push({ source: crawlSourceName("official"), text: `${n(official.sites_needing_attention)} ${official.sites_needing_attention === 1 ? "site needs" : "sites need"} attention`, href: `${OFFICIAL_SITES_PATH}?attention=1` });
  }
  if (official.findings_to_review > 0) {
    items.push({ source: crawlSourceName("official"), text: `${n(official.findings_to_review)} ${official.findings_to_review === 1 ? "finding" : "findings"} to review`, href: sourcePath("official") });
  }
  return items;
}

type HeadlineSource = { key: string; state: CrawlingState; publishing: boolean };
// The one-sentence answer to "where are we?".
export function hubHeadline(sources: HeadlineSource[], stuck: number, retrying: number, runDatesFromSources: number): string {
  const parts = sources.filter(s => s.key !== "official").map(s => {
    const name = crawlSourceName(s.key);
    if (s.state.key === "on") return `${name} is crawling${s.publishing ? " and publishing" : " but not publishing"}.`;
    return `${name} is ${lower(s.state.label)}.`;
  });
  if (stuck > 0) parts.push(`${n(stuck)} ${stuck === 1 ? "page is" : "pages are"} stuck.`);
  if (retrying > 0) parts.push(`${n(retrying)} ${retrying === 1 ? "page is" : "pages are"} retrying.`);
  parts.push(runDatesFromSources === 0 ? "No run dates published yet." : `${n(runDatesFromSources)} run ${runDatesFromSources === 1 ? "date" : "dates"} published.`);
  return parts.join(" ");
}

// "Crawling and publishing. Current pass started 8 Nov; finding venues finished 8 Nov. 27 pages need attention."
export function sourceStatusSentence(input: {
  state: CrawlingState; publishing: boolean; scan: Pick<CrawlScan, "started_at" | "completed_at" | "enumeration_status" | "is_current"> | null; needAttention: number;
}): string {
  const { state, publishing, scan, needAttention } = input;
  const parts = [state.key === "on" ? `Crawling${publishing ? " and publishing" : ", not publishing"}.` : `${state.label}${publishing ? ", publishing is on" : ""}.`];
  if (scan) {
    const started = `${scan.is_current ? "Current" : "Earlier"} pass started ${shortDate(scan.started_at)}`;
    if (scan.enumeration_status === "enumerated" && scan.completed_at) parts.push(`${started}; finding venues finished ${shortDate(scan.completed_at)}.`);
    else if (scan.enumeration_status === "enumerating") parts.push(`${started}; still finding venues.`);
    else parts.push(`${started}.`);
  } else parts.push("No pass recorded yet.");
  parts.push(needAttention > 0 ? `${n(needAttention)} ${needAttention === 1 ? "page needs" : "pages need"} attention.` : "Nothing needs you.");
  return parts.join(" ");
}

const actionVerbs: Record<string, string> = {
  pause: "paused crawling", resume: "resumed crawling", publish_on: "turned publication on", publish_off: "turned publication off",
  retry_failed: "retried failed pages", retry_blocked: "retried blocked pages", reparse: "read a page again", rediscover: "started a fresh pass",
};
export function recentActionText(action: CrawlOverview["recent_actions"][number]) {
  const verb = actionVerbs[action.operation] ?? action.operation.replaceAll("_", " ");
  const touched = action.operation.startsWith("retry") || action.operation === "reparse" ? ` (${n(action.affected)} ${action.affected === 1 ? "page" : "pages"})` : "";
  return `${action.who} ${verb} for ${crawlSourceName(action.source)}${touched}`;
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
