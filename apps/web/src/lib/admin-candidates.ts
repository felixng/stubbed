import { SHOW_TYPES } from "@/lib/admin-shows";
import { UUID } from "@/lib/admin-crawl";

// Filters and the bulk-add rule for /app/admin/shows/candidates.
export const PAGE_SIZE = 25;
export const BAR = 0.95; // share of a sample that must be right before adding the rest
export const MIN_REVIEWED = 20;
export const SAMPLE_SIZE = 50;

export const STATUSES = ["pending", "added", "same", "rejected"] as const;

export type CandidateFilters = {
  q: string;
  type: string;
  status: (typeof STATUSES)[number] | "all";
  sample: string;
  page: number;
};

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseCandidateFilters(params: Record<string, string | string[] | undefined>): CandidateFilters {
  const type = one(params.type);
  const status = one(params.status);
  const sample = one(params.sample);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    type: (SHOW_TYPES as readonly string[]).includes(type) ? type : "",
    status: status === "all" ? "all" : (STATUSES as readonly string[]).includes(status) ? (status as CandidateFilters["status"]) : "pending",
    sample: UUID.test(sample) ? sample : "",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

export function candidateHref(f: CandidateFilters, page = f.page): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.type) p.set("type", f.type);
  if (f.status !== "pending") p.set("status", f.status);
  if (f.sample) p.set("sample", f.sample);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/app/admin/shows/candidates${s ? `?${s}` : ""}`;
}

export type SampleScore = { size: number; reviewed: number; good: number; bad: number; share: number | null };

// Why "Add the rest" is or isn't available yet.
export function bulkStatus(score: SampleScore | null): { ok: boolean; message: string } {
  if (!score) return { ok: false, message: "Review a sample first." };
  if (score.reviewed < MIN_REVIEWED) {
    return { ok: false, message: `Review at least ${MIN_REVIEWED} from the sample (${score.reviewed} so far).` };
  }
  const share = score.share ?? 0;
  const pct = Math.round(share * 1000) / 10;
  if (share < BAR) return { ok: false, message: `The sample is ${pct}% right; ${Math.round(BAR * 100)}% is needed.` };
  return { ok: true, message: `The sample is ${pct}% right (${score.good} of ${score.reviewed}).` };
}
