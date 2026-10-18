# Project Brief: Stubbed (repo: `stubb`)

This file explains what we're building, why, and in what order. Where something is marked **[Decision needed]**, ask the owner rather than assuming. Decisions, once made, are logged in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## 1. What we're building

A social theatre-logging app: Letterboxd for theatre, with Hevy/Strava-style shareability. People log the shows they see, rate them, optionally review them, group them into trips or festivals, and share good-looking cards and recaps (to Instagram etc.) with their handle and stats.

The owner is a solo indie builder doing this as a side project, so scope discipline and speed to a usable product matter more than completeness. Monetisation is deliberately deferred; do not build payment or paywall features yet.

## 2. Why this might work

- Theatregoers already "show off" their attendance on Instagram (ticket stubs, curtain shots, Playbills). This product moves that behaviour into a purpose-built place with structure (stats, diary, trips).
- Existing theatre diary apps appear to be small, indie and mostly iOS (e.g. Mezzanine Theater Diary, Stagely). No Letterboxd-scale winner was found. User numbers for these were not verified.
- Theatregoing clusters in a few big hubs (e.g. the West End, Broadway), so word of mouth can spread quickly even though the product covers any theatre.

## 3. Honest risks (design around these)

1. **Low frequency.** Theatregoers log maybe 5–30 times a year, unlike gym users who log several times a week. The app must be valuable between visits (stats, recaps, shareable cards), not just at logging time.
2. **Cold-start social graph.** An empty feed is useless. So the product must be good for a single user with zero followers.
3. **Show catalogue is the hard problem, not the app code.** There is no clean free dataset of what was playing where and when. Users must be able to add shows themselves.
4. **Niche audience.** Heavy theatregoers are a relatively small group worldwide. Build lean.

## 4. Core product principles

1. **Solo experience first.** The product must feel worthwhile with no social features. Social comes later.
2. **The share card is the acquisition loop, not the feed.** A well-designed image with the user's handle, show, rating and stats is how new users arrive.
3. **Low barrier to entry.** Logging a show should take under 20 seconds. Getting old history in (import) should be easy.
4. **One simple data model.** An entry has an optional rating and an optional note. "Add a review later" is just editing the entry. Do not split reviews into a separate model.
5. **Own the data.** Users can export their data (CSV). This is also a trust signal.
6. **Privacy-respecting by default.** Strip EXIF/GPS metadata from any publicly served image. Entries are private or public per user setting; default to a sensible, clearly shown option. **Decided: entries default to public** (see `docs/DECISIONS.md`).

## 5. Coverage

Any theatre, anywhere: no city or country limits in the product. Shows and venues not in the catalogue are added by users.

Internally, early effort (seed catalogue, marketing, outreach) focuses on the US and UK. This is not stated to users: public copy (landing page, waitlist, app UI) must not mention launch cities or regions or ask users where they go to the theatre.

## 6. Features and phasing

### Phase 0: Foundations
- Repo, CI, deploy pipeline, environments.
- Auth (email + at least one social login), user profile with unique handle.
- Database schema (see section 7) and migrations.
- Seed catalogue: a small, hand-curated set of US and UK venues and a starter list of shows. Design for the catalogue to grow.

### Phase 1: Web MVP, the solo experience
- **Log an entry:** search/select a show (or add a new one), pick venue and date, half-star rating (0.5–5), optional note, optional photo upload.
- **Tags / trips:** user-created labels or "trips" (e.g. "NYC Oct 2026", "Fringe 2027") that entries can belong to. Trips may have an optional date range.
- **Diary view:** reverse-chronological list of own entries with filters (year, tag/trip, rating).
- **Stats page:** shows seen per year/month, venues visited, cities, average rating, most-seen show, etc. Keep it simple and accurate.
- **Share cards:** generate a shareable image per entry (portrait format for Instagram Stories) containing show title, venue, date, rating, handle and one or two stats. Also a public, shareable entry page with good Open Graph previews.
- **Public profile page (opt-in):** handle, headline stats, recent public entries.
- **Mobile-first responsive web.** It must feel good on a phone browser, since this is used right after a show.

### Phase 2: Import and trip recap
- **Import via ticket confirmation emails:** user forwards or pastes confirmation emails; an LLM extracts show, venue, date and ticket details into draft entries for the user to confirm. Never auto-save without confirmation. **[Decision needed: forwarding address vs. paste-in vs. Gmail connect; start with paste-in]**
- **Import via photos:** read EXIF GPS and timestamp, match to a known venue and date, and suggest candidate shows. Present as suggestions only. Also consider programme/ticket photo OCR.
- **Trip recap card:** a shareable multi-entry summary (e.g. "7 shows in 5 days in NYC") with stats and handle.

### Phase 3: Social
- Follow / unfollow, follower/following lists.
- Social feed of followed users' public entries.
- Basic reactions or comments. **Decided: likes and comments, Hevy style** (see `docs/DECISIONS.md`).
- Basic moderation/reporting hooks.

### Phase 4: Year-end wrap and polish
- Annual wrap (shareable, multi-card).
- Show pages with aggregate ratings and "who you follow has seen this."
- Watchlist ("want to see").

### Later (explicitly out of scope for now)
- Android app. (A native SwiftUI iOS app is now planned about a month after the web validation build; see `docs/ARCHITECTURE.md`.)
- Any monetisation. Ideas are captured under "Monetisation ideas" below and in [`docs/MONETISATION.md`](docs/MONETISATION.md); none is scheduled.
- Public API.

### Ideas to explore (not scheduled, do not build without the owner's go-ahead)

These are captured so design choices now don't block them later. None of them belongs in Phases 0–1.

**Badges**
- **App-defined badges** are computed from a user's entries, never awarded by hand. Examples: "10 shows in a year", "Fringe 2027: 20 shows", "Seen *Operation Mincemeat* 5×", "Visited every West End theatre". They work for a solo user with zero followers, so they could arrive early (e.g. alongside the Phase 4 wrap). Each badge is also a share card.
- **User- or group-defined badges:** a group creates its own badge, either awarded by group admins or earned by a rule (e.g. "Minceuencer: seen *Operation Mincemeat* 3+ times"). Depends on groups.
- **[Decision needed]** App-defined only at first, or user-defined too? Who can create badges, and can people opt out of displaying them?
- Tentative model: `badges` (id, scope app|group, group_id nullable, name, icon, rule nullable) and `user_badges` (user_id, badge_id, awarded_at, awarded_by nullable). Rule-based badges are evaluated in SQL so web and iOS agree.

**Groups and communities**
- Motivating example: superfans of *Operation Mincemeat* who call themselves the **Minceuencers**. Users create a group (optionally tied to a show), manage membership, and get a group page with members' public entries, group stats ("Minceuencers have seen it 1,240 times") and group badges.
- Membership: owner, admin and member roles; join by invite link or request to join; leave and remove.
- Why it's interesting: fan communities around a single show are dense and already organised, which addresses the cold-start risk and suits the share loop.
- Costs: moderation (needs Phase 3 reporting hooks), plus abuse and impersonation handling. Comes after Phase 3 Social. **Very much later.**
- Tentative model: `groups` (id, slug, name, show_id nullable, created_by, visibility) and `group_members` (group_id, user_id, role, joined_at).

**Discord integration**
- **[Decision needed]** What it means. Options, cheapest first:
  1. **Post to a channel:** a user or group admin pastes a Discord channel webhook URL, and new public entries or share cards post there. No bot to host, so it stays free.
  2. **Log in with Discord:** Supabase Auth supports Discord OAuth out of the box.
  3. **Link a group to a Discord server:** e.g. sync membership or roles with a group. Needs a hosted bot, so it costs real effort; only worth it once groups exist.
- Pairs naturally with groups: many fan communities like the Minceuencers already live on Discord.

**Monetisation ideas**
- The owner is sceptical of subscriptions for this audience, so anything paid must sit on top of a complete free product: logging, diary, stats, share cards and CSV export stay free.
- Candidate paid features (comparable pricing in [`docs/MONETISATION.md`](docs/MONETISATION.md)):
  1. **Multiple photos per entry.** Free: one photo per entry. Paid: several. Rough price idea: £3/month or £15/year.
  2. **Import credits.** Email/photo import costs us real LLM spend, so a free allowance, then paid packs of import runs (one-off purchase, not a subscription).
  3. **Long-range insights.** Free stats cover the current and previous year; paid unlocks multi-year trends and comparisons (in the style of Bevel's long-term insights).
- Other ideas from earlier: ticket affiliate links, printed year-end wrap products.
- **[Decision needed]** Whether to charge at all, which features, subscription vs. one-off, and price points.
- Design so these don't need a rewrite later: store photos in a separate table rather than the single `entries.photo_url` column, and log each import run per user (`import_drafts` already does).
- Blockers to remember: Vercel Hobby is non-commercial only (see `docs/ARCHITECTURE.md`), and iOS digital purchases must go through Apple in-app purchase.

**Theatregoing calendar (habit heatmap)**
- A GitHub-contributions-style grid showing how often the user goes to the theatre, with each cell shaded by the number of entries in that period.
- Granularity toggle: **day** (classic 52×7 year grid), **week** or **month**. Because theatregoing is low-frequency (5–30 times a year), a daily grid will be mostly empty for most users, so week or month may be the better default. **[Decision needed]** Default granularity, and whether to offer all three.
- Tapping a cell lists that period's entries. Optional overlays: highlight trips (e.g. "NYC Oct 2026") or busy spells such as Fringe.
- Works for a solo user, makes the app worth opening between visits (risk 1), and doubles as a share card (e.g. "My 2027 in theatre"). Natural home: the Stats page or the Phase 4 annual wrap.
- No new data needed: computed by grouping `entries.date`. On public profiles, count only public entries.

## 7. Suggested data model (starting point, refine as needed)

- `users`: id, handle (unique), display_name, avatar, created_at, default_visibility
- `venues`: id, name, city, country, lat, lng
- `shows`: id, title, type (musical/play/opera/dance/comedy/other), created_by (null if seeded), verified boolean
- `entries`: id, user_id, show_id, venue_id, date, rating (nullable, half-star steps), note (nullable), photo_url (nullable), visibility, created_at, updated_at
- `trips` (or `collections`): id, user_id, name, start_date, end_date (nullable)
- `entry_trips`: entry_id, trip_id (many-to-many); tags can reuse this model or a sibling `tags` table
- `follows`: follower_id, followee_id, created_at (Phase 3)
- `import_drafts`: id, user_id, source (email/photo), raw_payload, parsed_json, status (Phase 2)

Notes:
- User-added shows and venues need dedupe/merge tooling eventually. Plan for fuzzy matching on title and venue.
- A "production" concept (a specific run/cast of a show) is deliberately omitted for now. Revisit if users want cast tracking.

## 8. Suggested tech approach

> Superseded by [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (proposed 2026-10-12): web validation build this week, iOS (shared backend) in about a month, $0/month on free tiers.

This is a suggested default; confirm with the owner before locking in **[Decision needed]**:

- Next.js (App Router) + TypeScript, deployed on Vercel.
- Supabase for Postgres, auth and file storage, with row-level security so private entries stay private.
- Share-card image generation server-side (e.g. Vercel OG / `@vercel/og` or similar).
- LLM-backed parsing for email import, behind a small, testable server function with human-in-the-loop confirmation.
- Keep the stack boring and cheap to run.

## 9. Quality bar

- Mobile-first; core logging flow works one-handed.
- Every write path respects visibility settings; add tests around privacy rules.
- Strip EXIF from any publicly served images.
- Accessible by default (contrast, labels, keyboard navigation).
- Sensible empty states, since early users will have few entries.

## 10. How we'll know if it's working

Suggested early signals (the owner can adjust):

- Of the first ~100 real users, what share log 3+ entries in their first month?
- What share generate or post a share card?
- Do users come back when they've seen a new show, without prompting?

If logging and sharing are both very low after a genuine push to theatre-heavy users, stop or pivot rather than building further.

## 11. Working agreements for Claude Code

- **Product name: Stubbed.** Use it in UI copy, the landing page and share-card wordmarks.
- **Current focus: the "NYC week" epic** (label `nyc-week`): public landing page + waitlist, and an owner-only app for logging, importing (email/photo), trips/labels and share cards. It deliberately pulls a few Phase 1–2 items forward in a minimal, owner-only form. Outside that epic, build Phase 0 then Phase 1 only unless told otherwise.
- **Pages keep their state when you leave them.** The web app runs Next with `cacheComponents`, so a page you navigate away from is hidden, not unmounted: `useState` values survive and come back on return, while effects clean up and re-run. For every stateful client component, decide what the page should look like when someone returns after finishing the task (saved, created, added, deleted) and make that happen with `useFreshOnReturn` (`apps/web/src/lib/use-fresh-on-return.ts`). Keep unfinished drafts and selections for a stray tab tap. Never free something state still points at (e.g. `URL.revokeObjectURL` for a preview) in an effect cleanup, because that also runs when the page is hidden. Free it when it's replaced, removed or reset.
- **The iOS app's UI is native, not a copy of the web.** Same features, data and rules, but designed as a premium native iOS app (system grouped backgrounds, no drop shadows, native tab bar, Dynamic Type, SF Symbols). Rules: `apps/ios/CLAUDE.md`, "Design direction".
- Prefer small, reviewable commits and short summaries of what changed.
- When a requirement is ambiguous or a [Decision needed] appears, ask rather than guess.
- Don't add dependencies, paid services or monetisation features without checking with the owner.
- Keep a short `docs/DECISIONS.md` log of choices made and why.
- Work is tracked as GitHub issues: one epic per phase (labelled `epic` + `phase-N`).
