// Filters for /app/backstage/theatres, read from the query string and passed to
// admin_list_venues / admin_venue_totals.
export const PAGE_SIZE = 50;

export const CIRCUITS = [
  { value: "west_end", label: "West End" },
  { value: "off_west_end", label: "Off West End" },
  { value: "pub", label: "Pub" },
  { value: "broadway", label: "Broadway" },
  { value: "off_broadway", label: "Off Broadway" },
  { value: "regional_uk", label: "Regional UK" },
  { value: "regional_us", label: "Regional US" },
  { value: "none", label: "No circuit" },
] as const;

export type TheatreFilters = {
  q: string;
  circuit: string;
  country: string;
  website: "" | "has" | "lacks";
  whatsOn: "" | "has" | "lacks";
  page: number;
};

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function tri(v: string): "" | "has" | "lacks" {
  return v === "has" || v === "lacks" ? v : "";
}

export function parseTheatreFilters(params: Record<string, string | string[] | undefined>): TheatreFilters {
  const circuit = one(params.circuit);
  const country = one(params.country).trim().toUpperCase();
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    circuit: CIRCUITS.some((c) => c.value === circuit) ? circuit : "",
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    website: tri(one(params.website)),
    whatsOn: tri(one(params.whats_on)),
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

// The arguments shared by the list and the totals.
export function filterArgs(f: TheatreFilters) {
  return {
    q: f.q || null,
    in_circuit: f.circuit || null,
    in_country: f.country || null,
    has_website: f.website ? f.website === "has" : null,
    has_whats_on: f.whatsOn ? f.whatsOn === "has" : null,
  };
}

// A link to the same filters on another page (or none).
export function theatresHref(f: TheatreFilters, page = f.page): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.circuit) p.set("circuit", f.circuit);
  if (f.country) p.set("country", f.country);
  if (f.website) p.set("website", f.website);
  if (f.whatsOn) p.set("whats_on", f.whatsOn);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/app/backstage/theatres${s ? `?${s}` : ""}`;
}
