// Exact date forms only. A missing year/month can be inherited across a range,
// never from today's date. Unrecognised forms keep their original date_text.
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function part(text) {
  // "Oct 24, 2024" is read as "24 Oct 2024".
  const date = text.trim().replace(/^([a-z]+)\s+(\d{1,2}),\s+(\d{4})$/i, '$2 $1 $3');
  const m = /^(\d{1,2})(?:\s+([a-z]+))?(?:\s+(\d{4}))?$/i.exec(date);
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
  // "Opened 26 Apr 2025" says when it began, not when it ends.
  const opened = /^opened\s+/i.test(date_text);
  const text = date_text.replace(/^opened\s+/i, '').replace(/^dates?\s*:\s*/i, '').replace(/\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b,?\s*/gi,'').replace(/(\d)(?:st|nd|rd|th)\b/gi,'$1').replace(/[–—]/g,'-');
  const chunks = text.split(/\s*(?:-|&)\s*/);
  const empty = { start_date: null, end_date: null, date_text };
  if (chunks.length < 1 || chunks.length > 2) return empty;
  const a = part(chunks[0]), b = chunks.length === 2 ? part(chunks[1]) : null;
  if (!a || (chunks.length === 2 && !b)) return empty;
  if (b) {
    a.month ??= b.month;
    b.month ??= a.month;
    // One stated year on a November-to-February range: a November start is the year before.
    // A range with no stated year stays unreadable; today's date is never used.
    const crossesNewYear = Boolean(a.month && b.month && a.month >= 11 && b.month <= 2);
    if (crossesNewYear && !a.year && b.year) a.year = b.year - 1;
    else if (crossesNewYear && !b.year && a.year) b.year = a.year + 1;
    else { a.year ??= b.year; b.year ??= a.year; }
  }
  const start = iso(a), end = b ? iso(b) : start;
  if (!start || !end || end < start) return empty;
  return { start_date: start, end_date: opened && !b ? null : end, date_text };
}
