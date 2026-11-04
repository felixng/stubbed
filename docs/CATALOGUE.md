# Catalogue: shows, venues and runs

How the catalogue is built, and what the remaining catalogue epics add. Read this before picking up an issue in #147, #355, #289, #272 or #314. Product decisions stay in the issues and `docs/DECISIONS.md`; this file is the technical map. Where they disagree, the decisions log is newer.

## 1. Rules that apply to every issue

- **The catalogue is optional.** Every feature works with empty catalogue tables, for user-added shows, and for entries with no matching run. Tests must include the empty case.
- **Rules live in Postgres.** Matching, tidying, ranking and access are SQL functions that web and iOS both call, never logic copied into the two apps.
- **Typed-in shows and venues are visible to everyone.** Duplicates are prevented ("Did you mean…?", #146) and merged (#274), never hidden per user.
- **Venues are flat:** one row per auditorium (Olivier, Lyttelton and Dorfman are three venues). No parent or space column.
- **Suggestions, never auto-save:** a strong match may fill an *empty* field; nothing overwrites a field the user has touched.
- **Entries stay show + venue + date.** They store no run or production. A run is found by looking up those three, so older entries match new runs and deleting crawl data can't touch an entry. There is no `productions` table until a feature needs one; adding it then means the table plus a nullable `runs.production_id`.
- **Users never write catalogue facts** other than shows, venues and nicknames they add while logging. Runs and crawl data are written by the service role or admin functions only.

## 2. As built

| Object | What it is | Since |
|---|---|---|
| `shows` | `title`, `type`, `verified`, `created_by`; catalogue rows have `wikidata_id` (unique), `first_performed`, `aliases text[]` (rewritten by the Wikidata sync, never user data). `search_text` is a stored generated column: normalised title and aliases joined with ` \| `, trigram-indexed. | #12, #145, #35 |
| `show_aliases` | Nicknames users teach: `show_id`, `alias`, stored `search_text`, `created_by`. Unique per show on `search_text`. Public read; signed-in insert; creators edit/delete their own. | #35 |
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

### #355 Admin: see and fix our theatres
- **#356 list.** Admin-only SQL read function: venues with entry counts (never who), paged and filterable by search, circuit, country and missing links, plus totals. Page at `/app/admin/theatres`.
- **#357 edit.** `venues.whats_on_url`; `admin_update_venue(...)` (security definer, checks `public.is_admin()`). Venues sharing a site share a URL: the crawl fetches it once and matches stages to those venues. No crawl-target table.

### #289 Journey 1, step 1: crawl pilot and review tool
Nothing here reaches users. Results stay in admin-only tables until a person publishes them.
- **#277 core.** `crawl_runs` and `crawl_findings` (admin read, service-role write). `supabase/scripts/crawl/` with `index.mjs`, `fetch.mjs` (robots.txt, per-host rate limit, User-Agent, conditional requests), `load.mjs` (one transaction per theatre), `report.mjs`. Facts and short evidence only, never copies of pages. Parsers are pure functions tested with `node --test` on saved fixtures.
- **#291 theatre sites.** Structured data (schema.org `Event`) by code first, then a model when the run allows it, with model and prompt taken from the `crawl_runs` row. Findings keep the raw title; no show matching here.
- **#358 start from admin.** `/app/admin/crawl` creates a `crawl_runs` row and dispatches `.github/workflows/catalogue-crawl.yml` with a run id and branch. The crawl runs on GitHub Actions, so the model key stays out of Vercel and the app. The owner adds `SUPABASE_DB_URL` and `ANTHROPIC_API_KEY` as Actions secrets and a repository-scoped Actions token in Vercel.
- **#359 review.** `/app/admin/crawl/[id]`: mark findings right or wrong, add missed titles, score per run and theatre, compare two runs and their settings.

### #272 Journey 1, step 2: runs and show suggestions
#360 can ship any time. The rest starts only when the owner says the pilot passed.
- **#360 entry suggestions.** `suggest_shows(venue_ids uuid[], on_date date)` returns `(show_id, title, venue_id, source, score)`, `source` in `community`, `yours`. `security definer` only if needed to count other people's public entries; it must return no user ids and must apply `profile_is_visible`, entry visibility and `blocks` (reuse the predicates used by `feed_entries`). `entry_logged` gains `show_source`.
- **#276 runs.** `runs(venue_id, title, show_id nullable, start_date, end_date, source, source_url, confidence, last_seen_at)`, with an index on venue and `daterange(start_date, end_date, '[]')`. `publish_crawl_findings(run_id)` (admin) upserts findings marked right, linking `show_id` only when `similar_shows` says `same`. `merge_shows`/`merge_venues` move runs (`create or replace`).
- **#278 run suggestions.** Adds the `run` source. A single run at confidence 0.8 or above, seen recently, at a single venue fills an empty show; the rest are chips. Tapping a run with no show goes through the "Did you mean…?" path, so crawl noise never enters show search.
- **#288 schedule.** Weekly to start, for `venues.crawl_enabled` theatres only. Findings at confidence 0.8 or above publish automatically.

### #314 Journey 1, step 3: more crawl sources (parked)
Each is its own decision after step 2 shows real use: #361 Wikipedia, #287 IBDB and Playbill, #292 Wayback Machine. Each is one module under `supabase/scripts/crawl/sources/`, and goes through the review screen before it publishes.

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

Follow `supabase/scripts/sync-wikidata.mjs`: Node 24+, **no npm packages**, `node:util` `parseArgs`, a descriptive User-Agent, retries with backoff on 429/5xx, `--dry-run` that runs SQL in a read-only transaction, the real run in one transaction, and psql spawned with the connection in `PGDATABASE` from `SUPABASE_DB_URL` (default local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), never in argv, and psql errors never echoed (they can contain credentials). Pure functions are exported and tested with `node --test`; each new test file is added to the `web` job in `.github/workflows/ci.yml`. Document usage in `supabase/README.md`. Hosted runs are the owner's.

## 6. Order and why

| Step | Needs before it | What it gives |
|---|---|---|
| #353 Journey 2 (launch) | nothing | The launch logging flow |
| #355 Admin: theatres | nothing | What's-on links, and where people actually log |
| #289 Crawl pilot | #355 | An answer on whether theatre sites can be read accurately, and the tools to tune it |
| #272 Runs and suggestions | The pilot passing (#360 needs nothing) | Show pre-filled from venue and date |
| #314 More sources | Step 2's analytics | Past shows, for older photos |

**Measure of progress:** of photo logs with a known venue, the share whose show came from a suggestion rather than being typed (`entry_logged.show_source`). Add theatres in order of entries logged there.

## 7. Checks before a pull request

- `supabase db reset` then `supabase test db` (all files pass). Don't copy a linked project's `supabase/.temp` into a worktree: its `postgres-version` makes the reset pull a different image and fail.
- After any schema change: `apps/ios/scripts/dev types` (CI fails if `Database.swift` is stale). The web has no generated types; its row types are hand-written in `lib/entries.ts`.
- Web: `pnpm lint`, `pnpm typecheck`, `pnpm test` in `apps/web` (lint warnings count).
- iOS (not in CI): `apps/ios/scripts/dev build` and `scripts/dev test`.
- A `docs/DECISIONS.md` entry for any choice the issue left open, and the PR body says it needs `supabase db push`. Migrations reach the hosted database only when the owner applies them or says to.
