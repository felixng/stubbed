// Filters for /app/backstage/shows and the name check, shared with the page.
export const PAGE_SIZE = 50;

export const SHOW_TYPES = ["musical", "play", "opera", "dance", "comedy", "standup", "concert", "other"] as const;

export type ShowFilters = {
  q: string;
  type: string;
  source: "" | "wikidata" | "typed";
  entries: "" | "has" | "none";
  problems: boolean;
  page: number;
};

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseShowFilters(params: Record<string, string | string[] | undefined>): ShowFilters {
  const type = one(params.type);
  const source = one(params.source);
  const entries = one(params.entries);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    type: (SHOW_TYPES as readonly string[]).includes(type) ? type : "",
    source: source === "wikidata" || source === "typed" ? source : "",
    entries: entries === "has" || entries === "none" ? entries : "",
    problems: one(params.problems) === "1",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

export function showFilterArgs(f: ShowFilters) {
  return {
    q: f.q || null,
    in_type: f.type || null,
    in_source: f.source || null,
    in_entries: f.entries || null,
    only_problems: f.problems,
  };
}

export function showsHref(f: ShowFilters, page = f.page): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.type) p.set("type", f.type);
  if (f.source) p.set("source", f.source);
  if (f.entries) p.set("entries", f.entries);
  if (f.problems) p.set("problems", "1");
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/app/backstage/shows${s ? `?${s}` : ""}`;
}

// What a pasted title comes to when a user types it into the search.
export type NameVerdict = "first" | "lower" | "wrong" | "missing";

export function nameVerdict(foundAt: number | null, resultCount: number): NameVerdict {
  if (foundAt === 1) return "first";
  if (foundAt !== null) return "lower";
  return resultCount > 0 ? "wrong" : "missing";
}

export const VERDICT_ORDER: NameVerdict[] = ["missing", "wrong", "lower", "first"];

export const VERDICT_LABEL: Record<NameVerdict, string> = {
  first: "Found first",
  lower: "Found lower down",
  wrong: "Wrong-looking",
  missing: "Missing",
};

// One title per line; blanks and repeats dropped, in the order pasted.
export function parseTitles(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().replace(/\s+/g, " ");
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t.slice(0, 200));
  }
  return out;
}
