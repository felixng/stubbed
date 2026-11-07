// Reads what's on from a theatre's own website (#291): schema.org Event data
// first (by code, no cost), then a model when the run allows it. Findings keep
// the raw title and the dates as written; nothing here links to a show.
import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
import { decodeEntities } from '../readers.mjs';

export const DEFAULT_PROMPT = readFileSync(new URL('../prompt.md', import.meta.url), 'utf8').trim();

// $ per million tokens [input, output], from Anthropic's price list (checked
// 6 Oct 2026; Haiku's is for prompts up to 100K tokens). A model not listed
// here is never called, so a run can't spend without a known price.
export const MODEL_PRICES = {
  'claude-haiku-5-5': [0.10, 0.50],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
export const DEFAULT_MODEL = 'claude-haiku-5-5';

const MAX_PAGE_CHARS = 30_000;
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';

// ---------- dates ----------

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

// 'YYYY-MM-DD' for a real calendar date, else null. Takes the date part of a
// longer ISO string; never fills in a missing part.
export function isoDate(value) {
  const m = ISO.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// A show listed for years either side of today is believable; anything else is
// almost certainly a misread.
export function plausibleDate(iso, today = new Date()) {
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  const now = today.getUTCFullYear();
  return year >= now - 1 && year <= now + 3 ? iso : null;
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const DAY = /\b\d{1,2}(st|nd|rd|th)?\b/;
// Dates as written that name a day and a month are explicit.
export function explicitDateText(text) {
  return Boolean(text) && MONTH.test(text) && DAY.test(text);
}

// ---------- structured data ----------

export function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html ?? '').matchAll(re)) {
    try { blocks.push(JSON.parse(decodeEntities(m[1]).trim())); } catch { /* a broken block is skipped */ }
  }
  return blocks;
}

function walk(node, out) {
  if (Array.isArray(node)) { node.forEach(n => walk(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  const types = [].concat(node['@type'] ?? []);
  if (types.some(t => /Event$|Festival$/.test(String(t)))) out.push(node);
  for (const key of ['@graph', 'itemListElement', 'item', 'subEvent', 'event', 'events']) {
    if (node[key]) walk(node[key], out);
  }
}

export function eventsFromJsonLd(blocks) {
  const out = [];
  blocks.forEach(b => walk(b, out));
  return out;
}

const text = v => (typeof v === 'string' ? decodeEntities(v).replace(/\s+/g, ' ').trim() : '');

function locationNames(event) {
  return [].concat(event.location ?? []).flatMap(l => (typeof l === 'string' ? [l] : [l?.name, l?.address?.name])).map(text).filter(Boolean);
}

const TALK = /\b(talk|lecture|conversation|q\s*&\s*a|panel|workshop|tour|masterclass)\b/i;

export function eventKind(event) {
  const types = [].concat(event['@type'] ?? []).join(' ');
  const name = text(event.name);
  if (/MusicEvent/.test(types) || /\bconcert|gig\b/i.test(name)) return 'concert';
  if (/EducationEvent|LiteraryEvent/.test(types) || TALK.test(name)) return 'talk';
  if (/TheaterEvent|DanceEvent|ComedyEvent|Festival/.test(types)) return 'show';
  if (/ScreeningEvent|Exhibition|Sale|Business/.test(types)) return 'other';
  return 'show';
}

// Which of the venues sharing this site a stage name belongs to. One venue on
// the site takes everything; with several, the stage must name one of them.
const SKIP_WORDS = /\b(the|theatre|theater|stage|auditorium|space|at)\b/g;
const squash = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(SKIP_WORDS, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export function matchStage(stage, venues) {
  if (venues.length === 1) return venues[0].id;
  const s = squash(stage ?? '');
  if (!s) return null;
  const hits = venues.filter(v => {
    const n = squash(v.name);
    return n && (n === s || s.includes(n) || (s.length >= 4 && n.includes(s)));
  });
  return hits.length === 1 ? hits[0].id : null;
}

export function structuredReader({ url, html }, { venues }) {
  const events = eventsFromJsonLd(jsonLdBlocks(html));
  const $ = load(html);
  $('[itemscope][itemtype$="Event"]').each((_, element) => {
    const item = $(element);
    const metadata = property => item.find(`meta[itemprop="${property}"]`)
      .filter((_, field) => $(field).closest('[itemscope]')[0] === element).first().attr('content');
    const name = metadata('name');
    const startDate = metadata('startDate');
    if (name && startDate) events.push({
      '@type': item.attr('itemtype').split('/').at(-1),
      name, startDate, endDate: metadata('endDate'),
      location: item.find('[itemprop="location"] meta[itemprop="name"]').first().attr('content'),
    });
  });
  if (events.length === 0) return null;
  const seen = new Set();
  const findings = [];
  for (const e of events) {
    const title = text(e.name).slice(0, 300);
    if (!title) continue;
    const start = isoDate(e.startDate);
    const end = isoDate(e.endDate);
    const stage = locationNames(e).find(n => matchStage(n, venues)) ?? locationNames(e)[0] ?? null;
    const key = `${title.toLowerCase()}|${start}|${stage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dateText = [e.startDate, e.endDate].filter(Boolean).map(String).join(' to ').slice(0, 200) || null;
    findings.push({
      venue_id: matchStage(stage, venues), source_url: url, raw_title: title, stage_text: stage,
      start_date: start, end_date: end && start && end >= start ? end : null, date_text: dateText,
      kind: eventKind(e), method: 'structured',
      confidence: start && end ? 0.9 : start ? 0.8 : 0.5,
      evidence: JSON.stringify({ name: e.name, startDate: e.startDate, endDate: e.endDate, location: stage }).slice(0, 400),
    });
  }
  return findings.length ? findings : null;
}

// ---------- model ----------

// The page as plain text for the model: no scripts, styles or tags.
export function pageText(html) {
  return decodeEntities(String(html ?? '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, MAX_PAGE_CHARS);
}

export const EVENTS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['events'],
  properties: { events: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['title', 'stage', 'start_date', 'end_date', 'date_text', 'kind', 'evidence'],
    properties: {
      title: { type: 'string' }, stage: { type: ['string', 'null'] },
      start_date: { type: ['string', 'null'] }, end_date: { type: ['string', 'null'] },
      date_text: { type: 'string' }, kind: { enum: ['show', 'talk', 'concert', 'other'] }, evidence: { type: 'string' },
    },
  } } },
};

export function costUsd(model, usage) {
  const price = MODEL_PRICES[model];
  if (!price || !usage) return 0;
  return ((usage.input_tokens ?? 0) * price[0] + (usage.output_tokens ?? 0) * price[1]) / 1e6;
}

// Turns the model's list into findings. A date is kept only when the page's
// own date text names a day and a month: a date with nothing written to back
// it is dropped, never trusted.
export function findingsFromModel(events, { url, venues, today }) {
  const seen = new Set();
  const findings = [];
  for (const e of events ?? []) {
    const title = text(e?.title).slice(0, 300);
    if (!title) continue;
    const dateText = text(e.date_text).slice(0, 200) || null;
    const backed = explicitDateText(dateText);
    const start = backed ? isoDate(e.start_date) : null;
    const end = backed ? isoDate(e.end_date) : null;
    const stage = text(e.stage).slice(0, 200) || null;
    const key = `${title.toLowerCase()}|${start}|${stage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      venue_id: matchStage(stage, venues), source_url: url, raw_title: title, stage_text: stage,
      start_date: start, end_date: end && start && end >= start ? end : null, date_text: dateText,
      kind: ['show', 'talk', 'concert', 'other'].includes(e.kind) ? e.kind : 'other', method: 'model',
      confidence: start ? 0.7 : dateText ? 0.5 : 0.4,
      evidence: text(e.evidence).slice(0, 400) || null,
    });
  }
  return findings;
}

// Calls the Messages API with fetch (no SDK, like the other scripts) and
// returns findings, or null with a reason when the run doesn't allow a call.
// `ctx.run` carries method, model, prompt and budget; `ctx.spend.usd` is the
// running cost, stopped at the run's budget.
export async function modelReader({ url, html }, ctx) {
  const { run, venues, spend, fetchFn = fetch, apiKey = process.env.ANTHROPIC_API_KEY, today } = ctx;
  const note = reason => { ctx.notes?.push(reason); return null; };
  if (run?.method !== 'rules_model') return null;
  const model = run.model || DEFAULT_MODEL;
  if (!MODEL_PRICES[model]) return note(`model ${model} has no known price, so it was not used`);
  if (!apiKey) return note('no ANTHROPIC_API_KEY, so the model was not used');
  const budget = Number(run.budget_usd ?? 0);
  if (!(budget > 0) || spend.usd >= budget) return note('budget used up, so the model was not used');
  const body = pageText(html);
  if (!body) return note('the page had no text');
  const prompt = run.prompt || DEFAULT_PROMPT;
  const prices = MODEL_PRICES[model];
  const reserve = ((Buffer.byteLength(body + prompt + JSON.stringify(EVENTS_SCHEMA)) + 2048) * prices[0] + 8000 * prices[1]) / 1e6;
  if (spend.usd + reserve > budget) return note('remaining budget cannot cover the maximum model response');
  spend.usd += reserve;
  const res = await fetchFn(API_URL, {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
    body: JSON.stringify({
      model, max_tokens: 8000, system: run.prompt || DEFAULT_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EVENTS_SCHEMA } },
      messages: [{ role: 'user', content: `Page: ${url}\n\n${body}` }],
    }),
  });
  if (!res.ok) return note(`the model call failed (${res.status})`);
  const data = await res.json();
  if (data.usage) spend.usd += costUsd(model, data.usage) - reserve;
  const block = (data.content ?? []).find(b => b.type === 'text');
  let parsed;
  try { parsed = JSON.parse(block?.text ?? ''); } catch { return note('the model did not return valid JSON'); }
  const findings = findingsFromModel(parsed.events, { url, venues, today });
  return findings.length ? findings : null;
}
