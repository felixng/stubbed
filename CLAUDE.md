# Stubbed: code and tech context

## Where context lives

Stubbed's context is split in two, on purpose:

| | **Google Drive: [Stubbed folder](https://drive.google.com/drive/folders/1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI)** | **This repo** |
|---|---|---|
| Holds | Product and project context: what we're building, for whom and why, status, roadmap, ideas, brand and voice, monetisation | Code and tech context: architecture, data model, stack, conventions, implementation decisions |
| Read by | Any tool or person: design, marketing, copywriting, SEO, planning | Claude Code and anyone working on the code |
| Main docs | [Stubbed: Project Brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit), [Stubbed: Monetisation Ideas](https://docs.google.com/document/d/1LJanHT3SpBYSQB7SiRVaeX-1PFZTPQ-cBLXlSC50KAM/edit) | This file, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/ANALYTICS.md`](docs/ANALYTICS.md), `supabase/` |

**The rule:** if it's about *what* we build and *why*, it belongs in Drive. If it's about *how* it's built, it belongs here. Don't copy product context into the repo, or code detail into Drive.

The one exception is [`PRODUCT.md`](PRODUCT.md): a lean distillation of the brief for design work (the Impeccable skill reads it). It defers to the brief; when the brief's users, positioning, principles or constraints change, update PRODUCT.md to match.

- **Read the brief before planning or scoping work.** With the Google Drive connector, use `read_file_content` (brief: `1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak`; folder: `1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI`). Without it, ask the owner to paste the relevant section.
- **When code changes what the product does** (a feature ships, a product decision is made, the focus moves), update the brief too: edit it when the session has the Google Docs connector, otherwise tell the owner which section to change.
- Where the brief marks something **[Decision needed]**, ask the owner rather than assuming.

## Working agreements

- **Product name: Stubbed.** Use it in UI copy, the landing page and share-card wordmarks. Brand and voice live in the brief.
- **Monetisation is deferred.** Don't build payment or paywall features.
- **Public copy never mentions launch cities or regions**, or asks users where they go to the theatre. The product covers any theatre, anywhere.
- **Privacy:** every read and write path respects visibility and private profiles, with database tests around the privacy rules. Strip EXIF/GPS from any stored or served image.
- **Rules live in Postgres** (constraints, RLS, SQL functions), so the web and iOS apps can't drift.
- **Pages keep their state when you leave them.** The web app runs Next with `cacheComponents`, so a page you navigate away from is hidden, not unmounted: `useState` values survive and come back on return, while effects clean up and re-run. For every stateful client component, decide what the page should look like when someone returns after finishing the task (saved, created, added, deleted) and make that happen with `useFreshOnReturn` (`apps/web/src/lib/use-fresh-on-return.ts`). Keep unfinished drafts and selections for a stray tab tap. Never free something state still points at (e.g. `URL.revokeObjectURL` for a preview) in an effect cleanup, because that also runs when the page is hidden. Free it when it's replaced, removed or reset.
- **The iOS app's UI is native, not a copy of the web.** Same features, data and rules, but designed as a premium native iOS app (system grouped backgrounds, no drop shadows, native tab bar, Dynamic Type, SF Symbols). Rules: `apps/ios/CLAUDE.md`, "Design direction". General native-feel guidance and a pre-merge checklist: [`docs/IOS_NATIVE_GUIDE.md`](docs/IOS_NATIVE_GUIDE.md).
- Prefer small, reviewable commits and short summaries of what changed.
- When a requirement is ambiguous, ask rather than guess.
- Don't add dependencies, paid services or monetisation features without checking with the owner.
- Log implementation choices and why in `docs/DECISIONS.md`.
- Work is tracked as GitHub issues: one epic per area (labelled `epic`, plus `phase-N`, `nyc-week` or `ios`).

## Tech overview

Details and reasoning: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md). Where they disagree, the decisions log is newer.

### Stack
- **Monorepo, pnpm workspaces:** `apps/web` (Next.js App Router, TypeScript, Tailwind) on Vercel Hobby; `apps/ios` (SwiftUI, iOS 17+, `supabase-swift`, see `apps/ios/CLAUDE.md`); `supabase/` (migrations, pgTAP tests).
- **Supabase Free** for Postgres, Auth and Storage. Both apps talk to it directly; there is no custom API server. Vercel hosts only routes that need a server: AI calls (`/api/photo/identify`, `/api/import/email`), the nearby-theatre lookup (`/api/photo/nearby`) and link-preview images (`/api/og/*`). The routes accept the web session cookie or an `Authorization: Bearer` token from iOS.
- **AI** goes through `apps/web/src/lib/ai`. Default chain: `claude-opus-5-5`, then `claude-haiku-5-5`. Groq, Gemini and Cerebras are optional providers.
- **Share cards** are drawn on the device: Canvas 2D on web (`lib/share-card.ts`, `lib/share-card-trip.ts`), SwiftUI on iOS. Square 1080×1080. Card stats come from `entry_card_stats`.
- **Design system:** Footlight Coral; tokens and mapping in `docs/DESIGN.md`. The app and sign-in are always light for now.
- **Auth:** Apple, Google and email + password. Sign-ups are off (`enable_signup = false`). Admins have `app_metadata.role = "admin"`; admin pages live under `/app/admin`.
- **Running cost target:** $0/month on free tiers, plus the Apple Developer Program ($99/year) and small Claude API spend.

### Data model (as built)
- `profiles`: id, handle (unique, can't be removed, reserved list in `is_reserved_handle`), display_name, avatar_url, bio, link, default_visibility (default `public`), is_private.
- `venues`: name, city, country, lat, lng, `osm_id` (dedupe key), verified, created_by.
- `shows`: title, type (musical, play, opera, dance, comedy, other), verified, created_by. No unique title; `search_shows` is the dedupe step.
- `entries`: user_id, show_id, venue_id (nullable), date, status (`planned` | `logged`), rating (nullable, half-star steps, none when planned), note, `photo_path` (one photo), visibility.
- `collections` (kind `trip` | `label`) and `entry_collections`: trips have required dates and hold only entries within them; labels are unused for now.
- `follows` (status `pending` | `accepted`), `entry_likes`, `entry_comments` (≤ 500 characters).
- `events` (write-only analytics: `entry_logged`, `card_shared`), `waitlist` (fallback when Kit isn't configured).
- Storage: private `entry-photos` bucket (others can read a photo only while its entry is public), public `avatars` bucket.
- Key functions: `search_shows`, `search_venues`, `public_profile_stats`, `own_profile_stats`, `entry_card_stats`, `feed_entries`, `entry_comment_previews`, `search_profiles`, `follow_counts`, `profile_is_visible`, `delete_my_account`.
- Not yet: an `entry_photos` table for several photos per entry, and a per-user record of import runs. Both are open product decisions in the brief.
