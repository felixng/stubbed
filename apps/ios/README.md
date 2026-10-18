# Stubbed iOS app

Native **SwiftUI** app using [`supabase-swift`](https://github.com/supabase/supabase-swift) against the same Supabase project as the web app. Same users, same data, same row-level security. See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §5 and the 2026-10-14 entry in [`docs/DECISIONS.md`](../../docs/DECISIONS.md).

The Xcode project is set up (`Stubbed.xcodeproj`, supabase-swift, local and hosted config) with a placeholder screen. The screens below are still to build.

## Getting started

1. `supabase start` in the repo root (Docker Desktop must be running).
2. `cd apps/ios && scripts/dev run`, or open `Stubbed.xcodeproj` in Xcode and press Run.

Debug builds use local Supabase; Release builds use the hosted project. [`CLAUDE.md`](CLAUDE.md) has the full command-line loop, the config files and the project conventions.

## Getting it on your phone (TestFlight)

One-off setup in [App Store Connect](https://appstoreconnect.apple.com): create the app (bundle ID `com.felixng.stubbed`, team `AAW3XNQ6D3`) and an internal testing group with yourself in it. Sign in to Xcode with your Apple account (Xcode → Settings → Accounts).

Then, from `apps/ios`:

```sh
scripts/dev archive
```

It archives a Release build (hosted Supabase, `Config/Release.xcconfig`), signs it with automatic signing and uploads it. The build number is the current date and time, so each upload is new. It shows up in TestFlight after a few minutes of processing.

Before the first external testers or App Review: replace the placeholder icon (`scripts/make-app-icon.swift` draws it), fill in App Privacy in App Store Connect to match `Stubbed/PrivacyInfo.xcprivacy`, and finish the sign-in setup on #64.

## Scope of the first version

Replicates the web owner app (`apps/web/src/app/app`). The work is tracked in the epic [#80](https://github.com/felixng/stubbed/issues/80), one issue per area:

| Area | Issue |
|---|---|
| App shell: Home · Log · Profile tabs, design tokens, shared views | #63 |
| Sign in: Apple (native, `signInWithIdToken`), Google (Supabase OAuth in a secure browser sheet, back via `stubbed://auth-callback`), email + password | #64 |
| Welcome screen: handle, name, bio, link, avatar (and the Google avatar copy) | #65 |
| Log and edit an entry: show and venue search, date, half-star rating, note, trips, photo, visibility, planned entries | #66 |
| Log from a photo: EXIF date, nearby theatres, show suggestion (`/api/photo/*`) | #67 |
| Profile tab: header and counts, Diary (with Upcoming) / Trips, the entry screen, delete | #68 |
| Entry share cards: carousel, Stories / More / Download / Copy text / Copy link | #69 |
| Trips and labels: list, detail, create, edit, add and remove entries, delete | #70 |
| Trip recap share cards | #71 |
| Home feed: your shows and those of people you follow (`feed_entries`), paged | #72 |
| Find people (`search_profiles`), public profile with its calendar, public entry and trip screens | #73 |
| Follow / Requested / Following, follower and following lists, follow requests (rules in `supabase/README.md`, "Follows") | #74 |
| Likes and comments (`entry_likes`, `entry_comments`, `entry_reactions`; rules in `supabase/README.md`, "Likes and comments") | #75 |
| Edit profile, private profile, sign out, delete account (`delete_my_account`) | #76 |
| Universal links for `/e/:id`, `/t/:id` and `/@handle` | #77 |
| TestFlight build | #79 |

Left out: admin pages, and the landing / waitlist / FAQ / legal pages (the app links to the web). Import comes later, once the iOS approach is decided (#78).

## Notes for building it

- **Minimum iOS 17** (iPhone XS/XR, SE 2nd gen and later).
- Logic both apps need (validation, stats, search) lives in Postgres (`supabase/migrations`), not in Swift or TypeScript. Swift types from the schema are in `Stubbed/Generated/Database.swift`; regenerate with `scripts/dev types`.
- Every entry read must tolerate a **null venue** and **planned** entries (`status = 'planned'`, no rating).
- **Share cards are drawn natively** (SwiftUI `ImageRenderer`), matching the web designs in `apps/web/src/lib/share-card.ts` (1080×1080, three designs, transparent-background option). Their numbers come from `rpc("entry_card_stats", { entry_id })`.
- **Server routes** on the web app (`/api/photo/nearby`, `/api/photo/identify`): send the session's access token as `Authorization: Bearer <token>`.
- **Photos**: resize to 1600px and re-encode as JPEG on the device before upload, which drops EXIF/GPS (`apps/web/src/lib/photo.ts` has the sizes).
- **Google avatar**: the web copies the Google profile photo into the `avatars` bucket on first sign-in (no handle and no avatar yet). The app’s sign-in skips that callback, so do it on the device: take the profile image URL from the user’s Google metadata (`avatar_url` / `picture`), re-encode to 512px JPEG, upload, set `profiles.avatar_url`.
- **Analytics**: record `entry_logged` and `card_shared` in the `events` table, with the same props as the web (`apps/web/src/lib/analytics.ts`, `docs/ANALYTICS.md`).
- Sign in with Apple: add the app's bundle ID to Supabase → Auth → Apple → Client IDs. Google: create an iOS OAuth client and add it to the Google provider's authorised client IDs.
- Build and test on a Mac (Xcode, TestFlight). Avoid macOS GitHub runners on a private repo: they use free minutes at 10×.
