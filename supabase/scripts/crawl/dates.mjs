// Exact date forms only. A missing year/month can be inherited across a range,
// never from today's date. Unrecognised forms keep their original date_text.
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function part(text) {
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
    // A November–January range with one stated year crosses New Year.
    if (a.month && b.month) {
      const crossesNewYear = a.month >= 11 && b.month <= 2;
      a.year ??= b.year && b.year - Number(crossesNewYear);
      b.year ??= a.year && a.year + Number(crossesNewYear);
    }
  }
  const start = iso(a), end = b ? iso(b) : start;
  if (!start || !end || end < start) return empty;
  return { start_date: start, end_date: opened && !b ? null : end, date_text };
}
