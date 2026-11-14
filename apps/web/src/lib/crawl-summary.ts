// One line per source: how far, is it moving, when will it finish. Built from crawl_source_summary,
// which counts every current area of a source. The hub, the source page and the guide all read this.
import { type CrawlingState } from "@/lib/admin-crawl";

export type StageCounts = { known: number; read: number; waiting?: number; stuck?: number; retrying?: number };
export type AreaSummary = {
  id: string; scope_key: string; label?: string | null; started_at: string; enumeration_status: string;
  known: number; read: number; waiting: number; due: number; stuck: number; read_3h: number; last_read_at: string | null;
  stages: Record<string, { known: number; read: number }>;
};
export type SourceTotals = { known: number; read: number; waiting: number; due: number; stuck: number; retrying: number; read_3h: number; last_read_at: string | null };
export type SourceSummary = {
  collection_enabled: boolean; publication_enabled: boolean; operator_paused_at: string | null; paused_reason: string | null; withdrawn_at: string | null;
  totals: SourceTotals; stages: Record<string, StageCounts>; areas: AreaSummary[];
};
export type CrawlSummary = Record<string, SourceSummary>;

const HOUR = 3_600_000;
const number = new Intl.NumberFormat("en-GB");
const n = (value: number) => number.format(value);
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

// What a person calls a scan: its area. Known keys have names; others are tidied, never shown raw.
const AREA_NAMES: Record<string, string> = {
  "broadway-directory": "Broadway", "london-listing": "London", "venue-directory": "All venues", directory: "All venues",
};
// An area's label (an official site's host) when it has one, else the tidied scope key.
export const areaLabel = (area: { scope_key: string; label?: string | null }) => area.label ?? areaName(area.scope_key);
const SMALL = new Set(["of", "the", "in", "and", "at"]);
export function areaName(scopeKey: string): string {
  if (AREA_NAMES[scopeKey]) return AREA_NAMES[scopeKey];
  const words = scopeKey.replace(/^supplied[-_]/, "").split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return "Other pages";
  return words.map((word, index) => (index > 0 && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
}

// Pages per hour over the last 3 hours, rounded the way a person says it.
export function readingRate(read3h: number): number {
  const rate = read3h / 3;
  return rate >= 100 ? Math.round(rate / 10) * 10 : Math.round(rate);
}

// "within an hour", "about 3 hours", or a date and time once it is more than half a day away.
export function finishText(waiting: number, perHour: number, now: Date): string | null {
  if (waiting <= 0 || perHour <= 0) return null;
  const hours = waiting / perHour;
  if (hours < 1) return "within an hour";
  if (hours <= 12) return `about ${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  return `around ${dateTime.format(new Date(now.getTime() + hours * HOUR)).replace(",", "")} UTC`;
}

export type SourceLine = {
  name: string;
  percent: number | null;
  read: number; known: number; stuck: number;
  state: "moving" | "stalled" | "waiting_retry" | "keeping_up" | "not_running";
  movement: string;
  finish: string | null;
  needs: number;
};

// Everything the hub row says about one source.
export function sourceLine(name: string, summary: SourceSummary, crawling: CrawlingState, now: Date = new Date()): SourceLine {
  const { totals } = summary;
  // Rounded, but never 100% until every known page is read.
  const percent = totals.known > 0 ? (totals.read >= totals.known ? 100 : Math.min(99, Math.round((totals.read / totals.known) * 100))) : null;
  const rate = readingRate(totals.read_3h);
  const base = { name, percent, read: totals.read, known: totals.known, stuck: totals.stuck, needs: totals.stuck };
  if (crawling.key !== "on") {
    return { ...base, state: "not_running", movement: `${crawling.label}${totals.waiting > 0 ? ` · ${n(totals.waiting)} pages waiting` : ""}`, finish: null };
  }
  if (totals.waiting === 0) return { ...base, state: "keeping_up", movement: "Keeping up to date", finish: null };
  if (rate > 0) {
    const finish = finishText(totals.waiting, rate, now);
    return { ...base, state: "moving", movement: `Reading ~${n(rate)} pages/hour`, finish: finish ? `done ${finish.startsWith("around") || finish.startsWith("within") ? finish : `in ${finish}`}` : null };
  }
  if (totals.due > 0) {
    const since = totals.last_read_at ? Math.max(1, Math.floor((now.getTime() - new Date(totals.last_read_at).getTime()) / HOUR)) : null;
    return { ...base, state: "stalled", movement: since === null ? "Stalled: nothing read yet" : `Stalled: nothing read for ${since} h`, finish: null };
  }
  return { ...base, state: "waiting_retry", movement: "Waiting to retry", finish: null };
}

export type AreaLine = { name: string; text: string; state: "done" | "reading" | "waiting_turn" | "finding" | "waiting"; href?: string };
// One line per area, largest first (the summary already orders them). An area waits its turn when it has
// work due but nothing read in 3 hours while another area of the same source is being read.
export function areaLines(summary: SourceSummary): AreaLine[] {
  const someoneReading = summary.areas.some(area => area.read_3h > 0);
  return summary.areas.map(area => {
    const shows = area.stages.event ?? null;
    const counts = shows && shows.known > 0 ? `${n(shows.read)} of ${n(shows.known)} show pages` : `${n(area.read)} of ${n(area.known)} pages`;
    const name = areaLabel(area);
    if (area.waiting === 0 && area.known > 0) return { name, text: "done", state: "done" as const };
    if (area.enumeration_status === "enumerating" && area.read_3h > 0) return { name, text: `${counts} · reading now, still finding pages`, state: "finding" as const };
    if (area.read_3h > 0) return { name, text: `${counts} · reading now`, state: "reading" as const };
    if (area.due > 0 && someoneReading) return { name, text: `${counts} · waiting its turn`, state: "waiting_turn" as const };
    return { name, text: `${counts} · waiting`, state: "waiting" as const };
  });
}

// "Find venues ✓ · Read venues 86/106 · Read shows 3,118/6,898": the steps in one line, combined across areas.
export function stepsLine(stages: SourceSummary["stages"]): string {
  const part = (label: string, key: string) => {
    const counts = stages[key];
    if (!counts || counts.known === 0) return `${label} —`;
    return counts.read >= counts.known ? `${label} ✓` : `${label} ${n(counts.read)}/${n(counts.known)}`;
  };
  return [part("Find venues", "directory"), part("Read venues", "venue"), part("Read shows", "event")].join(" · ");
}

// The numbers must agree everywhere: hub total = sum of sources = sum of every source's areas.
export function hubTotals(summary: CrawlSummary): { known: number; read: number; fromAreas: number } {
  const sources = Object.values(summary);
  return {
    known: sources.reduce((sum, source) => sum + source.totals.known, 0),
    read: sources.reduce((sum, source) => sum + source.totals.read, 0),
    fromAreas: sources.reduce((sum, source) => sum + source.areas.reduce((inner, area) => inner + area.known, 0), 0),
  };
}
