// A Markdown summary of one crawl run, for the terminal and the Actions page.
const SITE_LABEL = { ok: 'read', not_modified: 'unchanged', blocked: 'blocked', failed: 'failed' };

export function renderReport({ run, sites, dryRun = false }) {
  const lines = [];
  const read = sites.filter(s => s.status === 'ok').length;
  lines.push(`# Crawl ${dryRun ? '(dry run) ' : ''}${run?.id ? `run ${run.id}` : 'run'}`, '');
  lines.push(`${sites.length} site${sites.length === 1 ? '' : 's'}: ${read} read, ${sites.length - read} not read. ` +
    `${sites.reduce((n, s) => n + (s.findings ?? 0), 0)} finding${sites.reduce((n, s) => n + (s.findings ?? 0), 0) === 1 ? '' : 's'}.` +
    (run?.method ? ` Method: ${run.method}.` : ''), '');
  lines.push('| Site | Theatres | Result | Findings | How read |', '|---|---|---|---|---|');
  for (const s of sites) {
    lines.push(`| ${s.url} | ${s.venues.map(v => v.name).join(', ')} | ${SITE_LABEL[s.status] ?? s.status}${s.error ? ` (${s.error})` : ''} | ${s.findings ?? 0} | ${s.methods?.join(', ') || '-'} |`);
  }
  if (run?.skipped_venues?.length) {
    lines.push('', `Skipped (no what's-on link): ${run.skipped_venues.map(v => v.name).join(', ')}.`);
  }
  return `${lines.join('\n')}\n`;
}

// What is kept on crawl_runs.summary.
export function summarise(sites, skippedVenues = []) {
  return {
    sites: sites.map(s => ({ url: s.url, venues: s.venues.map(v => v.id), status: s.status, error: s.error ?? null, findings: s.findings ?? 0, methods: s.methods ?? [] })),
    findings: sites.reduce((n, s) => n + (s.findings ?? 0), 0),
    skipped_venues: skippedVenues.map(v => v.id),
  };
}
