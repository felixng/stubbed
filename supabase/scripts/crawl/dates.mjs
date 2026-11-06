// Exact date forms only. A missing year/month can be inherited across a range,
// never from today's date. Unrecognised forms keep their original date_text.
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function part(text) {
  const m = /^(\d{1,2})(?:\s+([a-z]+))?(?:\s+(\d{4}))?$/i.exec(text.trim());
  if (!m || (m[2] && !MONTHS.includes(m[2].slice(0,3).toLowerCase()))) return null;
  return { day: Number(m[1]), month: m[2] ? MONTHS.indexOf(m[2].slice(0,3).toLowerCase()) + 1 : null, year: m[3] ? Number(m[3]) : null };
}
function iso(p) {
  if (!p.year || !p.month) return null;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return d.getUTCFullYear() === p.year && d.getUTCMonth() === p.month - 1 && d.getUTCDate() === p.day ? d.toISOString().slice(0,10) : null;
}
export function parseDates(value) {
  const date_text = String(value ?? '').replace(/\s+/g,' ').trim();
  const text = date_text.replace(/\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b,?\s*/gi,'').replace(/(\d)(?:st|nd|rd|th)\b/gi,'$1').replace(/[–—]/g,'-');
  const chunks = text.split(/\s*(?:-|&)\s*/);
  const empty = { start_date: null, end_date: null, date_text };
  if (chunks.length < 1 || chunks.length > 2) return empty;
  const a = part(chunks[0]), b = chunks.length === 2 ? part(chunks[1]) : null;
  if (!a || (chunks.length === 2 && !b)) return empty;
  if (b) { a.year ??= b.year; b.year ??= a.year; a.month ??= b.month; b.month ??= a.month; }
  const start = iso(a), end = b ? iso(b) : start;
  if (!start || !end || end < start) return empty;
  return { start_date: start, end_date: end, date_text };
}
