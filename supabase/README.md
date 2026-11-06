# Supabase

The shared backend for web and iOS: SQL migrations (tables, constraints, row-level security, functions) and database tests. The schema is the contract between the two apps.

```
config.toml   local stack config (`supabase init`)
migrations/   timestamped SQL migrations
tests/        pgTAP privacy tests
```

The show catalogue can optionally be populated from Wikidata (below); shows and venues can still be added through the app and by imports. Use `search_shows(q)` and `search_venues(q, near_lat, near_lng)` to find an existing row before creating one. Nothing requires the catalogue to have been synced.

## Optional Wikidata catalogue (#145)

`scripts/sync-wikidata.mjs` queries Wikidata (CC0), never commercial theatre sites. Requires **Node 24+** and **psql** (PostgreSQL client); no npm packages or API keys. Apply `20261029130000_show_catalogue.sql` first. From the repository root, against a running local Supabase database:

```sh
# Defaults to postgresql://postgres:postgres@127.0.0.1:54322/postgres.
node --use-env-proxy supabase/scripts/sync-wikidata.mjs --dry-run
node --use-env-proxy supabase/scripts/sync-wikidata.mjs
```

`--use-env-proxy` honours the managed environment's proxy. Keep its CA trust and TLS verification enabled. Allow `query.wikidata.org`; this script uses no Wikidata API key. Requests run sequentially with a descriptive User-Agent, paging and backoff for 429/5xx responses.

For the hosted project, **the owner runs the first sync**, after reviewing the dry run and applying the migration. Set `SUPABASE_DB_URL` securely in your shell/environment settings to a privileged Postgres connection string (including the provider's TLS settings). Never commit it, paste it into an issue, or put it in a command argument. Then use the same two commands above. This bypasses RLS: do not run against production without the owner's explicit go-ahead. The PR does not run a hosted sync or enable a schedule.

Dry run uses a **read-only transaction**: it reports added, updated, unchanged, proposed merged rows, ambiguous titles and skipped candidates without changing the database. It includes existing catalogue rows in its merge preview. Actual sync upserts by `wikidata_id` and merges in one transaction; failures roll back the whole database change. Repeat runs leave unchanged rows untouched. New catalogue rows have `verified = true`, `created_by = null`; refresh updates only title, type, year and aliases. Missing source items are never deleted. Websites and descriptions are fetched for inspection but not stored (artwork has its own future schema).

Source criteria: an IBDB **show** ID (`P1219`, not production ID `P1218`), or a premiere at one of the reviewed West End theatre buildings in `scripts/west-end-theatres.json`. Premiere venues use `P4647` or the `P276` qualifier on `P1191`. These are catalogue selection criteria, not regions shown in the app. Coverage is limited by Wikidata's statements. Type mapping follows class/genre subclasses, prioritises opera and ballet over musical, treats comedic plays as plays, and excludes films, albums, TV series, songs and posters. Source duplicates prefer an IBDB ID, then the earliest known performance, then numeric Wikidata ID; skipped candidates are reported.

The merge compares **titles only, not aliases**, using NFKD accent decomposition, lowercase, collapsed whitespace, a leading `the ` removed and one trailing `the musical`, `(musical)`, `(the musical)`, `(play)`, `(broadway)` or `(west end)` removed. Punctuation otherwise stays significant; transliterations such as `ø` → `o` are deliberately not guessed. Only a single catalogue match with the same type is merged. Any multiple-title match or type disagreement stays untouched and is listed for an admin. Only `entries.show_id` is reassigned (the normal `updated_at` trigger runs); owner, status, rating, visibility, note, photo, date and trip links stay intact. The service-only merge function cannot be called by app users.

To save/replay a source response without fetching Wikidata again:

```sh
# Creates a new file; refuses to overwrite one. Keep bulk captures out of Git.
node --use-env-proxy supabase/scripts/sync-wikidata.mjs --dry-run --save-source /tmp/catalogue.json
node supabase/scripts/sync-wikidata.mjs --source /tmp/catalogue.json --dry-run
node --test supabase/scripts/sync-wikidata.test.mjs
supabase test db
```

The source option accepts the script's combined SPARQL `results.bindings` JSON. Unit tests include synthetic edge cases and a small captured live response. SQL tests seed and roll back their own catalogue, covering the empty-catalogue workflow, grants, aliases, ranking and privacy-preserving merges.

## Wider show names, for review (#366)

`sync-wikidata.mjs --candidates` runs the wider Wikidata query (any play, musical, opera or ballet with an English Wikipedia article, about 13,500 names) and writes it to `show_candidates`, never to `shows`. Candidates are admin-only, aren't in `search_shows`, and are reviewed at `/app/backstage/shows/candidates`: **Add** (tidied like a typed-in show, Wikidata id kept), **Same as** (links an existing show and saves the name as a nickname) or **Not a show**; or review a random sample of a group and, once 95% of it is right (at least 20 reviewed), **Add the rest** (up to 2,000 a call). Apply `20261104170000_show_candidates.sql` first.

```sh
node --use-env-proxy supabase/scripts/sync-wikidata.mjs --candidates --dry-run   # same work in a rolled-back transaction
node --use-env-proxy supabase/scripts/sync-wikidata.mjs --candidates
node supabase/scripts/sync-wikidata.mjs --candidates --source /tmp/catalogue.json   # replay a saved response
```

**From the crawl (#367):** on a run page (`/app/backstage/crawl/<id>`), "Send to show review" turns the findings marked right, of kind show, whose title doesn't already read as a show into candidates with `source = 'crawler'` (the source page and first theatre kept). Repeat sightings raise the count; a title also pulled from Wikidata raises that candidate's count instead of making a second; sent findings are marked so sending again does nothing. Apply `20261104180000_crawl_titles_to_review.sql` first.

A second pull only raises each name's "seen" counter (and refreshes it while it is still pending); a decision already made is never undone, and a name already in `shows` by Wikidata id is skipped. The hosted run is the owner's.

## Theatres from OpenStreetMap (#290)

`scripts/sync-osm-venues.mjs` loads every named `amenity=theatre` in the UK and US from OpenStreetMap (ODbL) into `venues`, so photo detection answers from Postgres (#343). It queries QLever's public OpenStreetMap endpoint (no key), then calls `public.load_osm_venues`, which holds the import rules and is service-role only. Requires **Node 24+** and **psql**; apply `20261103140000_venue_catalogue.sql` first. West End and Broadway houses get `circuit` and `verified` from the reviewed Wikidata lists `scripts/west-end-theatres.json` and `scripts/broadway-theatres.json`.

```sh
# Defaults to postgresql://postgres:postgres@127.0.0.1:54322/postgres.
node --use-env-proxy supabase/scripts/sync-osm-venues.mjs --skip-cities --dry-run
node --use-env-proxy supabase/scripts/sync-osm-venues.mjs --skip-cities
# One country, or save and replay the fetched data:
node --use-env-proxy supabase/scripts/sync-osm-venues.mjs --country GB --save-source /tmp/osm-venues.json
node supabase/scripts/sync-osm-venues.mjs --source /tmp/osm-venues.json --dry-run
node --test supabase/scripts/sync-osm-venues.test.mjs
```

About 5,900 of the ~9,700 theatres have no `addr:city`. Without `--skip-cities` the script fills them with Nominatim reverse lookups (one per ~1 km square, at most one a second, roughly 90 minutes), caching results in `--city-cache` (default `$TMPDIR/stubbed-osm-cities.json`) after every lookup so a stopped run resumes. Dry runs wrap the call in a transaction that is rolled back and print the counts. A run reports rows fetched, rows after de-duplication, cities looked up, and the counts `inserted`, `filled`, `attached`, `west_end` and `broadway`, and lists any reviewed West End or Broadway Wikidata ID with no OpenStreetMap row (expect one Broadway ID, Q45103687, Bijou Theatre).

Rules in `load_osm_venues`: a hand-added venue with no `osm_id` gets the id of the same-named OpenStreetMap theatre under 200 m away; new theatres are inserted with `source = 'osm'`; blanks (city, country, coordinates, website) on existing venues are filled but a name is never changed; a Wikidata id is set only where no other venue has it; circuits are set only where empty. A second run changes nothing.

**For the hosted project, the owner runs it**: apply the migration, review a `--dry-run`, then run it for real without `--skip-cities`. Set `SUPABASE_DB_URL` as for the Wikidata sync. OpenStreetMap data is © OpenStreetMap contributors (ODbL); the terms already credit it.

## Crawl pilot: what's on at theatre websites (#277, #291)

`scripts/crawl/` reads each venue's `whats_on_url` into `crawl_runs` and `crawl_findings`, which only admins can read. Nothing it writes reaches users or show search: findings keep the raw title and link to no show. Requires **Node 24+** and **psql**; apply `20261104150000_crawl_tables.sql` first. `SUPABASE_DB_URL` is read as for the other scripts (default: local Supabase).

```sh
node supabase/scripts/crawl/index.mjs --venues <id>,<id> --dry-run   # fetch and report, write nothing
node supabase/scripts/crawl/index.mjs --venues <id>,<id>             # creates a run and stores findings
node supabase/scripts/crawl/index.mjs --run-id <uuid>                # a run created elsewhere (the admin page, #358)
node --test supabase/scripts/crawl/crawl.test.mjs
```

A URL shared by several venues is fetched once. It honours `robots.txt` (including `Crawl-delay`), waits at least `--delay-ms` (default 2000) between requests to a host, sends an identifying User-Agent, and with `--cache file.json` sends `If-None-Match` / `If-Modified-Since`. A site that blocks us, fails or redirects elsewhere is recorded in the run's `summary` and skipped; each site is stored in its own transaction. Pages are never kept, only the findings and a short evidence snippet. How a page becomes findings is a chain of readers (`index.mjs` `READERS`): each returns findings or `null` to pass. (1) `sources/theatre-site.mjs` `structuredReader` reads schema.org `Event` JSON-LD by code, at no cost: title, dates (only real, plausible calendar dates), the stage matched to the theatres sharing the URL (unmatched stages are kept with no venue), confidence 0.9 with both dates, 0.8 with a start, 0.5 with none. (2) `modelReader` runs only for `--method rules_model` with a budget above 0 and `ANTHROPIC_API_KEY` set, only on pages with no structured data, and stops when the run's spend reaches its budget. It uses the run's model (default `claude-haiku-5-5`; models with no price in `MODEL_PRICES` are never called) and prompt (default `prompt.md`), asks for JSON by schema, and keeps a date only when the page's own date text names a day and a month; confidence 0.7 with dates, 0.5 with date text only, 0.4 otherwise. (3) the stub records the page title, so a page nothing could read still shows up as "nothing read". The report says for each site whether it was read from structured data, by the model, or not at all, with the model's cost.

```sh
ANTHROPIC_API_KEY=... node supabase/scripts/crawl/index.mjs --venues <id>,<id> --method rules_model --model claude-haiku-5-5 --budget 0.50 [--prompt-file my-prompt.md]
```

## Local

Requires Docker and the Supabase CLI (`npx supabase ...` works).

```bash
npx supabase start        # local stack; applies migrations
npx supabase db reset     # re-apply migrations from scratch
npx supabase test db      # run tests/ (also runs in CI)
```

## Hosted project: apply new migrations before merging

Nothing applies migrations to the hosted project automatically. When a PR adds a file under `migrations/`, apply it **before** merging, or the deployed app will call tables, functions or buckets that don't exist yet (this happened with `entry_photos`: saving failed until the bucket was created).

```bash
# HOSTED_DB_URL = the hosted Postgres connection string (Session pooler). Keep it out of git,
# e.g. in .claude/settings.local.json. No `supabase link` needed, so it works in any worktree.
npx supabase db push --db-url "$HOSTED_DB_URL" --dry-run   # check the list first
npx supabase db push --db-url "$HOSTED_DB_URL"             # applies migrations not yet on the hosted project
```

Not `SUPABASE_DB_URL`: the admin scripts read that name and default to local Postgres when it is unset, so setting it globally would aim them at production. (Linking with `supabase link --project-ref <project-ref>` still works, but writes `supabase/.temp/`, which makes a later `supabase db reset` in that checkout pull the wrong image.)

Check what's applied with `npx supabase migration list`.

## Schema v1 (#12)

| Table | Read | Write |
|-------|------|-------|
| `profiles` | Everyone (anon: handle, display name, avatar, bio, link only) | Own row; created by a trigger on sign-up |
| `shows`, `venues` | Everyone | Signed-in users add; creators edit their own unverified rows; `verified` is set from the dashboard |
| `entries` | Everyone if `visibility = 'public'`, `status = 'logged'` (so `planned` ones are owner-only) and the owner's profile is visible to the caller (not private, or they're an approved follower: `profile_is_visible`); owner always | Owner only |
| `collections` (trips) | Everyone if the trip holds a public, logged entry and the owner's profile is visible to the caller (`collection_is_public`); owner always. Trips have no visibility of their own | Owner only |
| `entry_collections` | Everyone if the entry is public and logged; owner always | Owner, linking own entries to own collections |
| `follows` | Both people in it; anyone else sees accepted follows between two profiles visible to them | Follower inserts as themselves (status set by a trigger); the person followed approves; either deletes |
| `entry_likes`, `entry_comments` | Whoever can see the entry (`entry_is_open`: public, logged, profile visible to them); the entry's owner always | Signed-in users who can see the entry, as themselves. Unlike your own like; delete your own comment, or any comment on your entry. No edits |

| Storage `entry-photos` | Owner always; everyone else only while the entry using the file is public | Owner, into `{user_id}/` only. JPEG ≤ 5 MB, re-encoded on the device so it carries no EXIF/GPS |
| Storage `avatars` | Everyone, by public URL (bucket is public; only the owner can list) | Owner, into `{user_id}/` only. JPEG ≤ 2 MB, cropped square to 512 px and re-encoded on the device (no EXIF/GPS) |

New entries take `visibility` from `profiles.default_visibility` (default `public`) unless given.

`entries.status` is `planned` (a show you're going to; needs only a show and a date, no rating) or `logged` (the default). Logging a planned show updates the same row, so its trip and share links carry over. `venue_id` is optional on every entry. Tests: `tests/planned_entries_test.sql`.

A trip (`collections.kind = 'trip'`) needs a start and end date, and holds only entries dated within them: adding an entry outside the dates, shrinking the dates past an entry, or re-dating an entry outside its trip is rejected (`23514`). The `label` kind is kept for later; the app doesn't create labels. Tests: `tests/trips_v2_test.sql`.

## Auth (#13)

Sign-in with **Apple**, **Google** or **email + password**. Sign-ups are open (#149): Apple and Google create an account the first time, and link to an existing account with the same email (Supabase does that automatically). Email accounts confirm by a link or code (`templates/`).

Hosted project, once:

1. **Owner user:** Authentication → Users → Add user → Create new user, with your email, a password and "Auto confirm user" ticked. If you already invited yourself, set a password from the same screen instead.
2. **Sign-ups on:** Authentication → Sign In / Providers → "Allow new users to sign up" on, and Email → "Confirm email" on. Paste `templates/confirmation.html` and `templates/recovery.html` into Authentication → Emails.
3. **Google:**
   - In Google Cloud Console (free): APIs & Services → OAuth consent screen (External; add your email as a test user, or publish it, since basic scopes need no review), then Credentials → Create OAuth client ID → Web application.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase: Authentication → Sign In / Providers → Google: enable it, paste the client ID and secret.
   - **Google's own button and sheet (#179, #180)**, so Google names Stubbed and getstubbed.app instead of `<project-ref>.supabase.co`:
     - Web client → Authorised JavaScript origins: `https://getstubbed.app` (and `http://localhost:3000`). Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in Vercel to the web client ID, and `GOOGLE_CLIENT_SECRET` (server-only) to its secret, then redeploy.
     - Create an **iOS** OAuth client for bundle ID `app.getstubbed`. Put its client ID in `apps/ios/Config/Shared.xcconfig` (`GOOGLE_IOS_CLIENT_ID`) and the reversed ID (`com.googleusercontent.apps.…`) in `GOOGLE_IOS_URL_SCHEME`.
     - Supabase → Google → Client IDs: the web client ID, then the iOS one, comma-separated. Leave "Skip nonce check" off.
     - OAuth consent screen → Branding: app name "Stubbed", logo, home page and privacy links, authorised domain `getstubbed.app`; submit for brand verification so the name shows.
4. **Apple** (needs the Apple Developer Program, $99/yr):
   - In the Apple Developer portal → Certificates, Identifiers & Profiles → Identifiers: create an **App ID** with "Sign in with Apple" ticked, then a **Services ID** (e.g. `app.getstubbed.web`). The Services ID is the web client ID.
   - Configure the Services ID's Sign in with Apple: primary App ID = the one above; domain = `<project-ref>.supabase.co`; return URL = `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Keys → create a key with "Sign in with Apple", download the `.p8` (only downloadable once) and note its Key ID and your Team ID.
   - In Supabase: Authentication → Sign In / Providers → Apple: enable it, Client IDs = the Services ID, then the iOS bundle ID `app.getstubbed` (comma-separated). Leave Secret Key to the workflow below.
   - **The secret (a JWT signed with the `.p8`) expires after at most 6 months**, and hosted Supabase only takes the finished secret. The **Rotate Apple sign-in secret** workflow (`.github/workflows/rotate-apple-secret.yml`) makes a new one on the 1st of each month, checks it with Apple, saves it through the Management API and checks that Apple sign-in starts. Set it up once in GitHub → Settings → Secrets and variables → Actions:
     - Variables: `APPLE_KEY_ID` (the key's ID), `APPLE_SERVICES_ID` (e.g. `app.getstubbed.web`).
     - Secrets: `APPLE_PRIVATE_KEY` (the whole `.p8` file, including the BEGIN/END lines), `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens; it can change any project on the account, so keep it only here).
     - Then Actions → Rotate Apple sign-in secret → Run workflow, which sets the first secret. Run it again by hand after changing the key. If a run fails, GitHub emails you; the current secret still has about 5 months left.
     - Team ID (`AAW3XNQ6D3`) and the project ref are in the workflow file.
5. **Redirect URLs:** Authentication → URL Configuration: Site URL = the production URL; add `https://<production-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for local dev against the hosted project) to Redirect URLs.

Locally, use email + password: add a user in Studio (http://127.0.0.1:54323). Google and Apple aren't configured in the local stack.

## Public profile stats

`public_profile_stats(profile_id)` returns `shows`, `venues` and `cities` for a profile's **public** entries, whoever calls it (the owner too), so `/@handle` and iOS show the same numbers. Tests: `tests/profile_stats_test.sql`.

`own_profile_stats()` returns the same three numbers for the **signed-in user's own** logged entries, private ones included, plus `public_shows`. It only ever reads `auth.uid()`'s entries and isn't granted to `anon`. The Profile tab uses it (and says how many private shows `/@handle` leaves out). Tests: `tests/own_profile_stats_test.sql`.

## Follows

`follows (follower_id, followee_id, status)`, Hevy style. Insert the row to follow: a trigger sets `status` to `accepted` for a public profile and `pending` for a private one (clients can't set it). The person followed approves by updating `status` to `accepted` (the only change allowed); declining, cancelling, unfollowing and removing a follower all delete the row. Making a profile public approves its pending requests; making it private keeps existing followers.

Approved followers of a private profile see what everyone sees of a public one: its public, logged entries, trips, photos and stats. `profile_is_visible(profile_id)` is the check, used by the entries and trips policies. `follow_counts(profile_id)` returns `followers` and `following` (accepted only) for any profile, private ones too; the lists behind them are hidden on a private profile from anyone but its owner and approved followers. Tests: `tests/follows_test.sql`.

## Likes and comments

`entry_likes (entry_id, user_id)` and `entry_comments (id, entry_id, user_id, body)`, Hevy style. Insert to like or comment, delete to unlike or remove a comment; Postgres sets `created_at`. Only public, logged entries the caller can see take likes and comments (`entry_is_open(entry_id)`), so a private profile's entries are open to its approved followers only. Bodies are trimmed, 1–500 characters, and can't be edited. If an entry is made private, its likes and comments are hidden from everyone but its owner, and come back if it's made public again. `entry_reactions(entry_ids)` returns `likes`, `comments` and `liked` (by the caller) for a list of entries, counting only what the caller may see. Deleting an account removes its likes and comments. Tests: `tests/likes_comments_test.sql`.

## Account deletion

`delete_my_account(confirm)` deletes the caller's auth user when `confirm` is their handle (case, spaces and a leading `@` ignored). That cascades to their profile, entries, collections, links and events; shows and venues they added stay, with `created_by` set to null. Postgres can't delete Storage files, so clients first remove everything under `{user_id}/` in `entry-photos` and `avatars` through the Storage API, then call the function.

## Owner Insights (#131)

`own_insights(selected_year, today)` returns one JSON aggregate for the caller's
logged visits, including private entries. A null year selects all time; `today`
is the phone's calendar date for current streaks. Daily activity, month/year
counts, unique shows, repeat-show rankings, country totals, type totals and daily/weekly streaks share
the same ownership and performance-date rules. Current streaks span years;
longest streaks use the selected period. Neither this RPC nor
`own_insight_entries(selected_year, selected_day, selected_country,
selected_type, page_offset, selected_show)` is granted to anonymous callers. Both are
security-invoker functions and explicitly constrain `user_id` to `auth.uid()`.
The drill-down returns 100 visits per page. Country aliases are normalised by
`insight_country`; missing countries remain in overall counts. Public-profile
Insights and share-card rendering are separate features.

`repeated_shows` contains shows with at least two logged visits in the selected
period, grouped by catalogue show ID, sorted by visits descending then title and
ID. Equal counts share a competition rank (1, 1, 3). The optional `selected_show`
UUID narrows the visit drill-down while preserving the other filters. Existing
callers can omit it. Tests: `tests/repeat_show_insights_test.sql`.

## Merging duplicates

`scripts/merge.mjs` (Node 24+, psql, `SUPABASE_DB_URL`) folds a duplicate show or venue into the one to keep. Entries, trip links and likes follow; the duplicate is deleted in the same transaction.

```sh
node supabase/scripts/merge.mjs                                  # list likely duplicates
node supabase/scripts/merge.mjs --venues FROM INTO               # dry run: rolled back, counts printed
node supabase/scripts/merge.mjs --venues FROM INTO --apply       # do it
node supabase/scripts/merge.mjs --shows FROM INTO [--force] [--apply]   # --force merges across types
```


### Start a crawl from Backstage (#358)

Open `/app/backstage/crawl` as an admin, choose 1–10 theatres with what's-on
links, and select settings. The POST route creates a queued run through an
admin-only RPC and dispatches `catalogue-crawl.yml` on the selected branch.
The branch must contain that workflow. Runs and their detail pages refresh
while queued/running and link to the Actions log once started. Failed dispatches
are marked failed; Actions also marks failed/interrupted jobs. A force-killed
runner may require checking its Actions log before rerunning.

Owner setup: add `SUPABASE_DB_URL` and `ANTHROPIC_API_KEY` as GitHub Actions
secrets. Add `CRAWL_GITHUB_TOKEN` in Vercel: a fine-grained token for this
repository with Actions write permission. Do not put the model key in Vercel.
Apply the migration with `supabase db push` before using the form. Rules-only
runs do not need the model key. Budget is capped at $10 per manual run.
