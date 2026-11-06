// Offline Mezzanine mapping. Keep in step with iOS Data/MezzanineImport.swift.
export type MezzanineRow = {
  show: string; venue: string; city: string; date: string | null;
  rating: number | null; review: string; invalidRating: boolean; planned: boolean;
};
export class MezzanineError extends Error {
  readonly kind: "empty" | "unsupported";
  constructor(kind: "empty" | "unsupported") {
    super(kind === "empty" ? "No shows in this file." : "This doesn’t look like a Mezzanine export. Check that you picked the CSV or JSON file Mezzanine made.");
    this.kind = kind;
  }
}
const unsupported = (): never => { throw new MezzanineError("unsupported"); };
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
export function mezzanineDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] ? day : null;
}
function row(show: unknown, venue: unknown, city: unknown, rawDate: unknown, rawRating: unknown, review: unknown, today: string): MezzanineRow {
  const date = mezzanineDay(rawDate);
  const planned = !!date && date > today;
  const raw = rawRating == null ? "" : String(rawRating).trim();
  const number = Number(raw);
  const invalidRating = raw !== "" && (!Number.isFinite(number) || (number !== 0 && (number < 0.5 || number > 5)));
  const rating = !invalidRating && number !== 0 ? Math.round(number * 2) / 2 : null;
  return { show: clean(show), venue: clean(venue), city: clean(city), date, rating: planned ? null : rating,
    review: typeof review === "string" ? Array.from(review).slice(0, 10_000).join("") : "", invalidRating, planned };
}
function csv(text: string): string[][] {
  const chars = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = []; let fields: string[] = [];
  let field = "", quoted = false, closed = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (quoted) {
      if (c === '"') {
        if (chars[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === "," || c === "\n") {
      fields.push(field); field = ""; closed = false;
      if (c === "\n") { rows.push(fields); fields = []; }
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else { if (closed || c === '"') unsupported(); field += c; }
  }
  if (quoted) unsupported();
  fields.push(field); rows.push(fields); return rows;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function parseMezzanine(source: string, today: string): MezzanineRow[] {
  const text = source.replace(/^\uFEFF/, "").trim();
  if (!text) throw new MezzanineError("empty");
  if (text.startsWith("{") || text.startsWith("[")) {
    let data: unknown;
    try { data = JSON.parse(text); } catch { return unsupported(); }
    const entries = object(object(data).data).diaryEntries;
    if (!Array.isArray(entries)) return unsupported();
    if (!entries.length) throw new MezzanineError("empty");
    return entries.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return unsupported();
      const entry = object(value), theater = object(object(entry.production).theater);
      if (entry.rating != null && typeof entry.rating !== "number") return unsupported();
      return row(object(entry.show).name, theater.name, theater.location, entry.date, entry.rating, entry.review, today);
    });
  }
  const [header, ...records] = csv(text);
  const required = ["date", "show", "theater", "location", "time", "specialTags", "customTags", "seat", "rating", "review", "notes"];
  if (!required.every((key) => header.includes(key)) || new Set(header).size !== header.length) return unsupported();
  const values = records.filter((r) => r.some((v) => v !== ""));
  if (!values.length) throw new MezzanineError("empty");
  return values.map((fields) => {
    if (fields.length !== header.length) return unsupported();
    const get = (key: string) => fields[header.indexOf(key)];
    return row(get("show"), get("theater"), get("location"), get("date"), get("rating"), get("review"), today);
  });
}
