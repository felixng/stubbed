# Product

<!-- impeccable:product-schema 1 -->

> A lean distillation for design work, shared by `apps/web` and `apps/ios`. The source of truth for product context is the [Stubbed: Project Brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit) on Google Drive; where they disagree, the brief wins. Status, roadmap, ideas and monetisation live only there.

## Platform

adaptive

One product on two platforms with the same features, data and rules. The web app (Next.js) follows the Footlight Coral system in `docs/DESIGN.md`. The iOS app (SwiftUI, iOS 17+) is designed as a premium native app; its rules are in `apps/ios/CLAUDE.md` and `docs/IOS_NATIVE_GUIDE.md`.

## Users

Regular theatregoers who already show off their attendance on Instagram (ticket stubs, curtain shots, Playbills) and see roughly 5 to 30 shows a year. They log a show soon after seeing it, often on their phone, often one-handed, and come back between visits for their diary, stats and trips.

Secondary audience: the people who see a user's share card or public page and arrive from there.

## Product Purpose

A social theatre-logging app: Letterboxd for theatre, with Hevy/Strava-style shareability. People log the shows they see, rate them, add an optional note and photo, group them into trips, and share good-looking cards with their handle and stats.

Success: early users log 3 or more entries in their first month, generate or post share cards, and come back after a new show without prompting.

## Positioning

A purpose-built home for a behaviour theatregoers already have, with structure Instagram lacks: a diary, stats and trips. The share card, not the feed, is the acquisition loop. Existing theatre diary apps are small and mostly iOS-only; no Letterboxd-scale product exists for theatre.

## Operating Context

- Logging is photo first: pick a photo, and the date comes from its EXIF, nearby theatres from its GPS, and the show from an AI suggestion that never overwrites a field the user has touched. "No photo? Fill in by hand" skips to the form.
- Saving a new entry opens its share screen. Cards are square 1080×1080, drawn on the device, posted to Instagram and elsewhere.
- Public pages (`/@handle`, `/e/[id]`, `/t/[id]`) are what a share recipient lands on, with server-drawn link previews.
- Import turns ticket emails and photos into drafts that the user reviews before anything saves.
- Usage is infrequent, so the app must be worth opening between visits, and must feel worthwhile with zero followers.

## Capabilities and Constraints

- **Terminology:** an *entry* is one show seen (or planned) on a date. *Logged* vs *planned* (dated after today; no rating). A *trip* is a hand-made group of entries within its start and end dates. *Diary* is the reverse-chronological list on the Profile tab.
- One simple data model: an entry has an optional half-star rating (0.5–5) and an optional note. A review is just an edited entry; a plan is an entry with status planned.
- Covers any theatre, anywhere. Public copy never mentions launch cities or regions, or asks users where they go to the theatre.
- Entries default to public; users can change their default, make any entry private, or make their whole profile private. Every surface respects this.
- Photos are re-encoded on the device; no EXIF or GPS in any stored or served image. One photo per entry for now.
- Sign-ups are closed; the landing page collects a waitlist.
- Monetisation is deferred: no payment, paywall or upsell UI.
- Not built yet, so never shown as working: CSV export, a stats page, diary filters, notifications, moderation, show pages.

## Brand Commitments

- Name: **Stubbed** in running text; wordmark **stubbed**, always lowercase. Instagram @stubbedapp; support support@getstubbed.app.
- Voice: terse and confident, sentence case, no emoji, no exclamation marks. Button labels are verbs. Numbers are digits.
- Ratings always appear as five stars, never a bare number.
- Sample handle: `@sillyelphaba`; never a real person's name.

## Evidence on Hand

- Real product screens on web and iOS; the `/design-system` page.
- Architecture and share-loop diagrams in `docs/img/`.
- No users, testimonials, user counts, press or reviews yet. Do not invent any, or claim figures for competitors.

## Product Principles

1. **Solo first.** Every surface must be worthwhile for one user with no followers; the Home feed always includes their own shows.
2. **The card is the growth loop.** Share cards and public pages get the most care, because that is how new users arrive.
3. **Logging takes under 20 seconds.** Suggest, never overwrite; the user always confirms.
4. **Valuable between visits.** Diary, stats, trips and recaps give a reason to open the app when there is nothing new to log.
5. **Privacy by default, the user owns their data.** Visibility rules are visible and honoured everywhere.

## Accessibility & Inclusion

Mobile-first, with the core logging flow usable one-handed. Accessible by default: contrast, labels, keyboard navigation on web, Dynamic Type on iOS. Sensible empty states, since early users have few entries.
