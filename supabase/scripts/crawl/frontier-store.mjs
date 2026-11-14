import { runPsql } from './db.mjs';
import { jsonLiteral, uuidLiteral } from './load.mjs';

const sqlText = value => '(' + jsonLiteral(value ?? null) + " #>> '{}')";
const bool = value => value ? 'true' : 'false';
const when = value => sqlText(value) + '::timestamptz';

export function createFrontierStore(db = (sql, timeout = 15_000) => runPsql(sql, { timeout })) {
  async function scalar(expression, timeout) {
    const [value] = await db(`select coalesce(to_jsonb(${expression}), 'null'::jsonb)`, timeout);
    return value;
  }

  return {
    // Copies each adapter file's static facts into crawl_sources; never touches a switch or a pause.
    async syncSources(list) {
      const call = adapter => `perform public.sync_crawl_source(${sqlText(adapter.key)}, ${sqlText(adapter.displayName)},
        ${sqlText(adapter.kind)}, (select coalesce(array_agg(h), '{}') from jsonb_array_elements_text(${jsonLiteral(adapter.hosts ?? [])}) h), ${Number(adapter.minIntervalMs)},
        ${Number(adapter.authority)}, ${sqlText(adapter.version)});`;
      await db(`do $sync$ begin ${list.map(call).join('\n')} end $sync$; select 'null'::jsonb`);
    },

    async source(key) {
      const [source] = await db(`select to_jsonb(s) from public.crawl_sources s where s.source_key = ${sqlText(key)}`);
      return source;
    },

    // A generation's official site, its active rules and its venues; null when there is no site.
    async officialContext(generationId, siteId = null) {
      const [row] = await db(`select jsonb_build_object(
          'site', jsonb_build_object('id', s.id, 'whats_on_url', s.whats_on_url, 'archive_url', s.archive_url),
          'rules', r.rules, 'rule_id', r.id,
          'venues', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'whats_on_url', v.whats_on_url) order by v.name)
            from public.venues v where v.crawl_site_id = s.id), '[]'::jsonb))
        from public.crawl_sites s
        left join public.crawl_rules r on r.site_id = s.id and r.status = 'active'
        where s.id = coalesce((select g.site_id from public.crawl_generations g where g.id = ${generationId ? uuidLiteral(generationId) : 'null'}),
          ${siteId ? uuidLiteral(siteId) : 'null'})`);
      return row ?? null;
    },

    // The observations of a task's newest extraction, or null.
    async latestObservations(taskId) {
      if (!taskId) return null;
      const [row] = await db(`select e.observations from public.crawl_extractions e
        where e.task_id = ${uuidLiteral(taskId)} order by e.extracted_at desc limit 1`);
      return row ?? null;
    },

    async officialSite(scope) {
      const [site] = await db(`select jsonb_build_object('id', id, 'url', whats_on_url) from public.crawl_sites
        where id = ${uuidLiteral(scope)}`);
      return site;
    },

    async prepare(source, seed, refresh) {
      return scalar(`public.start_crawl_generation(${sqlText(source)}, ${sqlText(seed.scope)}, ${sqlText(seed.stage)},
        ${sqlText(seed.url)}, ${seed.site ? uuidLiteral(seed.site) : 'null'}, ${bool(refresh)})`);
    },

    async reparse(source, scope) {
      return scalar(`public.reparse_crawl_scope(${sqlText(source)}, ${sqlText(scope)})`);
    },

    async claim(source, stage, scope, owner, expectedParser) {
      return scalar(`public.claim_due_crawl_task(${sqlText(source)}, ${sqlText(stage)}, ${sqlText(scope)}, ${sqlText(owner)}, ${sqlText(expectedParser)})`);
    },

    async renew(task) {
      return scalar(`public.renew_crawl_task(${uuidLiteral(task.id)}, ${uuidLiteral(task.lease_token)})`);
    },

    async acknowledge(task, version, result) {
      return scalar(`public.finish_crawl_fetch(${uuidLiteral(task.id)}, ${uuidLiteral(task.lease_token)}, ${sqlText(version)},
        ${sqlText(result.hash)}, ${jsonLiteral(result.children ?? [])}, ${jsonLiteral(result.observations ?? [])},
        ${sqlText(result.etag)}, ${sqlText(result.lastModified)}, ${bool(result.unchanged)})`);
    },

    async outcome(task, outcome, nextAt, reason, countFailure = false) {
      return scalar(`public.finish_crawl_attempt(${uuidLiteral(task.id)}, ${uuidLiteral(task.lease_token)},
        ${sqlText(outcome)}, ${when(nextAt)}, ${sqlText(reason)}, ${bool(countFailure)})`);
    },

    async reserve(task, host, gapMs) {
      return scalar(`public.reserve_crawl_request(${uuidLiteral(task.id)}, ${uuidLiteral(task.lease_token)},
        ${sqlText(host)}, ${Math.min(2_147_483_647, Math.ceil(gapMs))})`);
    },

    async reserveOfficial(run, host, gapMs) {
      return scalar(`public.reserve_official_crawl_request(${uuidLiteral(run)}, ${sqlText(host)}, ${Math.min(2_147_483_647, Math.ceil(gapMs))})`);
    },

    async release(host, token, cooldown) {
      return scalar(`public.release_crawl_request(${sqlText(host)}, ${uuidLiteral(token)}, ${when(cooldown)})`);
    },

    async preview(source, stage, scope, limit) {
      return db(`select jsonb_build_object('stage', t.stage, 'url', t.canonical_url)
        from public.crawl_tasks t join public.crawl_generations g on g.id = t.generation_id
        join public.crawl_sources s on s.id = t.source_id
        where s.source_key = ${sqlText(source)} and g.is_current and g.paused_reason is null
          and (${sqlText(scope)} is null or g.scope_key = ${sqlText(scope)})
          and (${sqlText(stage)} = 'all' or t.stage = ${sqlText(stage)})
          and (t.status in ('pending', 'retry_wait') and t.available_at <= now()
            or t.status = 'leased' and t.lease_expires_at <= now())
        order by t.priority desc, t.available_at, t.id limit ${limit}`);
    },

    async publishIdentities(source, limit) {
      return scalar(`public.publish_crawl_identities(${sqlText(source)}, ${limit})`, 120_000);
    },

    async publishRuns(source, limit) {
      return scalar(`public.publish_crawl_run_evidence(${sqlText(source)}, ${limit})`, 120_000);
    },

    async progress(source, scan, stage, status, offset = 0) {
      return scalar(`public.crawl_source_progress(${sqlText(source)}, ${scan ? uuidLiteral(scan) : 'null'},
        ${sqlText(stage)}, ${sqlText(status)}, 25, ${offset})`);
    },

    async hostState(host) {
      const [row] = await db(`select to_jsonb(h) from public.crawl_hosts h where h.host = ${sqlText(host)}`);
      return row;
    },
  };
}
