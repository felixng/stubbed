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

Source criteria, each queried separately (`SOURCES` in the script): an IBDB **show** ID (`P1219`, not production ID `P1218`); a premiere at one of the reviewed West End theatre buildings in `scripts/west-end-theatres.json` (`P4647` or the `P276` qualifier on `P1191`); or an English Wikipedia article on a stage work, either by form of creative work (`P7937`: play, musical, opera, ballet) or by class (`P31`: dramatico-musical work, ballet). These are catalogue selection criteria, not regions shown in the app. Coverage is limited by Wikidata's statements. Type mapping follows class/genre subclasses, prioritises opera and ballet over musical, treats comedic plays as plays, and excludes films, albums, TV series, songs and posters. Source duplicates prefer an IBDB ID, then the earliest known performance, then numeric Wikidata ID; skipped candidates are reported.

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
npx supabase link --project-ref <project-ref>   # once
npx supabase db push                            # applies migrations not yet on the hosted project
```

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
