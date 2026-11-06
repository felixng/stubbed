import { load } from 'cheerio';
import { decodeEntities } from './readers.mjs';
import { parseDates } from './dates.mjs';
import { matchStage } from './sources/theatre-site.mjs';

export const RULES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['item', 'title', 'dates'],
  properties: Object.fromEntries(['item','title','dates','stage','link','next'].map(key => [key, { type: 'string', maxLength: 300 }])),
};
export function validateRules(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return false;
  const keys = ['item','title','dates','stage','link','next'];
  if (!Object.keys(rules).every(k => keys.includes(k)) || !['item','title','dates'].every(k => typeof rules[k] === 'string' && rules[k].trim())) return false;
  if (!Object.values(rules).every(v => typeof v === 'string' && v.length <= 300)) return false;
  try { const $ = load('<div/>'); for (const selector of Object.values(rules)) if (selector) $(selector); return true; } catch { return false; }
}
export const normalText = s => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
export function pageText(html) { const $ = load(html); return normalText(decodeEntities($.root().text())); }
export function checkFindings(html, findings) {
  const text = pageText(html);
  return findings.filter(f => {
    const title = normalText(f.raw_title);
    if (!title || !text.includes(title)) return false;
    if (!f.date_text) return true;
    // Structured data combines the two literal ISO fields for presentation.
    const parts = f.method === 'structured' ? f.date_text.split(' to ') : [f.date_text];
    return parts.every(p => text.includes(normalText(p)));
  }).map(f => ({ ...f, page_checked: true }));
}
export function readRules({ html, url }, { rules, venues, ruleId = null }) {
  if (!validateRules(rules)) throw new Error('Invalid reading rules');
  const $ = load(html); const seen = new Set(); const findings = [];
  $(rules.item).slice(0, 2000).each((_, element) => {
    const block = $(element);
    const value = selector => selector ? block.find(selector).first().text().replace(/\s+/g,' ').trim() : '';
    const raw_title = value(rules.title).slice(0,300);
    const date_text = value(rules.dates).slice(0,200);
    const stage_text = value(rules.stage).slice(0,200) || null;
    const key = normalText(`${raw_title}|${date_text}|${stage_text}`);
    if (!raw_title || seen.has(key)) return;
    seen.add(key);
    let source_url = url;
    if (rules.link) {
      try { const href = block.find(rules.link).first().attr('href'); if (!href) throw new Error('No link'); const target = new URL(href, url); if (target.origin === new URL(url).origin) source_url = target.href; } catch { /* keep fetched page */ }
    }
    const dates = parseDates(date_text);
    findings.push({ raw_title, ...dates, stage_text, source_url, venue_id: matchStage(stage_text, venues), method: 'rules', kind: 'show', confidence: dates.start_date ? 0.95 : 0.5, evidence: `${raw_title}: ${date_text}`.slice(0,400), rule_id: ruleId });
  });
  let next = null;
  if (rules.next) {
    try { const href = $(rules.next).first().attr('href'); if (!href) throw new Error('No next page'); const u = new URL(href, url); if (u.origin === new URL(url).origin && /^https?:$/.test(u.protocol)) next = u.href; } catch { /* no next page */ }
  }
  return { findings, next };
}
export function rulesReader(page, ctx) {
  if (!ctx.rules) return null;
  return readRules(page, ctx).findings;
}
