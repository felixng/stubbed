import { cleanFinding } from '../load.mjs';
import { canonicalTaskUrl } from '../frontier-url.mjs';
import { readPage } from '../readers.mjs';
import { nextArchiveLink, normalText, readRules, rulesReader } from '../rules.mjs';
import { healthSignals } from '../state.mjs';
import { structuredReader } from './theatre-site.mjs';

// Official theatre sites are read through the page queue (#536 C1): each site is one generation whose
// what's-on page and archive pages are `venue`-stage tasks. The site's saved rules and venues are the
// per-task context. Never the model reader: AI sets a site up and repairs it elsewhere (C3).

// The hosts a site's pages may be on: the what's-on and archive hosts, each with and without www.
function siteHosts(...urls) {
  const hosts = new Set();
  for (const value of urls) {
    if (!value) continue;
    try {
      const host = new URL(value).hostname.toLowerCase();
      hosts.add(host);
      hosts.add(host.startsWith('www.') ? host.slice(4) : `www.${host}`);
    } catch { /* an unusable URL adds no host */ }
  }
  return [...hosts];
}

// What the site's previous extraction looked like, in the shape healthSignals expects. Null before the first one.
export function previousState(observations) {
  if (!Array.isArray(observations)) return null;
  const shows = observations.filter(row => row?.observation_kind === 'official_finding' && row.kind === 'show');
  return {
    result_count: shows.length,
    readable_share: shows.length ? shows.filter(row => row.start_date).length / shows.length : 0,
    titles: shows.map(row => normalText(row.raw_title)),
    type: observations.find(row => row?.page_type)?.page_type ?? null,
  };
}

async function contextFor(task, store, cached) {
  let base = cached;
  if (!base) {
    const row = await store.officialContext(task.generation_id ?? null, task.site_id ?? null);
    if (!row) throw new Error('Official task has no site');
    base = {
      siteId: row.site.id, whatsOnUrl: row.site.whats_on_url, archiveUrl: row.site.archive_url ?? null,
      rules: row.rules ?? null, ruleId: row.rule_id ?? null, venues: row.venues ?? [],
      allowedHosts: siteHosts(row.site.whats_on_url, row.site.archive_url),
    };
  }
  return { ...base, previous: previousState(await store.latestObservations(task.id ?? null)) };
}

export const official = {
  key: 'official', displayName: 'Official theatre sites', kind: 'official',
  hosts: [], minIntervalMs: 2000, authority: 3, scheduled: false,
  version: 'official-v2', seeds: [],
  contextFor,
  // A failed extraction asks for a repair instead of retrying (the setup lane repairs at most three times per failing version).
  onInvalid: ({ task, reason, store }) => store.flagOfficialRepair(task, reason),
  parsers: {
    async venue({ url, html, context }) {
      const notes = [];
      const findings = await readPage({ url, html },
        { venues: context.venues, rules: context.rules, ruleId: context.ruleId, notes }, [rulesReader, structuredReader]);
      const { signals } = healthSignals(context.previous, findings);
      if (context.rules && !findings.length) signals.push('no_findings');
      if (notes.some(note => note.includes('failed the page check'))) signals.push('page_check_failed');
      // The same page with the same rules gives the same result: fail at once, without the retry ladder.
      if (signals.length) return { status: 'invalid', reason: 'extraction: ' + signals.join(', '), retry: false };

      const canonical = value => canonicalTaskUrl(value, { allowedHosts: context.allowedHosts });
      const pageType = canonical(url) === canonical(context.whatsOnUrl) ? 'whats_on' : 'archive';
      const children = [];
      if (pageType === 'archive') {
        const next = (context.rules ? readRules({ url, html }, { rules: context.rules, venues: context.venues }).next : null) ?? nextArchiveLink(html, url);
        if (next) children.push({ stage: 'venue', url: next });
      }
      return {
        children,
        observations: findings.map(finding => ({ observation_kind: 'official_finding', page_type: pageType, ...cleanFinding(finding, url) })),
      };
    },
  },
};
