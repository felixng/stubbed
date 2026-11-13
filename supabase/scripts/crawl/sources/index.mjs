// The one list of crawl sources. To add a source, write its adapter file and add one import and one
// entry here (docs/CATALOGUE.md, "Adding a source"). Explicit imports, no directory scanning.
import { londonTheatre } from './london-theatre.mjs';
import { official } from './official.mjs';
import { playbill } from './playbill.mjs';

const list = [londonTheatre, playbill, official];

export const adapters = Object.fromEntries(list.map(adapter => [adapter.key, adapter]));
export const scheduledSources = list.filter(adapter => adapter.scheduled).map(adapter => adapter.key);

// The seed scopes a scheduled run may be limited to, per aggregate source (for example playbill: london-listing).
export function adapterScopes(key) {
  return key === 'official' || !Object.hasOwn(adapters, key) ? [] : adapters[key].seeds.map(seed => seed.scope);
}
