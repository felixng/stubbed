# Catalogue: shows, venues, productions and runs

How the catalogue is built, and what the remaining catalogue epics add. Read this before picking up an issue in #147, #272, #289, the second crawler epic or #273. Product decisions stay in the issues and `docs/DECISIONS.md`; this file is the technical map. Where they disagree, the decisions log is newer.

## 1. Rules that apply to every issue

- **The catalogue is optional.** Every feature works with empty catalogue tables, for user-added shows, and for entries with no production. Tests must include the empty case.
- **Rules live in Postgres.** Matching, tidying, ranking and access are SQL functions that web and iOS both call, never logic copied into the two apps.
- **Typed-in shows and venues are visible to everyone.** Duplicates are prevented ("Did you mean…?", #146) and merged (#274), never hidden per user.
- **Venues are flat:** one row per auditorium (Olivier, Lyttelton and Dorfman are three venues). No parent or space column.
- **Suggestions, never auto-save:** a strong match may fill an *empty* field; nothing overwrites a field the user has touched.
- **Users never write catalogue facts** other than shows, venues and nicknames they add while logging. Productions, runs and crawled rows are written by the service role only.

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

Epics close in this order, and each depends only on epics before it (section 6).

### #147 Show catalogue (finishing)
- **#274 merges and cities.** `merge_shows(from_id, into_id, force boolean default false)` and `merge_venues(from_id, into_id)`: `security definer`, `set search_path = ''`, execute revoked from `public, anon, authenticated` and granted to `service_role`. Lock like `merge_into_catalogue()`, move `entries` and `show_aliases` (on conflict do nothing), delete the duplicate, return counts. Refuse a show type mismatch unless `force`. Cities: `canonical_city(city text, country text) returns text` (immutable) maps London boroughs and "Greater London"/"City of Westminster"/"City of London" to "London", and the five New York boroughs to "New York"; a `before insert or update of city` trigger on `venues` applies it; backfill in the same migration. Script `supabase/scripts/merge.mjs` (section 5): `--dry-run` lists likely duplicate pairs (same `normalise_show_title`; venues within 100 m with `similar_venues`-style names); `--shows A B` / `--venues A B` merges one pair. The hosted run is the owner's (needs-human).
- **#132 artwork.** Independent of the rest. `shows.artwork_path`, `artwork_source_url`, `artwork_fetched_at`, `artwork_blocked`; private bucket `show-artwork` readable by `authenticated` only; script fetches `og:image` from the show's official website (Wikidata `P856`), resized to 600 px wide, skipping non-images and images under 300 px. `Poster` order: entry photo → artwork (signed-in surfaces only) → House Lights. Never on share cards, public pages or `/api/og/*`.

### #272 Productions and runs
- **#276 schema.** Tables as specified in the issue: `productions`, `runs` (GiST index on `(venue_id, daterange(start_date, end_date, '[]'))`; needs `btree_gist` for the composite, or index `daterange` alone), `entries.production_id` (`on delete set null`), `shows.source` (`user`, `wikidata`, `crawler`). Consistency trigger on `entries`: clear `production_id` when the production's show isn't the entry's show. RLS: select for everyone, no insert/update/delete policies (service role only). Extend `merge_shows`/`merge_venues` with `create or replace` to move productions and runs; add `merge_productions`.
- **#278 suggestions.** `suggest_shows(venue_ids uuid[], on_date date)` returns `(show_id, production_id, venue_id, source, score)`, `source` in `run`, `community`, `yours`. `security definer` only if needed to count other people's public entries; it must return no user ids and must apply `profile_is_visible`, entry visibility and `blocks` (reuse the predicates used by `feed_entries`). Tests seed fixture productions and runs: this issue does **not** depend on the crawler. `confirm_run(run_id)` (security definer) raises confidence by a capped step once per user. Clients call it after the nearby venues resolve; `entry_logged` gains `show_source` (`run`, `community`, `yours`, `photo_text`, `identify`, `manual`).

### #289 Catalogue crawler (core)
- **#290 theatre list (built).** `venues` gains `circuit` (`venue_circuit`: `west_end`, `off_west_end`, `pub`, `broadway`, `off_broadway`, `regional_uk`, `regional_us`), `website`, `wikidata_id` (unique) and `source` (`user`, `osm`, `crawler`); users can't write these. `supabase/scripts/sync-osm-venues.mjs` loads every named UK and US theatre from OpenStreetMap through `load_osm_venues(rows jsonb)` (service role only; the import rules are tested in pgTAP), labelling West End and Broadway houses from `west-end-theatres.json` and `broadway-theatres.json`. The other circuits stay null until the crawler labels them from Wikipedia lists. The nearby lookup asks `nearby_venues` first (#343). The crawler matches on `osm_id`, then `wikidata_id`, then `similar_venues(...).same`.
- **#277 crawler core and Wikipedia.** `supabase/scripts/crawl/` with `index.mjs` (CLI), `fetch.mjs` (robots.txt, per-host rate limit, ETag/If-Modified-Since, User-Agent), `resolve.mjs` (venue and show matching through `similar_venues`/`similar_shows` via psql), `load.mjs` (one transaction, upsert on `(source, source_ref)`, stale marking, never deletes entries), `report.mjs` (Markdown summary), `sources/wikipedia.mjs`. Parsers are pure functions tested with `node --test` on saved fixture pages in `supabase/scripts/crawl/fixtures/`; add the test command to `.github/workflows/ci.yml`. The model step (Haiku, Wikipedia leftovers only) is behind `--budget` and off by default in tests.
- **#288 monthly run.** `.github/workflows/catalogue-crawl.yml`; the owner adds `SUPABASE_DB_URL` and `ANTHROPIC_API_KEY` repository secrets (needs-human).

### Second crawler epic (more sources)
- **#287 IBDB and Playbill:** `sources/ibdb.mjs`, `sources/playbill.mjs`, rules only, on only when `CRAWL_SOURCES` lists them; `crawl remove <source>` deletes their rows (entries keep show, venue, date).
- **#291 theatre → shows:** `sources/theatre-site.mjs`; new shows go through `similar_shows` (attach when `same`, skip when several close matches, otherwise insert with `source = 'crawler'`, unverified).
- **#292 Wayback history:** `sources/wayback.mjs` on the CDX API; progress saved so a capped run resumes.

### #273 On-device photo reading, no cloud AI
- **#279 spike** (iOS, throwaway target or DEBUG screen): Vision `VNRecognizeTextRequest` on fixtures; Foundation Models only on a device or Mac with Apple Intelligence (owner may run that part; the spike's verdict can be "Vision only").
- **#280** iOS: OCR lines → `search_shows`; printed date and venue rules from the issue; merged with `suggest_shows` chips.
- **#281** removes `/api/photo/identify` (answer 410 for one release), `lib/identify.ts`, the identify step in `lib/import/photo-pipeline.ts` and `LogForm.tsx`, iOS `Data/PhotoDetect.swift` and its callers (`LogView.swift`, `PhotoImport.swift`).
- **#282** removes email import (`/api/import/email`, `lib/import/extract-email.ts`, the email option in `ImportTool.tsx`), then `lib/ai`, `/api/ai/providers` and the model-compare mode; the owner removes `ANTHROPIC_API_KEY` from Vercel (needs-human).

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

| Epic | Needs before it | Gives to later epics |
|---|---|---|
| #147 Show catalogue | nothing | `similar_shows`/`similar_venues` (crawler matching), `merge_shows`/`merge_venues` (extended by #276), canonical cities |
| #272 Productions and runs | #147 | tables the crawler fills; `suggest_shows` (needed before #281) |
| #289 Catalogue crawler (core) | #272 | real runs at West End and Broadway theatres, so suggestions work for most photos |
| #273 On-device reading, no cloud AI | #272 (and #289 for real-world quality) | removes Claude from both apps |
| Crawler: more sources | #289 | Broadway depth, fringe and pub theatres, 20-year history |

## 7. Checks before a pull request

- `supabase db reset` then `supabase test db` (all files pass). Don't copy a linked project's `supabase/.temp` into a worktree: its `postgres-version` makes the reset pull a different image and fail.
- After any schema change: `apps/ios/scripts/dev types` (CI fails if `Database.swift` is stale). The web has no generated types; its row types are hand-written in `lib/entries.ts`.
- Web: `pnpm lint`, `pnpm typecheck`, `pnpm test` in `apps/web` (lint warnings count).
- iOS (not in CI): `apps/ios/scripts/dev build` and `scripts/dev test`.
- A `docs/DECISIONS.md` entry for any choice the issue left open, and the PR body says it needs `supabase db push`. Migrations reach the hosted database only when the owner applies them or says to.
