# Stubbed: code and tech context

## Where context lives

Stubbed's context is split in two, on purpose:

| | **Google Drive: [Stubbed folder](https://drive.google.com/drive/folders/1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI)** | **This repo** |
|---|---|---|
| Holds | Product and project context: what we're building, for whom and why, direction, brand and voice, monetisation | Code and tech context: architecture, data model, stack, conventions, implementation decisions. The list of work (ideas, improvements, bugs) is GitHub issues |
| Read by | Any tool or person: design, marketing, copywriting, SEO, planning | Claude Code and anyone working on the code |
| Main docs | [Stubbed: Project Brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit), [Stubbed: Monetisation Ideas](https://docs.google.com/document/d/1LJanHT3SpBYSQB7SiRVaeX-1PFZTPQ-cBLXlSC50KAM/edit) | This file, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ANALYTICS.md`](docs/ANALYTICS.md), [`docs/CATALOGUE.md`](docs/CATALOGUE.md), `supabase/` |

**The rule:** if it's about *what* we build and *why*, it belongs in Drive. If it's about *how* it's built, it belongs here. Don't copy product context into the repo, or code detail into Drive.

The one exception is [`PRODUCT.md`](PRODUCT.md): a lean distillation of the brief for design work (the Impeccable skill reads it). It defers to the brief; when the brief's users, positioning, principles or constraints change, update PRODUCT.md to match.

- **Read the brief before planning or scoping work.** With the Google Drive connector, use `read_file_content` (brief: `1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak`; folder: `1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI`). Without it, ask the owner to paste the relevant section.
- **When code changes what the product does** (a feature ships, a product decision is made, the focus moves), update the brief too: edit it when the session has the Google Docs connector, otherwise tell the owner which section to change.
- Where the brief marks something **[Decision needed]**, ask the owner rather than assuming.

## Working agreements

- **Product name: Stubbed.** Use it in UI copy, the landing page and share-card wordmarks. Brand and voice live in the brief.
- **One paid tier, for advanced stats.** "Pro" (a configurable name) unlocks Show mix, earlier years and All time stats; everything else stays free (owner, 1–2 Nov 2026, epic #219). Build it to [`docs/PAYWALL.md`](docs/PAYWALL.md). Don't add other paid features, prices or upsells without the owner.
- **Public copy never mentions launch cities or regions**, or asks users where they go to the theatre. The product covers any theatre, anywhere.
- **Privacy:** every read and write path respects visibility and private profiles, with database tests around the privacy rules. Strip EXIF/GPS from any stored or served image.
- **Rules live in Postgres** (constraints, RLS, SQL functions), so the web and iOS apps can't drift.
- **Pages keep their state when you leave them.** The web app runs Next with `cacheComponents`, so a page you navigate away from is hidden, not unmounted: `useState` values survive and come back on return, while effects clean up and re-run. For every stateful client component, decide what the page should look like when someone returns after finishing the task (saved, created, added, deleted) and make that happen with `useFreshOnReturn` (`apps/web/src/lib/use-fresh-on-return.ts`). Keep unfinished drafts and selections for a stray tab tap. Never free something state still points at (e.g. `URL.revokeObjectURL` for a preview) in an effect cleanup, because that also runs when the page is hidden. Free it when it's replaced, removed or reset.
- **The iOS app's UI is native, not a copy of the web.** Same features, data and rules, but designed as a premium native iOS app (system grouped backgrounds, no drop shadows, native tab bar, Dynamic Type, SF Symbols). Rules: `apps/ios/CLAUDE.md`, "Design direction". General native-feel guidance and a pre-merge checklist: [`docs/IOS_NATIVE_GUIDE.md`](docs/IOS_NATIVE_GUIDE.md).
- Prefer small, reviewable commits and short summaries of what changed.
- When a requirement is ambiguous, ask rather than guess.
- Don't add dependencies, paid services or monetisation features without checking with the owner.
- Log implementation choices and why in `docs/DECISIONS.md`.
- **Ideas and direction come to Claude.** When the owner shares an idea, a bug, an improvement or a change of direction, however short, use the `idea` skill: it files a detailed GitHub issue (asking at most three quick questions) or updates the docs. `triage` expands issues the owner filed by hand (label `inbox`, the backup when Claude isn't available). `next` builds the top ready issue into one pull request.
- **GitHub issues are the one list of work.** Status labels: `inbox`, `needs-decision`, `ready`, `in-progress` (plus `needs-human` for the owner's hands). Area: `web`, `ios`, `database`. `P0` marks the rare urgent issue that jumps the queue. Priority is not a label: it's the order of epics on the "Stubbed roadmap" board's "Epics to prioritise" view (the owner drags them), and the order of sub-issues within each epic.
- **Every issue belongs to exactly one epic** (a GitHub sub-issue), and a lone task gets an epic of its own. Epics (label `epic`) are small, one outcome each (usually one to four issues), so the owner can prioritise them against each other; their order on the board decides what `next` builds first.

## Tech overview

Details and reasoning: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md). Where they disagree, the decisions log is newer.

### Stack
- **Monorepo, pnpm workspaces:** `apps/web` (Next.js App Router, TypeScript, Tailwind) on Vercel Hobby; `apps/ios` (SwiftUI, iOS 17+, `supabase-swift`, see `apps/ios/CLAUDE.md`); `supabase/` (migrations, pgTAP tests).
- **Supabase Free** for Postgres, Auth and Storage. Both apps talk to it directly; there is no custom API server. Vercel hosts only routes that need a server: the nearby-theatre lookup (`/api/photo/nearby`) and link-preview images (`/api/og/*`). The routes accept the web session cookie or an `Authorization: Bearer` token from iOS.
- **No cloud AI in the apps** (#273): photo detection (#281) and email import (#282) are gone. The catalogue crawler keeps its own key as a GitHub Actions secret only.
- **Share cards** are drawn on the device: Canvas 2D on web (`lib/share-card.ts`, `lib/share-card-trip.ts`), SwiftUI on iOS. Square 1080×1080. Card stats come from `entry_card_stats`.
- **Design system:** Footlight Sweep (the app icon's magenta, coral and amber on system greys); tokens and mapping in `docs/DESIGN.md`. The app and sign-in are always light for now.
- **Auth:** Apple, Google and email + password. Sign-ups are open (#149): email accounts confirm by a link or a 6-digit code (`supabase/templates/`, landing on `/auth/confirm`). Admins have `app_metadata.role = "admin"`; admin pages live under `/app/backstage`.
- **Running cost target:** $0/month on free tiers, plus the Apple Developer Program ($99/year).

### Data model (as built)
- `profiles`: id, handle (unique, can't be removed, reserved list in `is_reserved_handle`), display_name, avatar_url, bio, link, default_visibility (default `public`), is_private.
- `venues`: name, city, country, lat, lng, `osm_id` (dedupe key), verified, created_by.
- `shows`: title, type (musical, play, opera, dance, comedy, standup, concert, other), verified, created_by. No unique title; `search_shows` is the dedupe step.
- `entries`: user_id, show_id, venue_id (nullable), date, status (`planned` | `logged`), rating (nullable, half-star steps, none when planned), note, `photo_path` (one photo), visibility.
- `collections` (kind `trip` | `label`) and `entry_collections`: trips have required dates and hold only entries within them; labels are unused for now.
- `follows` (status `pending` | `accepted`), `entry_likes`, `entry_comments` (≤ 500 characters).
- `events` (write-only analytics: `entry_logged`, `card_shared`), `waitlist` (retired with the waitlist form; kept for the old list), `blocks` and `reports` (moderation; admins act at `/app/backstage/reports`).
- Storage: private `entry-photos` bucket (others can read a photo only while its entry is public), public `avatars` bucket.
- Key functions: `search_shows`, `search_venues`, `public_profile_stats`, `own_profile_stats`, `entry_card_stats`, `feed_entries`, `entry_comment_previews`, `search_profiles`, `follow_counts`, `profile_is_visible`, `delete_my_account`.
- Not yet: an `entry_photos` table for several photos per entry, and a per-user record of import runs. Both are open product decisions in the brief.
