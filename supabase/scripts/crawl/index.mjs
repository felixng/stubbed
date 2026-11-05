#!/usr/bin/env node
// Reads what's on from theatre websites into crawl_runs / crawl_findings for
// admin review (#277). Nothing it writes reaches users. Node 24+, no packages,
// psql. See supabase/README.md and docs/CATALOGUE.md section 5.
//
//   node supabase/scripts/crawl/index.mjs --venues <id,id> [--dry-run]
//   node supabase/scripts/crawl/index.mjs --run-id <uuid>
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createFetcher, siteKey } from './fetch.mjs';
import { createRun, finishRun, loadSite, readRun, readVenues, startRun } from './load.mjs';
import { readPage, stubReader } from './readers.mjs';
import { renderReport, summarise } from './report.mjs';
import { modelReader, structuredReader } from './sources/theatre-site.mjs';

// Structured data first, a model if the run allows it, then the stub.
export const READERS = [structuredReader, modelReader, stubReader];

// Venues grouped by what's-on URL: each URL is fetched once, however many
// venues share it. Venues with no usable link are returned separately.
export function groupBySite(venues) {
  const groups = new Map();
  const skipped = [];
  for (const venue of venues) {
    const key = venue.whats_on_url ? siteKey(venue.whats_on_url) : null;
    if (!key) { skipped.push(venue); continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(venue);
  }
  return { sites: [...groups].map(([url, list]) => ({ url, venues: list })), skipped };
}

// Crawls every site in turn. `load` is called once per site that was read (one
// transaction each); a site that fails, blocks us or can't be stored is
// recorded and the run carries on.
export async function crawlSites({ sites, fetchPage, load, readerList = READERS, run, spend = { usd: 0 }, readerContext = {}, log = () => {} }) {
  const results = [];
  for (const site of sites) {
    const result = { url: site.url, venues: site.venues, status: 'failed', findings: 0, methods: [] };
    results.push(result);
    try {
      const page = await fetchPage(site.url);
      result.status = page.status;
      result.error = page.error;
      if (page.status !== 'ok') { log(`${site.url}: ${page.status}${page.error ? ` (${page.error})` : ''}`); continue; }
      const notes = [];
      const findings = await readPage({ url: site.url, html: page.html }, { venues: site.venues, run, spend, notes, ...readerContext }, readerList);
      if (notes.length) result.note = notes.join('; ');
      result.methods = [...new Set(findings.map(f => f.method))];
      if (load) await load(site.url, findings);
      result.findings = findings.length;
      log(`${site.url}: ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
    } catch {
      result.status = 'failed';
      result.error = 'Could not read or store this site';
      log(`${site.url}: failed`);
    }
  }
  return results;
}

async function readCache(path) {
  if (!path) return {};
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    'run-id': { type: 'string' }, venues: { type: 'string' }, 'dry-run': { type: 'boolean' },
    cache: { type: 'string' }, 'delay-ms': { type: 'string' }, help: { type: 'boolean' },
    method: { type: 'string' }, model: { type: 'string' }, budget: { type: 'string' }, 'prompt-file': { type: 'string' },
  } });
  if (values.help || (!values['run-id'] && !values.venues)) {
    console.log('Usage: node supabase/scripts/crawl/index.mjs (--run-id <uuid> | --venues <id,id,...>) [--dry-run] [--cache file.json] [--delay-ms 2000]\n  [--method rules|rules_model] [--model claude-haiku-5-5] [--budget <usd>] [--prompt-file file.md]  (a model needs ANTHROPIC_API_KEY and a budget)\nRequires psql. SUPABASE_DB_URL defaults to local Supabase on port 54322. See supabase/README.md.');
    return;
  }
  const dryRun = Boolean(values['dry-run']);
  let run = values['run-id'] ? await readRun(values['run-id']) : null;
  if (values['run-id'] && !run) throw new Error('No such crawl run');
  const venueIds = run ? run.venue_ids : values.venues.split(',').map(s => s.trim()).filter(Boolean);
  const venues = await readVenues(venueIds);
  const { sites, skipped } = groupBySite(venues);
  if (!run) {
    const method = values.method ?? 'rules';
    if (!['rules', 'rules_model'].includes(method)) throw new Error('--method is rules or rules_model');
    const settings = {
      venueIds, method, model: values.model, budgetUsd: Number(values.budget ?? 0),
      prompt: values['prompt-file'] ? await readFile(values['prompt-file'], 'utf8') : undefined,
      branch: process.env.GITHUB_REF_NAME, commitSha: process.env.GITHUB_SHA,
    };
    run = dryRun ? { method, model: values.model, prompt: settings.prompt, budget_usd: settings.budgetUsd } : await createRun(settings);
  } else if (!dryRun) {
    await startRun(run.id);
  }
  const cache = await readCache(values.cache);
  const spend = { usd: 0 };
  const fetchPage = createFetcher({ cache, minDelayMs: Number(values['delay-ms'] ?? 2000) });
  const results = await crawlSites({
    sites, fetchPage, run, spend, log: message => console.error(message),
    load: dryRun ? null : (url, findings) => loadSite(run.id, url, findings),
  });
  if (values.cache) await writeFile(values.cache, JSON.stringify(cache, null, 2));
  const allFailed = results.length > 0 && results.every(r => r.status !== 'ok' && r.status !== 'not_modified');
  if (!dryRun) await finishRun(run.id, { status: allFailed ? 'failed' : 'done', summary: summarise(results, skipped), costUsd: spend.usd });
  const report = renderReport({ run: { ...run, skipped_venues: skipped }, sites: results, dryRun, costUsd: spend.usd });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
