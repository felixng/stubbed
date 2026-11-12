# Catalogue: shows, venues and runs

How the catalogue is built, and what the remaining catalogue epics add. Read this before picking up an issue in #147, #353, #363, #355, #289, #387, #391, #272 or #314. Product decisions stay in the issues and `docs/DECISIONS.md`; this file is the technical map. Where they disagree, the decisions log is newer.

## 1. Rules that apply to every issue

- **The catalogue is optional.** Every feature works with empty catalogue tables, for user-added shows, and for entries with no matching run. Tests must include the empty case.
- **Rules live in Postgres.** Matching, tidying, ranking and access are SQL functions that web and iOS both call, never logic copied into the two apps.
- **Typed-in shows and venues are visible to everyone.** Duplicates are prevented ("Did you mean…?", #146) and merged (#274), never hidden per user.
- **Venues are flat:** one row per auditorium (Olivier, Lyttelton and Dorfman are three venues). No parent or space column.
- **Suggestions, never auto-save:** a strong match may fill an *empty* field; nothing overwrites a field the user has touched.
- **Entries stay show + venue + date.** They store no run or production. A run is found by looking up those three, so older entries match new runs and deleting crawl data can't touch an entry. There is no `productions` table until a feature needs one; adding it then means the table plus a nullable `runs.production_id`.
- **The routine crawl never uses AI.** Code reads pages using saved rules. AI only finds links and writes or repairs rules, and new rules go live only after code has checked them.
- **Users never write catalogue facts** other than shows, venues and nicknames they add while logging. Runs, crawl data and show candidates are written by the service role or admin functions only.

## 2. As built

| Object | What it is | Since |
|---|---|---|
| `shows` | `title`, `type`, `verified`, `created_by`; catalogue rows have `wikidata_id` (unique), `first_performed`, `aliases text[]` (rewritten by the Wikidata sync, never user data). `search_text` is a stored generated column: normalised title and aliases joined with ` \| `, trigram-indexed. | #12, #145, #35 |
| `show_aliases` | Nicknames users teach: `show_id`, `alias`, stored `search_text`, `created_by`. Unique per show on `search_text`. Public read; signed-in insert; creators edit/delete their own. | #35 |
| `venue_aliases` | Other names for a venue: `venue_id`, `alias`, stored `search_text`, `kind` (`former`, `alternative`, `source_spelling`), optional `valid_from`/`valid_to`, `source`. Unique per venue on `search_text`. Public read; admin and service role write. Filled by `crawl_match_venue` (source spellings, Playbill former names), `merge_venues` (the merged name) and a backfill. `search_venues` and `crawl_match_venue` read them. | #447 |
| `venues` | `name`, `city`, `country`, `lat`, `lng`, `osm_id` (dedupe key for OpenStreetMap venues), `verified`, `created_by`; stored `search_text`, trigram-indexed. | #12, #35 |
| `venues` columns from #290 | `circuit` (`venue_circuit`), `website`, `wikidata_id` (unique), `source` (`user`, `osm`, `crawler`). Written only by the service role; `venues_lat_lng_idx` and `venues_search_key` support the nearby and similar lookups. | #290 |
| `load_osm_venues(rows jsonb)` | Service-role only. Attaches `osm_id` to same-named hand-added venues under 200 m away, inserts the rest (`source = 'osm'`), fills blanks, sets free `wikidata_id`s and circuits; returns `(inserted, filled, attached, west_end, broadway)`. A second call changes nothing. | #290 |
| `nearby_venues(lat, lng, radius_m)` | Saved venues within the radius, nearest first, with `distance_m`. Both apps call it before asking OpenStreetMap. | #343 |
| `normalise_show_title(t)` | Matching key for titles: accents stripped, lowercase, leading "the" and "(Broadway)"-style suffixes removed. | #145 |
| `normalise_search_text(t)` | Lowercase, no accents, no leading "the", anything not a letter or digit becomes one space. Used for every `search_text`. | #35 |
| `search_shows(q)` / `search_venues(q, near_lat, near_lng)` | Per-keystroke search. Tiers: 0 starts with, 1 a word starts with, 2 fuzzy, 3 mid-word (last). Shows read titles, Wikidata aliases and `show_aliases`, one row per show. Venues boost under 2 km / 50 km. | #12, #35 |
| `remember_show_alias(show_id, alias)` | Saves a search as a nickname unless `search_shows` already finds the show in its top 3. | #35 |
| `tidy_show_title(t)` + insert trigger | Display tidy: drops "(Broadway)", "- UK Tour", ": The Musical" and ticket parts; all-caps titles of 5+ characters go to normal case. Applied on insert to every show without `wikidata_id`. | #146 |
| `similar_shows(q)` / `similar_venues(q, near_lat, near_lng, in_city)` | Up to 3 close matches before adding; `same = true` means it is the same row and saving reuses it (shows: equal normalised title or nickname; venues: equal name, ignoring spaces, apostrophes and theatre/theater, and under 2 km or the same city). | #146 |
| `merge_into_catalogue()` | Service-role only. Folds typed-in shows into the Wikidata row with the same normalised title and type; moves entries and nicknames. | #145, #35 |
| `supabase/scripts/sync-wikidata.mjs` | The pattern for every admin script (section 5). | #145 |

App code that uses these: web `components/app/log/ShowField.tsx`, `VenueField.tsx`, `DidYouMean.tsx`, `lib/entries.ts` (`ensureShow`, `ensureVenue`, `similarShows`, `similarVenues`), `lib/import/resolve.ts`; iOS `Data/Entries.swift`, `Screens/Log/CatalogueSearch.swift`.

## 3. What each remaining issue adds

Launch is Journey 2: the user types the show (#353). Journey 1 pre-fills the show from venue and date, and is built in steps after launch (section 6).

### #147 Show catalogue (finishing)
- **#274 merges and cities.** `merge_shows(from_id, into_id, force boolean default false)` and `merge_venues(from_id, into_id)`: `security definer`, `set search_path = ''`, execute revoked from `public, anon, authenticated` and granted to `service_role`. Lock like `merge_into_catalogue()`, move `entries` and `show_aliases` (on conflict do nothing), delete the duplicate, return counts. Refuse a show type mismatch unless `force`. Cities: `canonical_city(city text, country text) returns text` (immutable) maps London boroughs and "Greater London"/"City of Westminster"/"City of London" to "London", and the five New York boroughs to "New York"; a `before insert or update of city` trigger on `venues` applies it; backfill in the same migration. Script `supabase/scripts/merge.mjs` (section 5): `--dry-run` lists likely duplicate pairs (same `normalise_show_title`; venues within 100 m with `similar_venues`-style names); `--shows A B` / `--venues A B` merges one pair. The hosted run is the owner's (needs-human).
- **#132 artwork.** Independent of the rest. `shows.artwork_path`, `artwork_source_url`, `artwork_fetched_at`, `artwork_blocked`; private bucket `show-artwork` readable by `authenticated` only; script fetches `og:image` from the show's official website (Wikidata `P856`), resized to 600 px wide, skipping non-images and images under 300 px. `Poster` order: entry photo → artwork (signed-in surfaces only) → House Lights. Never on share cards, public pages or `/api/og/*`.

### #353 Journey 2 (launch)
- **#368 search.** `search_shows` keeps its signature. A main name equal to the query, ignoring subtitles like ": The Musical", ranks first. Results show the year as well as the type, because 33 titles have two rows.
- **#354 check.** Every log and import case on both apps, with no runs in the database.

### #363 Admin: see and fix our shows
- **#364 list and name check.** Admin-only read function, page at `/app/backstage/shows`. Pasting a list of titles runs each through `search_shows`, showing what a user would see.
- **#365 fix.** `admin_update_show`, `admin_merge_shows` (security definer, checks `public.is_admin()`). A corrected title must survive `sync-wikidata.mjs`.
- **#366 pull and review.** `show_candidates` (admin only), filled by `sync-wikidata.mjs --candidates` using the wider query on branch `claude/wider-wikidata-catalogue`. Add, Same as, Not a show; review a sample, then bulk add. Nothing appears in show search until added.

### #355 Admin: see and fix our theatres
- **#356 list.** Admin-only SQL read function: venues with entry counts (never who), paged and filterable by search, circuit, country and missing links, plus totals. Page at `/app/backstage/theatres`.
- **#357 edit.** `venues.whats_on_url`; `admin_update_venue(...)` (security definer, checks `public.is_admin()`). Venues sharing a site share a URL: the crawl fetches it once and matches stages to those venues. No crawl-target table.

### #289 Journey 1, step 1: crawl pilot and review tool
**#358 is implemented**; the owner configures the Actions secrets and Vercel dispatch token before a live run. Pilot results stay in admin-only tables; automatic publishing into runs is planned in #387 below.
- **#277 core.** `crawl_runs` and `crawl_findings` (admin read, service-role write). `supabase/scripts/crawl/` with `index.mjs`, `fetch.mjs` (robots.txt, per-host rate limit, User-Agent, conditional requests), `load.mjs` (one transaction per theatre), `report.mjs`. Facts and short evidence only, never copies of pages. Parsers are pure functions tested with `node --test` on saved fixtures.
- **#291 theatre sites.** Structured data (schema.org `Event`) by code first, then a model when the run allows it, with model and prompt taken from the `crawl_runs` row. Findings keep the raw title; no show matching here.
- **#358 start from admin.** `/app/backstage/crawl` creates a `crawl_runs` row and dispatches `.github/workflows/catalogue-crawl.yml` with a run id and branch. The crawl runs on GitHub Actions, so the model key stays out of Vercel and the app. The owner adds `SUPABASE_DB_URL` and `ANTHROPIC_API_KEY` as Actions secrets and a repository-scoped Actions token in Vercel.
- **#359 review.** `/app/backstage/crawl/[id]`: mark findings right or wrong, add missed titles, score per run and theatre, compare two runs and their settings.
- **#367 titles to show review.** Findings marked right with no `similar_shows` same-match become `show_candidates` (#366). Adds a show-name pull as a job on the crawl form.

### #387 Journey 1, step 2: read theatre sites with rules, into runs
Implemented; live acceptance runs deferred by the owner until setup is complete.
- **#388 rules reader.** `cheerio`, pinned, for the crawl scripts only. `crawl_sites` (one row per site) and `crawl_rules` (versions; JSON data, never code). A `rules` reader goes first in `READERS`; scheduled runs never use the `model` reader. A tested date parser never guesses: a form it can't read keeps `date_text` with no dates. Archive pages are followed and old dates kept. Every reader's findings must appear on the fetched page.
- **#276 runs.** `runs(venue_id, title, show_id nullable, start_date, end_date, source, source_url, confidence, last_seen_at)`, with an index on venue and `daterange(start_date, end_date, '[]')`. `publish_crawl_findings(run_id)` upserts shows that passed the check, linking `show_id` only when `similar_shows` says `same`. `merge_shows`/`merge_venues` move runs. Entries don't reference runs.
- **#389 state.** `crawl_pages`: fingerprint of the page's text, ETag and Last-Modified, last result, failures in a row, status. An archive is read once and resumes if interrupted; after that only the newest archive page is checked, because page numbers shift. Plain-code health signals feed #394. A bad run never overwrites good data.
- **#390 diary score.** The admin's own entries compared with what was crawled at those venues, so misses are visible.

### #391 Journey 1, step 3: the crawl loop fills runs on its own
Implemented with the switch off. The owner deferred live acceptance runs until configuration is complete.
- **#392 find links.** Websites from Wikidata `P856`, then a capped web search accepted only if the homepage names the venue. Code shortlists homepage links and Haiku picks. Links entered by hand are never overwritten.
- **#393 write rules.** Haiku gets trimmed HTML and the rules schema, with no tools, and returns rules only. Code applies them and refuses any that fail. One retry on Sonnet, then "needs attention".
- **#394 repair.** Health signals rerun #392 and #393. New rules must still find known shows. Attempts are limited per site, and good data stays in place.
- **#288 the loop.** Daily batches until sites are filled, weekly what's-on checks, limits per run, and a progress page. Does nothing until repository variable `CRAWL_LOOP_ENABLED` is `true`, which is the owner's kick-off.

### #419 Venue-first catalogue

**#420 frontier.** `crawl_sources` holds adapter version, allowlisted hosts,
minimum request interval and independent collection and publication switches.
London Theatre and Playbill start with both switches off. The legacy
official-site runner continues to use its existing controls and checkpoints.

- `crawl_generations` identifies one scan per source and scope. Its completion
  timestamp records that all reached directory pages were acknowledged. Venue
  and event tasks have their own progress.
- `crawl_tasks` deduplicates source, stage and canonical URL per generation.
  `crawl_task_edges` retains each referring page independently. An edge does
  not establish the venue of a show. `crawl_source_entities` retains external
  venue and event identities across generations.
- `start_crawl_generation` resumes the current generation or atomically creates
  a fresh one with a seed task when called with `refresh => true`.
  `enqueue_crawl_task` deduplicates a canonical URL in an enabled scope.
- `acknowledge_crawl_task` checks the current generation, source state and
  unexpired lease token. One transaction saves children, edges and observations,
  queues non-empty extractions for independent publication and completes the
  parent. Repeating an acknowledged lease is a no-op. An extraction stores
  parsed facts and short evidence with a parser version and content hash.
- These tables are admin-read and service-role-write. The RPCs are service-role
  only. To stop new aggregate work, leave collection and publication off. The
  migration can remain in place and existing catalogue and diary data remain
  available.

**#421 worker.** The optional staged command lives alongside the original
official-site loop. Each task claims a five-minute token with `SKIP LOCKED`.
It renews the lease every minute. All outcomes, including retries, validate
the token and expiry. Expired tasks can be claimed again. The worker stops
claiming and cancels requests 90 seconds before its declared deadline.

- The request gate permits four active requests across staged workers and
  one per host. It records a request count separately from task attempts.
  It checks every redirect against source hosts and robots rules. It connects
  only to the validated public DNS address. A 429 persists the host cooldown
  and respects `Retry-After` or defaults to one hour. A 403 or robots exclusion
  pauses the aggregate source or the selected official-site scope.
- Timeouts, parser failures and server errors use jittered retries at roughly
  1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours. Exhausted retries
  leave failed work visible. They preserve prior extracted observations.
- A 304 reuses the saved extraction and links for the same parser version.
  New parser versions and missing extractions require an unconditional fetch.
  `--reparse` keeps the current scan and saved observations, clears validators
  and queues its tasks again. `--refresh` creates a new scan and seed.
- `--dry-run` reads due tasks and proposes extractions without any mutations
  or model calls. It uses local pacing and respects observed database
  cooldowns. Run live dry runs separately from live collection for that host.
- This slice installs the staged runner and an explicit scoped preview that
  reuses the official structured reader. The existing official loop and
  archive checkpoints continue to serve current manual and scheduled runs.
  The publication queue has no consumer yet.

**#422 London Theatre.** The deterministic adapter starts at the source's
venue directory and follows observed pagination. Each venue detail queues
its current, upcoming and past event links independently. Event evidence
keeps source keys, labelled or structured date assertions, venue identity
and explicit categories. Prose and listing categories provide no dates.
Preview, opening, explicit closing and booking horizons are separate
assertions. Generic end dates stay generic. Conflicting dates and events
without sufficient evidence remain staged. Unknown categories stay unknown.

The read-only probe on 2026-11-07 received HTTP 200 for the source robots
file, venue directory, Adelphi venue and one linked historical detail.
The first directory page yielded 10 venue links and five pagination links.
Adelphi yielded 23 event links. The historical detail corroborated one date
in its visible fields and structured data. These are sampled page counts,
with no inferred whole-site or historical total. The directory response
was about 3 MB. The adapter caps bodies at 6 MB and retains only extracted
records. London Theatre collection and publication remain disabled.

**#423 catalogue identities.** The source's publication switch gates a
separate bounded identity queue. Source venue and event keys retain a mapping,
evidence, last extraction, resolution reason and an optional override lock.
Venue matching requires compatible granularity and a corroborating address or
coordinates for name-based matches. A shared building identifier cannot stand
for two auditoria. Existing names and coordinates are preserved. A newly
created venue carries crawler provenance and is unverified.

Show matching considers a stable compatible work ID, or a unique exact title
or alias with a supported compatible type and no conflicting evidence. The
crawler preserves source titles and aliases on new candidate approvals. The
existing admin review path remains available for ambiguity and unknown types.
Candidate approval has explicit crawler provenance. The queue marks identity
processing separately from eventual run publication. Each bounded call
serializes automatic matching and commits the identity and checkpoint together.
Existing diary IDs and user-authored names and aliases remain in place when
publication is paused. A source switch changes eligibility for future work.

**#424 run evidence.** Identity publication and run publication have separate
durable checkpoints. `crawl_run_evidence` records source event and segment
keys, individual facts and their provenance. A correction from the same
field supersedes its prior assertion. Missing or invalid fields preserve
earlier supported dates. A stable engagement key survives start corrections.
Cross-source assertions share it only when explicit shared evidence,
resolved show and venue agree. Independent events keep separate IDs even
when their titles and dates overlap.

`catalogue_effective_runs` exposes bounded schedule support internally.
Preview, opening, closing, booking and generic schedule dates stay separate.
Partial dates have precision tags and no inferred calendar day. Discrete
performances and exceptions keep their own dates. Equal-authority conflicts
suppress interval claims and autofill eligibility. Official evidence outranks
aggregate evidence for the same fact. The stronger eligibility field requires
a resolved show and confirmed closing, with current evidence for open runs.
Consumer activation still requires #428.

The legacy `runs` table and writer signature remain available. An unbounded
legacy row supports its stated start only. Source withdrawal removes its
contribution from effective results while retaining evidence, independent
support and diary entries. Pausing publication stops new writes without
withdrawing accepted evidence. The detailed owner-only diary score returns
exact, partial, conflicting, wrong dates or missing. The older score RPC
retains its three labels for existing clients.

**#425 source progress.** Backstage and the CLI use the same paginated
Postgres snapshot. A scan's denominator is its discovered page count.
Processed counts track pages with a durable successful checkpoint even
while a reparse is pending. Queue status counts describe current work.
A processed venue page only counts as enriched once its reachable venue
pagination and event tasks have succeeded. Requests are durable outbound
slot reservations. Legacy model-call counts are shown as untracked.

An operator pause stops new claims and lets existing bounded work finish.
A source access block has a separate reason and requires explicit blocked
retry. Retry and reparse keep their scan and last-good evidence. Rediscovery
opens a new scan with the current scope's seed. Each action records its
administrator, target and affected count. Collection and publication remain
independent.

**#426 Playbill.** Playbill uses a deterministic adapter over the same task
frontier and publisher. The Broadway directory and the two supplied venue
seeds keep distinct scopes. The adapter follows observed production cards
and approved pagination. A production's source key identifies the source
record without implying a work ID. Explicit transfers keep separate venue
engagements. Current status without a closing date remains unknown.

A bounded, robots-aware preflight returned HTTP 200 for the directory, both
venue seeds and two linked production pages. The sampled directory yielded
41 venue links. Theatre Royal Stratford East yielded 15 production links
and Circle in the Square yielded 115. The sampled historical detail exposed
separate preview, opening and closing dates. The current detail had a preview
and opening date with no confirmed close. The robots file declared no sitemap.
These are sampled reachable links, with no claim of full Playbill or
historical coverage. Playbill collection and publication remain off.

### #419 Consumer suggestions

#360 stages optional suggestions derived from existing entries, with privacy
and block checks. #278 adds validated catalogue suggestions as optional
chips. Both preserve manual logging and imports. Autofill has a separate
switch and stays off unless #428's stronger acceptance gate passes.

### #314 Journey 1, later sources

Wikipedia (#361), IBDB (#287) and Wayback (#292) remain deferred. Playbill
belongs to #426 in the venue-first epic.

### Geocoding and unknown-type shows (#444)

Venue pages without coordinates are geocoded in the worker (postcodes.io, Nominatim fallback, cached in
`crawl_geocodes`, provenance `geocoded:*` in the evidence); venue matching accepts a postcode/street match, an
exact `osm_id`, or a geocode within 250 m for exactly one same-name venue. Shows with no deterministic type link
only on one corroborated exact title; a new one is held as `unknown_show_type` (since 20261108200100), not
published as Other. Details and reasons: `docs/DECISIONS.md`, "#444".

### Model-suggested show types (#450)

The one model step in the London pipeline, approved by the owner on 2026-11-08 as a narrowing of #419's rule.
Pages are still never sent to AI. For held new shows, `show-type.mjs` sends only the cleaned title, the venue
name and the run dates to `claude-haiku-5-5`, plus an optional web-search pass for unsure answers. Answers live
in `crawl_show_type_suggestions` with provenance (`ai:claude-haiku-5-5`, `ai:claude-haiku-5-5+web_search`).
`crawl_match_show` reads `crawl_show_type_suggestion()` only where it would otherwise hold a new show: the
latest unreverted answer, when it names a type at confidence 0.80 or more. A confident `other` publishes as
Other. The candidate keeps `type_suggestion_id`. Off unless `CRAWL_TYPE_SUGGESTIONS`; a healthy crawl never
needs it. Revert by provenance with `crawl_revert_show_type_suggestions`. Benchmark:
`docs/catalogue-benchmark/`.

## 4. SQL conventions and known traps

- **Migrations:** `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql`, timestamp after the newest file. Never edit a merged migration; change functions with `create or replace` (grants survive). One migration per pull request.
- **Every function sets `search_path`** (`''` with fully qualified names, or `public, extensions` when using pg_trgm operators).
- **Revoke, then grant:** `revoke execute on function … from public;` then grant to `anon, authenticated` (read helpers) or `service_role` (admin and merge functions).
- **Use plpgsql when a value derived from a parameter is used per row.** A `language sql` function with `set search_path` isn't inlined, so `normalise_…(q)` in a CTE is recomputed for every row (this made search 10× slower in #35). Compute it once into a variable.
- **Parameter names that match column names** (`show_id`, `title`, `name`) need `#variable_conflict use_column` and qualified references (`fn_name.param`). Output columns of `returns table (...)` also clash with parameters of the same name; rename the parameter (`q`).
- **Keep public signatures stable:** the apps call RPCs by parameter name. Adding a parameter with a default is fine; renaming or reordering breaks shipped iOS builds.
- **Trigram filters:** `col like '%' || x || '%'` and `x <% col` use the gin index on `col`; `word_similarity(col, x)` doesn't. Per-keystroke functions must stay index-friendly; one-off checks (`similar_*`) can scan. Time new search functions with 4,000 extra rows inside `begin … rollback` and compare with the current ones.
- **Generated columns** can only call `immutable` functions, and every row is rewritten when one is added.

## 5. Scripts (admin, never the app)

Follow `supabase/scripts/sync-wikidata.mjs`: Node 24+, **no npm packages** (the one exception is `cheerio` for the crawl scripts, the owner's call, #388), `node:util` `parseArgs`, a descriptive User-Agent, retries with backoff on 429/5xx, `--dry-run` that runs SQL in a read-only transaction, the real run in one transaction, and psql spawned with the connection in `PGDATABASE` from `SUPABASE_DB_URL` (default local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), never in argv, and psql errors never echoed (they can contain credentials). Pure functions are exported and tested with `node --test`; each new test file is added to the `web` job in `.github/workflows/ci.yml`. Document usage in `supabase/README.md`. Hosted runs are the owner's.

## 6. Order and why

| Step | Needs before it | What it gives |
|---|---|---|
| #353 Journey 2 (launch) | nothing | The launch logging flow |
| #363 Admin: shows | nothing | Correct, findable show names |
| #355 Admin: theatres | nothing | What's-on links, and where people actually log |
| #289 Crawl pilot | #355 | Review tools, and the workflow the loop runs on |
| #387 Rules into runs | #289 | Code fills `runs` for sites with rules, at no AI cost |
| #391 Crawl loop | #387, #358 | The system fills `runs` on its own once the owner turns it on |
| #272 Suggestions | Good data in `runs` (#360 needs nothing) | Show pre-filled from venue and date |
| #314 More sources | The gaps the loop shows | Whatever theatres don't publish |

**Measure of progress:** of photo logs with a known venue, the share whose show came from a suggestion rather than being typed (`entry_logged.show_source`). Add theatres in order of entries logged there.

## 7. Checks before a pull request

- `supabase db reset` then `supabase test db` (all files pass). Don't copy a linked project's `supabase/.temp` into a worktree: its `postgres-version` makes the reset pull a different image and fail.
- After any schema change: `apps/ios/scripts/dev types` (CI fails if `Database.swift` is stale). The web has no generated types; its row types are hand-written in `lib/entries.ts`.
- Web: `pnpm lint`, `pnpm typecheck`, `pnpm test` in `apps/web` (lint warnings count).
- iOS (not in CI): `apps/ios/scripts/dev build` and `scripts/dev test`.
- A `docs/DECISIONS.md` entry for any choice the issue left open, and the PR body says the migration is applied. Apply it yourself with `supabase db push` once CI is green (see CLAUDE.md, "Apply your own migrations").

Rollout state, validation results and the operations runbook: [`CATALOGUE_ROLLOUT.md`](CATALOGUE_ROLLOUT.md).
