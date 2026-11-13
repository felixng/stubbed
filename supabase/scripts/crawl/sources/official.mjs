import { structuredReader } from './theatre-site.mjs';

// Official theatre sites are read through the legacy loop until they move to the page queue (#536 C1 to C5).
// This adapter is the structured reader the frontier uses for one site's what's-on page.
export const official = {
  key: 'official', displayName: 'Official theatre sites', kind: 'official',
  hosts: [], minIntervalMs: 2000, authority: 3, scheduled: false,
  version: 'official-structured-v1',
  parsers: {
    venue({ url, html }) {
      const observations = structuredReader({ url, html }, { venues: [] });
      if (!observations) return { status: 'invalid', reason: 'No recognised structured events' };
      return { children: [], observations: observations.map(finding => ({ ...finding, observation_kind: 'official_finding' })) };
    },
  },
};
