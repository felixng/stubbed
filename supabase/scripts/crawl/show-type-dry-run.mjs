#!/usr/bin/env node
// Rolled-back dry run of show-type suggestions (#450). In one transaction that always ends in
// ROLLBACK, it applies the suggestion migration if it is missing, re-runs the source's identity
// publication (publication switched on for the transaction only), loads the benchmark answers,
// runs publication again and reports what would change. Nothing is kept.
//
//   node supabase/scripts/crawl/show-type-dry-run.mjs <migration.sql> <answers.json> [source]
import { appendFile, readFile } from 'node:fs/promises';
import { runPsql } from './db.mjs';
import { jsonLiteral } from './load.mjs';

const [migrationPath, answersPath, source = 'london_theatre'] = process.argv.slice(2);
if (!migrationPath || !answersPath || !/^[a-z][a-z0-9_]{0,63}$/.test(source)) {
  console.log('Usage: node supabase/scripts/crawl/show-type-dry-run.mjs <migration.sql> <answers.json> [source]');
  process.exit(1);
}
const key = `${jsonLiteral(source)} #>> '{}'`;
const printOnly = process.env.SHOW_TYPE_DRY_RUN_PRINT === '1';
const [applied] = printOnly ? [process.env.SHOW_TYPE_DRY_RUN_APPLIED === '1'] : await runPsql(`select to_jsonb(to_regclass('public.crawl_show_type_suggestions') is not null)`);
const migration = applied ? '' : await readFile(migrationPath, 'utf8');
const { answers } = JSON.parse(await readFile(answersPath, 'utf8'));

const publishAll = `do $$ declare r jsonb; i int := 0; begin
  loop r := public.publish_crawl_identities(${key}, 100); i := i + 1;
    exit when coalesce((r->>'processed')::int, 0) + coalesce((r->>'deferred')::int, 0)
      + coalesce((r->>'failed')::int, 0) = 0 or i > 60;
  end loop; end $$;`;
const requeue = `update public.crawl_publication_queue q set identity_processed_at = null,
    identity_available_at = now() - interval '1 minute', identity_error = null
  from public.crawl_extractions e join public.crawl_tasks t on t.id = e.task_id
  join public.crawl_sources s on s.id = t.source_id
  where q.extraction_id = e.id and s.source_key = ${key};`;
const reasons = `(select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
    select coalesce(m.resolution_reason, m.resolution_status) k, count(*) n from public.crawl_source_entities m
    join public.crawl_sources s on s.id = m.source_id where s.source_key = ${key} and m.entity_kind = 'event' group by 1) x)`;

const sql = `begin;
set local lock_timeout = '5s';
set local statement_timeout = '900s';
${migration}
update public.crawl_sources set publication_enabled = true where source_key = ${key};
${requeue}
${publishAll}
create temp table _before on commit drop as select ${reasons} as reasons,
  (select count(*) from public.shows) as shows;
insert into public.crawl_show_type_suggestions (source_key, title_key, venue_id, title, venue_name, first_date,
  last_date, verdict, suggested_type, confidence, provenance, prompt_version, usage)
select ${key}, a.title_key, a.venue_id, a.title, a.venue_name, a.first_date, a.last_date, a.verdict,
  a.suggested_type, a.confidence, a.provenance, a.prompt_version, coalesce(a.usage, '{}'::jsonb)
from jsonb_to_recordset(${jsonLiteral(answers)}) a(title_key text, venue_id uuid, title text, venue_name text,
  first_date date, last_date date, verdict text, suggested_type public.show_type, confidence numeric,
  provenance text, prompt_version integer, usage jsonb)
where exists (select 1 from public.venues v where v.id = a.venue_id)
order by a.provenance, a.title_key;
${requeue}
${publishAll}
select jsonb_build_object(
  'source', ${key},
  'migration_applied_in_transaction', ${applied ? 'false' : 'true'},
  'answers_loaded', (select count(*) from public.crawl_show_type_suggestions where source_key = ${key}),
  'before', (select reasons from _before),
  'after', ${reasons},
  'held_before', coalesce(((select reasons from _before)->>'unknown_show_type')::int, 0),
  'held_after', coalesce((${reasons}->>'unknown_show_type')::int, 0),
  'new_shows_from_suggestions', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (
    select sh.type::text type, count(*) n from public.show_candidates c join public.shows sh on sh.id = c.show_id
    where c.type_suggestion_id is not null group by 1) x),
  'events_linked_to_suggested_shows', (select count(*) from public.crawl_source_entities m
    join public.show_candidates c on c.show_id = m.show_id and c.type_suggestion_id is not null
    join public.crawl_sources s on s.id = m.source_id where s.source_key = ${key} and m.resolution_status = 'linked'),
  'by_provenance', (select coalesce(jsonb_object_agg(provenance, n), '{}'::jsonb) from (
    select s.provenance, count(*) n from public.show_candidates c
    join public.crawl_show_type_suggestions s on s.id = c.type_suggestion_id where c.show_id is not null group by 1) x),
  'shows_added', (select count(*) from public.shows) - (select shows from _before)
);
rollback;`;

if (printOnly) { console.log(sql); process.exit(0); }
const rows = await runPsql(sql, { timeout: 1_000_000 });
const report = rows.at(-1);
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Show-type dry run (rolled back) · ${source}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
}
