// Accept calendar dates explicitly supported by a labelled source field.
// Inherit year/month only between the two endpoints of an explicit range.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAY = /^(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[ ,]+/i;

function endpoint(value) {
  const text = value.trim().replace(WEEKDAY, '').replace(/,/g, '')
    .replace(/(\d)(?:st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ');
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const monthFirst = /^([a-z]+) (\d{1,2})(?: (\d{4}))?$/i.exec(text);
  const dayFirst = /^(\d{1,2})(?: ([a-z]+))?(?: (\d{4}))?$/i.exec(text);
  const [day, name, year] = monthFirst ? [monthFirst[2], monthFirst[1], monthFirst[3]] : dayFirst?.slice(1) ?? [];
  if (!day) return null;
  const normal = name?.toLowerCase();
  const month = normal ? MONTHS.findIndex(m => normal === m || normal === m.slice(0, 3) || (m === 'september' && normal === 'sept')) + 1 : null;
  if (normal && !month) return null;
  return { day: Number(day), month, year: year ? Number(year) : null };
}

function date({ year, month, day }) {
  if (!year || !month) return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return value.toISOString().slice(0, 10);
}

export function sourceDateRange(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chunks = text.split(/\s*[–—]\s*|\s+to\s+|\s+-\s*|(?<=\d)-(?=\d{1,2}\s+[a-z])/i);
  const unknown = { start: null, end: null, precision: 'unknown' };
  if (chunks.length > 2) return unknown;
  const first = endpoint(chunks[0]);
  const last = chunks[1] ? endpoint(chunks[1]) : null;
  if (!first || (chunks[1] && !last)) return unknown;
  if (!last) {
    const start = date(first);
    if (!start) return unknown;
    return { start, end: chunks.length === 2 ? null : start, precision: chunks.length === 2 ? 'open' : 'day' };
  }

  const bothMonthsGiven = Boolean(first.month && last.month);
  first.month ??= last.month;
  last.month ??= first.month;
  const firstMonthAfter = first.month > last.month;
  if (first.year === null && last.year !== null) first.year = last.year - Number(bothMonthsGiven && firstMonthAfter);
  if (last.year === null && first.year !== null) last.year = first.year + Number(bothMonthsGiven && firstMonthAfter);
  const start = date(first);
  const end = date(last);
  if (!start || !end || end < start) return unknown;
  return { start, end, precision: start === end ? 'day' : 'range' };
}
