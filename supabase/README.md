# Supabase

The shared backend for web and iOS: SQL migrations (tables, constraints, row-level security, functions) and database tests. The schema is the contract between the two apps.

```
config.toml   local stack config (`supabase init`)
migrations/   timestamped SQL migrations
tests/        pgTAP privacy tests
```

There is no seed catalogue: shows and venues are added through the app and by imports. Use `search_shows(q)` and `search_venues(q, near_lat, near_lng)` to find an existing row before creating one.

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

Owner-only sign-in with **Apple**, **Google** or **email + password**. Sign-ups are off (`enable_signup = false` here and in the hosted project), so all three only sign in existing users. Apple and Google get in when the account's email matches an existing user (Supabase links the identity automatically). With Apple, that means choosing "Share My Email": "Hide My Email" sends a relay address that matches no one.

Hosted project, once:

1. **Owner user:** Authentication → Users → Add user → Create new user, with your email, a password and "Auto confirm user" ticked. If you already invited yourself, set a password from the same screen instead.
2. **Sign-ups off:** Authentication → Sign In / Providers → "Allow new users to sign up" off.
3. **Google:**
   - In Google Cloud Console (free): APIs & Services → OAuth consent screen (External; add your email as a test user, or publish it, since basic scopes need no review), then Credentials → Create OAuth client ID → Web application.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase: Authentication → Sign In / Providers → Google: enable it, paste the client ID and secret.
4. **Apple** (needs the Apple Developer Program, $99/yr):
   - In the Apple Developer portal → Certificates, Identifiers & Profiles → Identifiers: create an **App ID** with "Sign in with Apple" ticked, then a **Services ID** (e.g. `app.getstubbed.web`). The Services ID is the web client ID.
   - Configure the Services ID's Sign in with Apple: primary App ID = the one above; domain = `<project-ref>.supabase.co`; return URL = `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Keys → create a key with "Sign in with Apple", download the `.p8` (only downloadable once) and note its Key ID and your Team ID.
   - Turn the `.p8` into a client secret (a signed JWT) with the generator in Supabase's "Login with Apple" guide.
   - In Supabase: Authentication → Sign In / Providers → Apple: enable it, Client IDs = the Services ID (add the iOS bundle ID here too when the app ships), Secret Key = the generated JWT.
   - **The secret expires after at most 6 months.** Apple sign-in on the web stops working until you generate a new one from the same `.p8`. Put a reminder in your calendar.
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
