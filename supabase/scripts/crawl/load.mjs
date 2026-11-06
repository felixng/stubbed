// Writes to the crawl tables (service role, through psql). One transaction per
// theatre site, so a failure loses that site only. Stores facts and a short
// evidence snippet, never a copy of the page.
import { randomBytes } from 'node:crypto';
import { runPsql } from './db.mjs';

// JSON as a dollar-quoted literal whose tag can't appear in the payload.
export function jsonLiteral(value) {
  const text = JSON.stringify(value);
  let tag;
  do { tag = `j${randomBytes(4).toString('hex')}`; } while (text.includes(`$${tag}$`));
  return `$${tag}$${text}$${tag}$::jsonb`;
}

// A uuid inlined as a literal, after checking it is one.
export function uuidLiteral(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) throw new Error('Not a uuid');
  return `'${id}'::uuid`;
}

const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

export function cleanFinding(f, url) {
  return {
    venue_id: f.venue_id ?? null,
    source_url: clip(f.source_url ?? url, 500),
    raw_title: clip(f.raw_title, 300) || '(no title)',
    stage_text: clip(f.stage_text, 200),
    start_date: f.start_date ?? null,
    end_date: f.end_date ?? null,
    date_text: clip(f.date_text, 200),
    kind: ['show', 'talk', 'concert', 'other'].includes(f.kind) ? f.kind : 'other',
    method: ['stub', 'structured', 'model', 'rules'].includes(f.method) ? f.method : 'stub',
    confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0)),
    evidence: clip(f.evidence, 400),
    page_checked: f.page_checked === true, rule_id: f.rule_id ?? null, fetched_url: url,
  };
}

export function insertFindingsSql(runId, findings) {
  return `begin;
insert into public.crawl_findings
  (run_id, venue_id, source_url, raw_title, stage_text, start_date, end_date, date_text, kind, method, confidence, evidence, page_checked, rule_id, fetched_url)
select ${uuidLiteral(runId)}, f.venue_id, f.source_url, f.raw_title, f.stage_text,
       f.start_date, f.end_date, f.date_text, f.kind, f.method, f.confidence, f.evidence, f.page_checked, f.rule_id, f.fetched_url
from jsonb_to_recordset(${jsonLiteral(findings)}) as f(venue_id uuid, source_url text, raw_title text, stage_text text,
  start_date date, end_date date, date_text text, kind text, method text, confidence numeric, evidence text, page_checked boolean, rule_id uuid, fetched_url text);
select jsonb_build_object('inserted', count(*)) from public.crawl_findings where run_id = ${uuidLiteral(runId)};
commit;`;
}

export async function loadSite(runId, url, findings, db = runPsql) {
  const rows = findings.map(f => cleanFinding(f, url));
  if (rows.length === 0) return { inserted: 0 };
  const [{ inserted }] = (await db(insertFindingsSql(runId, rows))).slice(-1);
  return { inserted };
}

export async function readVenues(ids, db = runPsql) {
  const [venues] = await db(`select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'whats_on_url', v.whats_on_url) order by v.name), '[]'::jsonb)
    from public.venues v where v.id = any (array(select jsonb_array_elements_text(${jsonLiteral(ids)}))::uuid[])`);
  return venues;
}

export async function readRun(runId, db = runPsql) {
  const [run] = await db(`select coalesce(to_jsonb(r), 'null'::jsonb) from public.crawl_runs r where r.id = ${uuidLiteral(runId)}`);
  return run;
}

export async function createRun({ venueIds, method, model, prompt, branch, commitSha, budgetUsd, pipeline = 'legacy' }, db = runPsql) {
  const [run] = await db(`insert into public.crawl_runs (status, venue_ids, method, model, prompt, branch, commit_sha, budget_usd, started_at, pipeline)
    select 'running', array(select jsonb_array_elements_text(j->'venue_ids'))::uuid[], j->>'method', j->>'model', j->>'prompt',
           j->>'branch', j->>'commit_sha', coalesce((j->>'budget_usd')::numeric, 0), now(), j->>'pipeline'
    from (select ${jsonLiteral({ pipeline, venue_ids: venueIds, method, model: model ?? null, prompt: prompt ?? null, branch: branch ?? null, commit_sha: commitSha ?? null, budget_usd: budgetUsd ?? 0 })} as j) x
    returning to_jsonb(crawl_runs)`);
  return run;
}

export async function finishRun(runId, { status, summary, costUsd = 0 }, db = runPsql) {
  await db(`update public.crawl_runs set status = j->>'status', summary = j->'summary', cost_usd = (j->>'cost')::numeric,
      started_at = coalesce(started_at, now()), finished_at = case when j->>'status' = 'running' then null else now() end
    from (select ${jsonLiteral({ status, summary, cost: costUsd })} as j) x
    where id = ${uuidLiteral(runId)}`);
}

export async function startRun(runId, db = runPsql) {
  await db(`update public.crawl_runs set status = 'running', started_at = now(), branch = coalesce(j->>'branch', branch), commit_sha = coalesce(j->>'sha', commit_sha), log_url = j->>'log_url'
    from (select ${jsonLiteral({ branch: process.env.GITHUB_REF_NAME ?? null, sha: process.env.GITHUB_SHA ?? null, log_url: process.env.GITHUB_RUN_ID ? `https://github.com/felixng/stubbed/actions/runs/${process.env.GITHUB_RUN_ID}` : null })} as j) x where id = ${uuidLiteral(runId)}`);
}
