import { runPsql } from './db.mjs';
import { jsonLiteral, uuidLiteral } from './load.mjs';

const sqlText = value => '(' + jsonLiteral(value ?? null) + " #>> '{}')";
const bool = value => value ? 'true' : 'false';
const when = value => sqlText(value) + '::timestamptz';

export function createFrontierStore(db = sql => runPsql(sql, { timeout: 15_000 })) {
  async function scalar(expression) {
    const [value] = await db(`select coalesce(to_jsonb(${expression}), 'null'::jsonb)`);
    return value;
  }

  return {
    async source(key) {
      const [source] = await db(`select to_jsonb(s) from public.crawl_sources s where s.source_key = ${sqlText(key)}`);
      return source;
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

    async claim(source, stage, scope, owner) {
      return scalar(`public.claim_crawl_task(${sqlText(source)}, ${sqlText(stage)}, ${sqlText(scope)}, ${sqlText(owner)})`);
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
      return scalar(`public.publish_crawl_identities(${sqlText(source)}, ${limit})`);
    },

    async hostState(host) {
      const [row] = await db(`select to_jsonb(h) from public.crawl_hosts h where h.host = ${sqlText(host)}`);
      return row;
    },
  };
}
