import { checkFindings } from "./rules.mjs";
// How a fetched page becomes findings. A reader is
//   (page: { url, html }, ctx: { venues, run, spend, notes }) => findings | null | Promise of either
// and the first reader to return an array wins. The real readers (structured
// data, then a model) are in sources/theatre-site.mjs and index.mjs puts them
// in front of the stub, which records the page title when nothing else could
// read the page.

export function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html ?? '');
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 300) : '';
}

// One finding per site: the page's title, no dates, confidence 0. It proves a
// page was reached and stored. It is attached to a venue only when the site
// belongs to exactly one.
export function stubReader({ url, html }, { venues }) {
  return [{
    venue_id: venues.length === 1 ? venues[0].id : null,
    source_url: url,
    raw_title: extractTitle(html) || '(no title)',
    stage_text: null, start_date: null, end_date: null, date_text: null,
    kind: 'other', method: 'stub', confidence: 0, evidence: null,
  }];
}

export const readers = [stubReader];

export async function readPage(page, ctx, list = readers) {
  for (const reader of list) {
    const findings = await reader(page, ctx);
    if (Array.isArray(findings)) {
      const checked = checkFindings(page.html, findings);
      const dropped = findings.length - checked.length;
      if (dropped) ctx.notes?.push(`${dropped} findings failed the page check`);
      return checked;
    }
  }
  return [];
}
