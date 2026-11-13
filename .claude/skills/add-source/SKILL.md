---
name: add-source
description: Add a new catalogue crawl source (a theatre listings site) to Stubbed. Use when the owner names a site to crawl or asks to add a source.
---

# Add a crawl source

AI is used here, when a source is onboarded, and never while the crawler runs. You judge the site, write the adapter and fixtures, and prove them with code. Work through the steps without asking the owner unless a step says to stop. The routine crawl stays deterministic.

## 1. Check it is wanted and allowed

Read the site's terms page if it is linked from the footer. If it forbids automated access, stop and tell the owner. Read `docs/CATALOGUE.md`, "Adding a source".

## 2. Probe

Pick the seed: the theatres or venues listing if there is one, else the what's-on listing. Then run, from the repo root:

```
node supabase/scripts/crawl/probe.mjs --url <seed URL> --key <source_key> [--max-pages 12]
```

`<source_key>` is lower-case with underscores (`^[a-z][a-z0-9_]{0,63}$`). The probe uses no model: it fetches up to 12 pages politely (robots.txt, 5 s gap), groups links by shape (`/venue/*`), and writes `supabase/scripts/crawl/.probe/<key>/report.json` plus the saved pages. Never run it twice within ten minutes for the same host. Never commit `.probe/`. If it says the seed is disallowed, stop and tell the owner.

## 3. Judge the fit

Read the saved pages, not only the report's hints (`fit`, `venue_candidate`, `event_candidate`).

- **Fits** when: there is a page per venue that states an address or postcode; there is a page per show or production with a title and at least one date, or a venue page that lists shows with dates; a show page names or links its venue; pages are server-rendered (the facts are in the saved HTML, not loaded by script).
- **Fits without a directory** when venue pages exist but no list of them: seed from the what's-on listing as a `directory` stage whose children are `event` pages, as Playbill's `london-listing` seed does.
- **Does not fit** when: there are no venue pages (`no_venue_pages`), facts only appear after scripts run, a login or paywall is needed, robots.txt disallows the pages, or dates are only free prose. Then do not force it. File an issue titled "Add <site> as a crawl source", label `needs-decision`, with the probe table and the reason in the body, attach it to epic #314, and stop.

## 4. Write the adapter

Write `supabase/scripts/crawl/sources/<key-with-hyphens>.mjs`, modelled on `sources/playbill.mjs`. Static fields: `key`, `displayName`, `kind: 'aggregate'`, `hosts`, `minIntervalMs: 5000`, `authority: 2` (unless the owner says otherwise), `scheduled: true`, `fixtures: '<key-with-hyphens>'`, `fixtureUrls` (one URL per stage), `version: '<key-with-hyphens>-v1'`, `seeds`, and pure `parsers` for `directory`, `venue` and `event`.

Rules:
- Never guess a date. Keep `date_text` and leave `date` out when the page does not give an exact one.
- Emit an already-clean `raw_title` and keep the source's own spelling in `aliases`. Do not add source-specific branches to SQL.
- Every observation carries short `evidence`.
- No model calls, no network calls inside parsers.

## 5. Fixtures

Hand-reduce one saved page per stage to `supabase/scripts/crawl/fixtures/<key-with-hyphens>/<stage>.html` (`directory`, `venue`, `event`), under 5 KB each, keeping only the elements the parser reads. Facts and short evidence only; never whole copies of pages.

## 6. Register

Add one import and one entry to `supabase/scripts/crawl/sources/index.mjs`. No migration is needed: the worker copies the adapter's facts into `crawl_sources` on its next run, and the source arrives with Crawling and Publication off.

## 7. Prove

- `node --test supabase/scripts/crawl/*.test.mjs`. The contract test (`adapter-contract.test.mjs`) checks every registered adapter. Add parser unit tests for anything it does not cover.
- One dry run: `node supabase/scripts/crawl/loop.mjs --source <key> --dry-run --max-pages 15`. It works with no database row. Read the proposed extractions: at least one venue with an address, and one show with a title, a venue and a date. If they are missing, fix the parsers and repeat.

## 8. Pull request

Open a pull request with the adapter, fixtures, tests, a `docs/DECISIONS.md` entry and the dry-run summary. Say that both switches start off and that the owner turns on Crawling in Backstage → Catalogue crawler. Do not change any switch yourself.
