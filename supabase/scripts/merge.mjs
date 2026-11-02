#!/usr/bin/env node
// Node 24+, no packages. Admin tool for merging duplicate shows and venues (#274).
//
//   node supabase/scripts/merge.mjs                              list likely duplicates
//   node supabase/scripts/merge.mjs --shows FROM INTO [--force]  merge one pair of shows
//   node supabase/scripts/merge.mjs --venues FROM INTO           merge one pair of venues
//
// A merge is a dry run (rolled back, counts printed) unless --apply is given.
// SUPABASE_DB_URL as for sync-wikidata.mjs. Needs the service role's rights
// (the postgres user in the connection string has them).
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runPsql } from './sync-wikidata.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shows that tidy to the same title; venues that similar_venues() calls close.
// Venues without coordinates match only within the same canonical city.
// Read only, one jsonb line per result (parsePsqlOutput reads lines).
export const CANDIDATES_SQL = `begin transaction read only;
select coalesce(jsonb_agg(g order by g->>'title'), '[]'::jsonb) from (
  select jsonb_build_object('title', min(s.title), 'shows', jsonb_agg(jsonb_build_object(
    'id', s.id, 'title', s.title, 'type', s.type, 'wikidata_id', s.wikidata_id,
    'entries', (select count(*) from public.entries e where e.show_id = s.id)) order by s.wikidata_id nulls last, s.created_at)) as g
  from public.shows s
  group by public.normalise_show_title(s.title)
  having count(*) > 1
) shows;
select coalesce(jsonb_agg(p order by p->'from'->>'name'), '[]'::jsonb) from (
  select jsonb_build_object(
    'from', jsonb_build_object('id', a.id, 'name', a.name, 'city', a.city, 'osm_id', a.osm_id,
      'entries', (select count(*) from public.entries e where e.venue_id = a.id)),
    'into', jsonb_build_object('id', b.id, 'name', b.name, 'city', b.city, 'osm_id', b.osm_id,
      'entries', (select count(*) from public.entries e where e.venue_id = b.id))) as p
  from public.venues a
  cross join lateral public.similar_venues(a.name, a.lat, a.lng, a.city) m
  join public.venues b on b.id = m.id
  where a.id <> b.id and m.same
    -- Report each pair once, suggesting the OpenStreetMap one as the survivor.
    and ((a.osm_id is null and b.osm_id is not null) or (a.osm_id is null = (b.osm_id is null) and a.id < b.id))
) venues;
rollback;`;

export function mergeSql({ kind, from, into, force = false, apply = false }) {
  if (!UUID.test(from) || !UUID.test(into)) throw new Error('FROM and INTO must be UUIDs');
  const call = kind === 'shows'
    ? `public.merge_shows('${from}', '${into}', ${force ? 'true' : 'false'})`
    : `public.merge_venues('${from}', '${into}')`;
  return `begin;\nselect ${call};\n${apply ? 'commit' : 'rollback'};`;
}

export function parseCli(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    shows: { type: 'boolean' }, venues: { type: 'boolean' }, force: { type: 'boolean' },
    apply: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.shows && values.venues) throw new Error('Choose --shows or --venues, not both');
  if (values.force && !values.shows) throw new Error('--force only applies to --shows');
  const merging = values.shows || values.venues;
  if (merging && positionals.length !== 2) throw new Error('Give exactly two ids: FROM INTO');
  if (!merging && (positionals.length || values.apply || values.force)) throw new Error('Unexpected arguments; see --help');
  return { ...values, ids: positionals };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseCli(args);
  if (options.help) {
    console.log('Usage: node supabase/scripts/merge.mjs [--shows|--venues FROM INTO [--force] [--apply]]\nWithout --shows/--venues, lists likely duplicates. Merges are dry runs unless --apply.\nRequires psql. SUPABASE_DB_URL defaults to local Supabase on port 54322.');
    return;
  }
  if (!options.shows && !options.venues) {
    const [shows, venues] = await runPsql(CANDIDATES_SQL);
    console.log(JSON.stringify({ shows, venues }, null, 2));
    return;
  }
  const [from, into] = options.ids;
  const [counts] = await runPsql(mergeSql({
    kind: options.shows ? 'shows' : 'venues', from, into, force: options.force, apply: options.apply,
  }));
  console.log(JSON.stringify({ applied: Boolean(options.apply), ...counts }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
