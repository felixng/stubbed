# Catalogue rollout: validation report and runbook (#428, epic #419)

Status as of 2026-11-08. Measured results only; nothing here is a claim about production accuracy.

## Flag state (hosted)

| Switch | State | Where |
|---|---|---|
| `CRAWL_LOOP_ENABLED` | `true` (since 2026-11-08) | GitHub repo variable. Gates scheduled and source/stage dispatches. |
| London Theatre `collection_enabled` | on (since 2026-11-08) | `crawl_sources` |
| Playbill `collection_enabled` | off | `crawl_sources` |
| All sources `publication_enabled` | off | `crawl_sources` |
| `catalogue_run_chips_enabled` | off | `catalogue_consumer_flags` |
| `catalogue_run_autofill_enabled` | off | `catalogue_consumer_flags`; no client autofills |

The official-site crawler's `collection_enabled` stays as before. With everything above off, logging is exactly the manual route plus the #360 community/yours chips.

## Results

**Fixture benchmark** (`supabase/tests/run_chips_benchmark_test.sql`, runs in CI): 120 constructed cases (20 historical, 40 current or future, 60 ambiguous: unknown end, conflicting closings or two shows; the test enforces at least 10 off-West-End). Labels come from how each case is built. Answerable cases return the expected show in the top 3 (100% on fixtures, gate 95%); unknown-end, conflicting-fact and past-booking-horizon cases make no claim. This tests SQL behaviour, not real data.

**Autofill gate: NOT met, so it stays off.** The required 100 independently labelled eligible decisions do not exist, and no live evidence has been published or labelled. Chips are the finished feature once their flag is enabled; autofill is withheld.

**Latency** (local, 100,000 evidence rows / 50,000 runs / 5,000 venues, 200 calls to `suggest_shows_v2`): p95 435 ms before, **4.5 ms after** `20261108130000_effective_runs_pushdown.sql` (p50 3.0 ms). Target p95 <= 200 ms: met. Search is untouched by these changes; a before/after search benchmark was not run.

**Live London Theatre probe** (publication off, no AI, three bounded Actions runs): directory 6/6 pages, 53 venues discovered, 52 processed; about 981 event links discovered, 225 processed, 744 queued, 11 retrying. Failures found and handled: a 40 s whole-fetch budget expired while queueing for the host slot on pages that redirect once (fixed, #441); some show URLs loop between `/show/X` and `/show/X-tickets` on the source and are reported as failed after the redirect limit (no workaround). JSON-LD `endDate` on long runs is a booking horizon, not a confirmed closing. The probe shows reachability and parseability only.

**Playbill live probe: not run.** London delivery does not depend on it; Playbill acceptance remains open.

**Interruption safety:** claim/acknowledge, lease expiry, stale workers, duplicate publication, pagination and parser changes, restart without local state and budget exhaustion are covered by the integration tests added in #420 to #427 (`supabase/scripts/crawl/*-integration.test.mjs`, pgTAP). No new checkpoint replay matrix was written for this issue.

**Cost:** no model calls were made in the probes (London Theatre and Playbill never use a model). No paid services were used.

## Update 2026-11-08 (#444, PR #445 merged)

Merged: diagnosable publication failures, worker-only free geocoding, new venue and type rules (see `docs/DECISIONS.md`, "#444"), Matilda horizon tests. Local fixture run: the London fixture publishes end to end (geocoded venue links to the existing OSM venue, shows publish); all pgTAP, crawler unit and integration tests pass. **Not yet applied to hosted Supabase and not yet run live**: the session had no `HOSTED_DB_URL`, so migration `20261108150000_london_identity_rules.sql` is pending and every flag is still as in the table above. TestFlight: `apps/ios/scripts/dev archive` stopped before building because `ASC_KEY_PATH` in `~/.config/stubbed/app-store-connect.env` points at a `.p8` that does not exist (the file on disk has a different key ID); no build was uploaded.

## Update 2026-11-08 (later): hosted live run and publication rules

- Migration `20261108150000` is applied on hosted; the 53 London geocodes are cached and backfilled. The
  duplicate "Judi Dench Theatre" venue was merged into the Shaftesbury Theatre (OSM `way/81459092`) and both
  London source entities locked to it (#447).
- Collection: 16 bounded Actions runs. Venues 56 done (1 page 404s); events 979 done, about 80 newly
  discovered and left for the daily schedule, 26 in redirect loops on the source.
- Publication dry run (publication switched on and every London extraction processed inside one transaction
  that is always rolled back; nothing written). With the #445 rules it would have created 333 shows, 316 of
  them `other`. With the rules in `20261108200100` (see `docs/DECISIONS.md`, "#444 London type and title
  rules"): 77 new shows (0 `other`, 21 concerts), 71 existing shows linked, 313 held as `unknown_show_type`,
  64 runs, 0 autofill-eligible.

## Not done (epic remains open)

- Apply `20261108200000` and `20261108200100` on hosted, re-check the dry run, then switch London
  publication on.
- Type the 313 held titles (model-assisted typing is a separate follow-up; #419 keeps London pages away from
  AI) or review them in Backstage.
- `docs/catalogue-benchmark/london-labelling.csv` and its scorer (needs published London data).
- Independent labelled live-data benchmark and the chips >= 95% gate on real evidence.
- Playbill live probe.
- Before/after search p95.
- iOS TestFlight build (the App Store Connect key path in `~/.config/stubbed/app-store-connect.env` is wrong).
- The product brief status update (Google Doc; owner or a session with the Docs connector).

## Runbook

Resume or start London (needs the `SUPABASE_DB_URL` secret; `ANTHROPIC_API_KEY` is not needed):

```sh
gh variable set CRAWL_LOOP_ENABLED --body true
# Backstage > Crawl > Sources, or SQL: update public.crawl_sources set collection_enabled = true where source_key = 'london_theatre';
gh workflow run catalogue-crawl.yml -f source=london_theatre -f stage=all
```

Repeating the dispatch resumes due tasks; it does not restart. Discovery only: `-f stage=directory`.

Stop everything: `gh variable delete CRAWL_LOOP_ENABLED`. Pause one source: Backstage > Crawl > Sources, or set `collection_enabled = false`. Stop publication only: `update public.crawl_sources set publication_enabled = false where source_key = '...'` (published facts stay). Withdraw a source's evidence: `select public.set_crawl_source_withdrawal('london_theatre', true)` (diary entries and other sources' facts are untouched).

Geocoding (postcodes.io, then Nominatim at 1100 ms gaps; cached in `crawl_geocodes`) happens in the worker during the venue stage; no key or secret. Reparse in place (re-geocodes from the cache): `node supabase/scripts/crawl/loop.mjs --source london_theatre --scope venue-directory --reparse --max-pages 25 --max-minutes 10`.

Publication and run chips are buttons on **Backstage > Crawl > Sources** (2026-11-10): Turn publication on/off per source, and Turn run chips on/off under Logging suggestions. Run chips (after publication is enabled and checked) can still be set by SQL as an admin session: `select public.admin_set_catalogue_flag('catalogue_run_chips_enabled', true);` Disable with `false`: the next suggestion call returns only community/yours chips. Autofill: leave `catalogue_run_autofill_enabled` false.

Spend: the official-site AI path is capped at $1 per run and $0.20 per site (`CRAWL_MAX_SPEND_USD`, `CRAWL_SITE_SPEND_USD`). London Theatre and Playbill use no model.
