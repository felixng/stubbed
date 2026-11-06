import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { normalText } from './rules.mjs';
export function fingerprint(html) {
  const $ = load(html); $('script,style,noscript').remove();
  return createHash('sha256').update(normalText($.root().text())).digest('hex');
}
const junk = /^(book( now| tickets)?|read more|find out more|learn more|tickets|what.?s on|archive|details|buy now)$/i;
export function healthSignals(previous, findings) {
  const titles = findings.filter(f => f.kind === 'show').map(f => normalText(f.raw_title));
  const share = titles.length ? findings.filter(f => f.kind === 'show' && f.start_date).length / titles.length : 0;
  const signals = [];
  if (previous?.result_count >= 3 && titles.length < previous.result_count * 0.5) signals.push('results_dropped');
  if (previous?.readable_share >= 0.5 && share < previous.readable_share * 0.5) signals.push('dates_dropped');
  if (titles.some(t => junk.test(t) || t.length < 2) || (titles.length > 1 && new Set(titles).size <= titles.length * 0.5)) signals.push('junk_titles');
  // Current listings naturally rotate; only flag known shows still overlapping
  // today, or an archive page with the same stable URL/content cohort.
  const known = previous?.titles ?? [];
  if (previous?.type === 'archive' && known.length >= 3 && !known.some(t => titles.includes(t))) signals.push('known_shows_missing');
  return { signals, titles, share };
}
export function archiveQueue(site, pages, redo = false) {
  if (!site.archive_url) return [];
  if (redo || site.archive_status === 'not_started') return [site.archive_url];
  if (site.archive_status === 'done') return [site.archive_url];
  const pending = pages.filter(p => p.type === 'archive' && p.status !== 'ok').map(p => p.url);
  const completed = new Set(pages.filter(p => p.type === 'archive' && p.status === 'ok').map(p => p.url));
  const next = pages.filter(p => p.type === 'archive' && p.next_url && !completed.has(p.next_url)).map(p => p.next_url);
  return [...new Set([...pending,...next])].length ? [...new Set([...pending,...next])] : [site.archive_url];
}
