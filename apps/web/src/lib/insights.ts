// Pure helpers for the owner's Insights (/app/stats) and the Profile summary (#226). All counting
// is Postgres (`own_insights`, `own_insight_entries`); this only shapes what they return.

export type InsightAccess = { tier: "free" | "pro"; period: "current" | "past" | "all"; locked: string[] };

export type OwnInsights = {
  total: number;
  unique_shows: number;
  unlocated: number;
  repeated_shows: { id: string; title: string; count: number; rank: number }[];
  streaks: { current_daily: number; longest_daily: number; current_weekly: number; longest_weekly: number };
  years: { year: number; count: number }[];
  months: { month: string; count: number }[];
  days: { date: string; count: number }[];
  types: { type: string; count: number }[];
  countries: { country: string; count: number }[];
  // Absent from a response that predates gating; read that as "nothing locked".
  access?: InsightAccess;
};

export type InsightVisit = { id: string; date: string; title: string; venue: string | null; rating: number | null };
export type InsightFilter = { day?: string; country?: string; type?: string; show?: string; title: string };

export const SHOW_TYPE_NAMES: Record<string, string> = {
  musical: "Musical", play: "Play", opera: "Opera", dance: "Dance", comedy: "Comedy",
  standup: "Stand-up", concert: "Concert", circus: "Circus", other: "Other",
};

// A section is locked only when the server says so; the screens never look at a tier.
export function isLocked(stats: Pick<OwnInsights, "access"> | null | undefined, field: string): boolean {
  return Boolean(stats?.access?.locked.includes(field));
}

// The whole period is unavailable (a Free caller on an earlier year or All time).
export function isPeriodLocked(stats: Pick<OwnInsights, "access"> | null | undefined): boolean {
  return isLocked(stats, "total");
}

// A locked drill-down: Postgres raises 42501 "upgrade_required:<feature>".
export function upgradeRequired(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error || error.code !== "42501") return null;
  const match = /^upgrade_required:(\S+)/.exec(error.message ?? "");
  return match ? match[1] : null;
}

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// The ?year= value: a four-digit year, "all", or anything else meaning this year.
export function parsePeriod(value: string | null | undefined, thisYear: number): number | null {
  if (value === "all") return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= thisYear + 1 ? year : thisYear;
}

export function periodLabel(year: number | null): string {
  return year == null ? "All time" : String(year);
}

// The period picker: this year, every year the server returned (none while that is locked), All time.
export function periodOptions(thisYear: number, years: { year: number }[]): (number | null)[] {
  const list = [...new Set([thisYear, ...years.map((y) => y.year)])].sort((a, b) => b - a);
  return [...list, null];
}

export type HeatCell = { date: string; count: number; inYear: boolean };

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Monday-first weeks covering the year, each of seven cells, the GitHub-style activity grid.
export function heatmapWeeks(year: number, days: { date: string; count: number }[]): HeatCell[][] {
  const counts = new Map(days.map((d) => [d.date, d.count]));
  const first = Date.UTC(year, 0, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const last = Date.UTC(year, 11, 31);
  const weeks: HeatCell[][] = [];
  for (let start = first - lead * DAY; start <= last; start += 7 * DAY) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = iso(start + i * DAY);
      return { date, count: counts.get(date) ?? 0, inYear: date.startsWith(String(year)) };
    }));
  }
  return weeks;
}

// Shade 0 (none) to 4 for a day's count against the busiest day.
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthlyCounts(months: { month: string; count: number }[], year: number): number[] {
  return MONTHS.map((_, i) => months.find((m) => m.month === `${year}-${String(i + 1).padStart(2, "0")}`)?.count ?? 0);
}

// Show mix rows for every type with visits, biggest first, each with its share of the total.
export function typeShares(types: { type: string; count: number }[], total: number) {
  return [...types]
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .map((t) => ({ ...t, name: SHOW_TYPE_NAMES[t.type] ?? t.type, percent: total > 0 ? Math.round((t.count / total) * 100) : 0 }));
}

// The most recent year with entries up to now, for labelling the All time grid.
export function gridYear(period: number | null, thisYear: number, days: { date: string }[]): number {
  if (period != null) return period;
  const latest = days.map((d) => Number(d.date.slice(0, 4))).filter((y) => y <= thisYear).sort((a, b) => b - a)[0];
  return latest ?? thisYear;
}

// ---- Locks and the period menu (#261). Everything reads `access.locked`; no tier checks. ----

// The data each insight share card draws, declared once. A card is locked when any of it is.
export const CARD_NEEDS: Record<string, string[]> = {
  "weekly-streak": ["streaks.current_weekly"],
  "year-in-theatre": ["total", "months"],
  "show-mix": ["types"],
};

export function isCardLocked(id: string, stats: Pick<OwnInsights, "access"> | null | undefined): boolean {
  return (CARD_NEEDS[id] ?? []).some((field) => isLocked(stats, field));
}

export type PeriodChoice = { value: string; label: string; year: number | null | "earlier"; locked: boolean };

// The period control. Earlier years aren't listed while `years` is locked (the list itself would
// reveal them), so one "Earlier years" entry stands for them; it and All time carry the lock.
export function periodChoices(thisYear: number, stats: Pick<OwnInsights, "years" | "access"> | null | undefined): PeriodChoice[] {
  const lockedYears = isLocked(stats, "years");
  const years = lockedYears ? [thisYear] : periodOptions(thisYear, stats?.years ?? []).filter((y): y is number => y != null);
  return [
    ...years.map((y) => ({ value: String(y), label: String(y), year: y, locked: false })),
    ...(lockedYears ? [{ value: "earlier", label: "Earlier years", year: "earlier" as const, locked: true }] : []),
    { value: "all", label: "All time", year: null, locked: lockedYears },
  ];
}

// The page a locked choice returns to after upgrading.
export function periodNext(choice: PeriodChoice, thisYear: number): string {
  return choice.year === null ? "/app/stats?year=all" : `/app/stats?year=${choice.year === "earlier" ? thisYear - 1 : choice.year}`;
}

// Development preview: the response a Free caller gets with gates on (PAYWALL.md section 2),
// built from a real one with the locked fields emptied.
export function previewStats(stats: OwnInsights, year: number | null, thisYear: number): OwnInsights {
  const period = year == null ? "all" : year === thisYear ? "current" : "past";
  if (period !== "current") {
    return {
      ...stats, total: 0, unique_shows: 0, unlocated: 0, repeated_shows: [], years: [], months: [], days: [], types: [], countries: [],
      streaks: { ...stats.streaks, longest_daily: 0, longest_weekly: 0 },
      access: { tier: "free", period, locked: ["total", "unique_shows", "repeated_shows", "unlocated", "streaks.longest_daily", "streaks.longest_weekly", "years", "months", "days", "types", "countries"] },
    };
  }
  return { ...stats, years: [], types: [], access: { tier: "free", period, locked: ["years", "types"] } };
}
