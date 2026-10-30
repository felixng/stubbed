# Decisions

A short log of choices made and why, mostly about how things are built. Newest at the bottom. Product context (what and why) lives in the Google Drive [Stubbed folder](https://drive.google.com/drive/folders/1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI); see "Where context lives" in `CLAUDE.md`.

## Open decisions

| # | Question | Needed by | Notes |
|---|----------|-----------|-------|
| 1 | Confirm architecture in `docs/ARCHITECTURE.md` (Next.js on Vercel Hobby + Supabase Free) | Now | Proposed 2026-10-12 |
| 6 | Badges: app-defined only, or user/group-defined too? | When badges are scheduled | Idea; see the brief's "Ideas to explore" |
| 7 | Discord: channel webhook vs. Discord login vs. server/bot integration | When Discord is scheduled | Idea; tied to groups |
| 8 | Monetisation: charge at all? Which features (extra photos, import credits, long-range insights), subscription vs. one-off, prices | Before any paid feature | Ideas only; see [Stubbed: Monetisation Ideas](https://docs.google.com/document/d/1LJanHT3SpBYSQB7SiRVaeX-1PFZTPQ-cBLXlSC50KAM/edit) (Google Doc) |

## Log

### 2026-10-12: Project brief lives in `CLAUDE.md`
Saved the brief as `CLAUDE.md` so every Claude Code session loads it automatically. Phases are tracked as GitHub epic issues.

### 2026-10-12: Web validation build this week, iOS app in about a month, $0/month
The owner wants a quick web version to validate this week, then an iOS app sharing the same users and data, on free tiers only. This brings iOS forward from "Later". Proposed design: `docs/ARCHITECTURE.md`. Both clients talk directly to Supabase, with rules enforced by Postgres RLS. Vercel hosts only server-needing routes (share cards, public OG pages). No custom API server.

### 2026-10-12: Entries default to public
Owner's call, "for now". It maximises shareable content and supports the share-card acquisition loop. Safeguards: the visibility state is shown on the log form with a one-tap per-entry toggle; users can change their default to private in settings; RLS tests cover both states. Revisit if early users find it surprising.

### 2026-10-12: iOS app is native SwiftUI
Owner prefers native SwiftUI over Expo/React Native. Consequence: no shared client code, so logic both apps need (validation, stats, search) lives in Postgres (constraints, RLS, SQL functions). The schema is the contract; Swift types are generated with `supabase gen types --lang swift`. Repo layout: see the monorepo entry below.

### 2026-10-12: This week is "NYC week"
The owner has ~3–4 sessions of 2 hours this week. Focus: (1) a great public landing page with mockups and a waitlist, (2) an owner-only hidden login to log their NYC shows (manual, from ticket emails, or from photos), group them into a trip, and share an excellent Instagram card at the end of the week. Public sign-up is off. This pulls email/photo import and the trip recap card forward from Phase 2, in a minimal owner-only form. Tracked in the NYC week epic.

### 2026-10-12: Name, Claude API and NYC-week dependencies approved
- Product name: **Stubbed**.
- The Claude API is approved for email/photo import (paid, small; spend limit set in the Anthropic console).
- Approved dependencies for NYC week: Tailwind CSS, `@supabase/supabase-js`, `@supabase/ssr`, `exifr`, Anthropic SDK (plus Next.js/React/TypeScript tooling). Anything beyond this list still needs a check.
- The NYC show list will come from the owner once the web app is ready. Seed data covers venues plus a few long-running shows; other shows get added through the app.

### 2026-10-12: Monorepo with pnpm workspaces
The owner wants the iOS app, the web app and the landing page in this one repo. Layout: `apps/web` (Next.js: landing at `/`, owner app at `/app`, share cards), `apps/ios` (SwiftUI, later), `supabase/` (the shared backend), `packages/` (only if shared JS is ever needed). pnpm workspaces only, no Turborepo/Nx. The landing page is part of the web app, not a separate app, so it shares the domain, design tokens and the share-card route. Vercel root directory: `apps/web`.

### 2026-10-12: Any theatre, no city limit; US/UK focus is internal only
The owner dropped the London/NYC/Edinburgh launch scope: the product covers any theatre, anywhere. Early effort (seed catalogue, marketing) still focuses on the US and UK, but users aren't told this. Public copy doesn't mention launch cities or regions, and the waitlist doesn't ask for a city.

### 2026-10-12: Design system "Interval"
The owner's design system artifact (https://claude.ai/artifact/UZXAQQuAaRmwtUDhYPE36U) replaces the earlier cream/curtain-red/Fraunces palette. It is dark first, with a single lime accent for the one primary action, Bricolage Grotesque + DM Sans, and a 4px spacing scale. Tokens live in `apps/web/src/app/globals.css`, React components in `apps/web/src/components/ui/`, and the mapping in `docs/DESIGN.md`.

### 2026-10-12: No share button on the waitlist success state
The owner dropped the "share with a theatre friend" button from #10. The success state is just the confirmation message. The share card remains the acquisition loop.

### 2026-10-12: Design system "Footlight" (native first)
The owner moved the design system to iOS-native first: "Footlight" (https://claude.ai/artifact/Pw3EwEHyfYxzshKVTFQAzc) replaces "Interval". Tokens are named after the iOS semantic colours, type is the system font (SF Pro) instead of Google Fonts, buttons and chips are capsules, and the page follows the visitor's light/dark setting instead of being dark-only. The wordmark is now `STUBBED` in capitals. The SwiftUI files in the artifact's `ios.md` are the native counterpart to `apps/web/src/components/ui/`. Mapping: `docs/DESIGN.md`.

### 2026-10-12: Design system "Footlight Coral" and new landing copy
The owner moved Footlight from the lime tint to coral: "Footlight Coral" (https://claude.ai/artifact/2r1EvQn2286Y29ZJNgPfP6) replaces the earlier Footlight artifact. Same token names, plus `tint-text` (brand colour as text, since coral fails contrast as text on light), `glow` (hero halo) and three shadows (`shadow-sm`, `shadow-lg`, `shadow-btn`); light mode sits on a soft peach ground. The landing page follows the owner's "Footlight Coral" landing design (https://claude.ai/artifact/GPberFRRTagnixyiXy3euN): pill-shaped email field, glow halo behind the phone and four feature cards, keeping the existing beta pill, feature chips and footer. The eyebrow reads "For the theatre regulars" (owner's wording).

### 2026-10-12: Schema v1 details (#12)
- `entries.venue_id` is required, like `show_id` and `date`, so stats ("venues visited", cities) stay accurate.
- New entries and collections take `visibility` from the profile default when the client doesn't send one (a trigger), so web and iOS can't drift.
- Clients can't set `verified` on shows or venues (column grants); the owner verifies from the dashboard. Shows have no unique title constraint (*Macbeth* is a play and an opera); `search_shows` is the dedupe step. Venues dedupe on `osm_id`.
- Logged-out visitors read only a profile's handle, display name and avatar. Signed-in users can also read `default_visibility`, since grants are per column; it reveals nothing their public entries don't.
- A trip's entry links are public only when both the entry and the trip are public, so a public trip page never lists private entries.

### 2026-10-12: Wordmark option B (lowercase)
The owner picked option B from the wordmark options board: `stubbed` in lowercase, SF Pro Display heavy (800), tracking -0.045em, in `label`. It replaces the capitals wordmark in both Footlight systems (lime and Coral), the landing and app-screen designs, the web `Wordmark` and `FLWordmark`. The product name in running copy stays "Stubbed", and screen readers hear "Stubbed". No colour or other token changed.

### 2026-10-12: Sign-in is Google + email and password; sign-ups stay off
Owner's call (#13): no magic link or emailed code. The login page offers "Continue with Google" and an email + password form. Sign-ups remain off during NYC week, so both only sign in accounts created in the Supabase dashboard; Google signs into the account whose email matches. Not depending on login emails also sidesteps Supabase's built-in sender limit of a few emails an hour. Apple sign-in is still needed before the iOS app ships (App Store rule 4.8). Password reset by email comes with public sign-up.

### 2026-10-12: Logging is photo first (#14)
Owner's call. The log form starts with a photo and fills in what it can: the date from the photo's EXIF, nearby theatres from its GPS (OpenStreetMap), and the show and venue from Claude (photo + nearby theatres + date, with web search). Anything it can't work out stays blank for the user. High or medium confidence fills empty fields; low confidence only shows a "Maybe X?" chip. Detection never overwrites a field the user has touched. With no date in the photo, the date defaults to today. "No photo? Fill in by hand" skips straight to the form. This pulls the single-photo part of #18 into #14; #18 keeps batch import of several photos, reusing the same routes.
- The original photo never leaves the phone: it's re-encoded to JPEG on the device (no EXIF/GPS), then uploaded to the private `entry-photos` bucket. Others can read a photo only while its entry is public.
- Claude calls go through `/api/photo/identify` (`claude-opus-5-5`, effort medium, web search up to 3 uses, server-side refusal fallback on). Until `ANTHROPIC_API_KEY` is set it returns 503 and the form simply skips the suggestion.

### 2026-10-13: App and sign-in are always light; landing menu links to sign-in
Owner's call: `/app` and `/login` now stay light whatever the device setting, like the landing page (`data-theme="light"`). Dark mode can come back later; the tokens are unchanged. The landing page gets a hamburger menu next to the beta pill whose only item is "Sign in", so the login page is no longer unlinked. Sign-ups stay off, so the link reveals nothing.

### 2026-10-13: AI calls go through `lib/ai`, Groq first
Owner's call. All model calls go through `apps/web/src/lib/ai`: a feature sends a provider-neutral request (system prompt, text/image parts, JSON Schema, optional web search) and gets back the first acceptable answer from an ordered chain of models. Providers live side by side (`groq.ts`, `anthropic.ts`); adding one is a new file plus an entry in the registry.
- Default chain: Groq (`meta-llama/llama-4-scout-17b-16e-instruct`, vision + JSON Schema) then Claude (`claude-opus-5-5` with web search). Called with `fetch`, so Groq adds no dependency.
- Swap or reorder models with `AI_MODELS` or a per-task `AI_MODELS_<TASK>` (e.g. `AI_MODELS_IDENTIFY="anthropic,groq"`); providers without a key are skipped.
- A model that errors, declines, or isn't accepted by the feature hands over to the next. Photo identify only accepts a named show at medium or high confidence, since Groq's vision models can't search the web; otherwise Claude gets a go. The whole chain shares one time budget so the fallback fits in the route's limit.
- Gemini and Cerebras added as optional providers (fetch only, no SDK), not in the default chain; name them in `AI_MODELS` to try them. Gemini (`gemini-flash-latest`) takes images and uses Google Search grounding. Cerebras (`gpt-oss-120b`) is text only, so requests with images skip it; it's meant for text tasks like pasted ticket emails.

### 2026-10-13: Bulk import tool, testing version (#17, #18)
Owner's call: one import screen (`/app/import`) for both sources, built for desktop testing first, on shared logic that a mobile-first import can reuse.
- **Emails:** upload exported files (.eml, .mbox, saved .html, .txt) or paste one. MIME is decoded on the device (`lib/import/email-parse.ts`); only the readable text goes to `/api/import/email`, one email per call, a few at a time. Attachments are never sent. The email text isn't stored or logged (token counts only). Extraction goes through `lib/ai` like photo detection (task `email`, low effort, no web search), so `AI_MODELS_EMAIL` picks its chain.
- **Photos:** several at once. Each runs through the #14 pipeline, now shared in `lib/import/photo-pipeline.ts`. Photos from the same visit (same date, within 5 hours, within 250 m) become one draft and one identify call with up to 4 photos (`/api/photo/identify` now accepts several).
- **Review:** every source is listed with what was read from it. Each show becomes a draft with the read values, confidence and reason, and editable show, venue, date, rating and note. Same rule as the log form: low confidence never fills a field, it offers "Maybe X?". A booking and its reminder merge into one draft. Drafts matching an entry already in the diary are flagged. Nothing is saved until "Save"; entries take the profile's default visibility, and can be added to trips and labels in one go.
- Drafts live in page state for now; `import_drafts` comes with the mobile flow if needed.
- Unit tests use Node's built-in test runner (`pnpm test`, also in CI), so no new dependency. They cover email parsing, photo grouping, draft merging and the extraction mapping, with synthetic fixtures. Redacted real confirmation emails can be added under `apps/web/test/fixtures/emails/`.
- **Choosing the AI provider:** the import screen has a model picker (owner testing). The default, **Compare all providers**, sends each email or photo visit to every provider with an API key at once (photos skip text-only ones) and shows the answers side by side with timings and the fields they disagree on. Drafts come from the best answer (confident first, then the default chain's order), and "Use this" switches a source's drafts to another provider's answer. It costs one call per provider per source. The other options: the default chain with fallback, or one provider (optionally a model id) with no fallback. Each source and draft shows which model read it. The choice is remembered in the browser.

### 2026-10-13: Groq and Cerebras pick their default model from what they serve
Found in the owner's first real import: Groq's default (Llama 4 Scout, shut down 17 July 2026) and Cerebras's new default (Gemma 4 31B, off the shared API since 3 September 2026) both returned "model not found". Providers retire models every few months, so a hardcoded default goes stale. Groq and Cerebras now keep a short preference list (Groq: `qwen/qwen3.8-27b`, then `qwen/qwen3.6-27b`; Cerebras: `qwen-3.8-27b`, all vision models) and use the first one their `/models` endpoint lists for the key, checked every 10 minutes; if the list can't be read, the first preference is used. A model named explicitly (`groq:…`) is used as is. The import tool's picker suggests model ids from those lists, and failed calls show the provider's error message. This replaces the Gemma 4 decision and the Groq model named in the `lib/ai` entry. Gemini's 429 in the same run was the key's quota, not code; at the owner's request Gemini now defaults to `gemini-3.8-flash`, which their free-tier key can use.

### 2026-10-13: Compare mode runs several Claude models side by side
Owner's call, to see how fast and accurate each Claude model is. In the import tool's compare mode Claude gets one column per model: Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1 (the list is `COMPARE_MODELS` in `lib/ai/anthropic.ts`). Every column gets the identical request (same prompt, photos, effort and web search) and shows its own round-trip time. Haiku 5.5 has no server-side refusal fallback and takes the basic web search tool, so its requests leave the fallback out and use `web_search_20250305`; the others are unchanged. Cost: a photo visit is now up to 7 calls, Fable being the priciest; the email route's per-user limit goes to 1,000 calls per 10 minutes.

### 2026-10-13: Photo identify works from venue and date first; compare Opus and Haiku only
Owner's call. The identify prompt now follows the owner's order: (1) take the venue and date (nearby theatres plus the photo's date), (2) search what was playing there that day for a short list of shows, (3) match the photo's set against that list, searching production photos when it helps. (4) A title, programme or Playbill readable in the photo always wins; the venue search then only picks the theatre. The reason starts with what settled it. Providers without web search are told to skip searching, as before. The import tool's compare mode now runs only Opus 5.5 against Haiku 5.5: Sonnet and Fable are dropped, and so are Groq, Gemini and Cerebras (still pickable one at a time, and still in the default chain where configured). Compare mode includes only providers that list `compareModels`.

### 2026-10-13: Faster nearby-theatre lookup; three visits at a time; photo thumbnails
Production logs showed every nearby lookup failing (public Overpass servers timing out or returning 504 from Vercel), costing about 14 seconds per photo visit before identify even started, and leaving Claude with no candidate theatres. Now:
- The Overpass mirrors are asked at once and the first answer wins, with a 4-second limit. Nominatim's theatre search (no key needed, like Overpass) runs alongside as the fallback when every Overpass server fails. Nominatim calls are spaced about a second apart, as its usage policy asks. Results are cached per ~100 m square for the server instance.
- The client checks saved venues near the photo at the same time, so a theatre already in the catalogue is found even when OpenStreetMap is down.
- The import tool runs three photo visits (and three emails) at a time; with only two compared models, that's safe for rate limits.
- Each photo visit in "What we read" shows its photos as thumbnails (tap to open full size), so it's clear which photo the results are about.

### 2026-10-13: The log form never locks; the show arrives as a suggestion
Owner's call, for logging on a trip: replaces "Lock the log form while the photo is checked". Picking a photo fills the date at once and the venue within about a second (one theatre in range fills it; several show as tap-to-pick chips, nearest first). Every field and Save stay usable while the AI works out the show, shown as a small "Working out the show from your photo…" pill. When the answer arrives it fills only fields the user hasn't set: a different show or venue from the user's pick, or a low-confidence guess, appears as a chip ("Photo suggests…", "Maybe…?") and never replaces a choice. Saving first drops the late answer. After 20 seconds the pill gives up quietly ("Couldn't work out the show"). A hard cap on the whole process was rejected: the correct answers that need a web search take 6–17 seconds.

### 2026-10-13: The nearby-theatre radius follows the photo's GPS accuracy
Owner's question after a photo at the National Theatre listed 5 nearby theatres (mostly the NT's own auditoriums). A smaller fixed radius was rejected: indoor photos are often 20–50 m off and Broadway houses can be 30 m apart, so the right theatre would sometimes drop off the list. Instead the radius comes from the accuracy the phone records with the photo (EXIF `GPSHPositioningError`): about 2.5× the stated error, between 60 m and 150 m, and the full 150 m when the photo doesn't say. A group of photos uses its least accurate photo. Precise fixes give shorter lists, and more often a single theatre the log form can fill straight away.

### 2026-10-13: Default AI chain is Claude Opus 5.5, then Claude Haiku 5.5
Owner's call: `DEFAULT_CHAIN` in `lib/ai/index.ts` is now `anthropic:claude-opus-5-5,anthropic:claude-haiku-5-5`; Groq is no longer first and the other providers are out of the default. Haiku runs when Opus errors, declines, or (for photo identify) can't name the show at medium or high confidence. Groq, Gemini and Cerebras keep working when named in `AI_MODELS` or picked on the import screen. No `AI_MODELS` overrides are set in Vercel, so this applies to the log form and the import tool's "Default chain" option.

### 2026-10-13: Admin role; import model comparison is admin-only
Owner's call. An admin is a user whose Supabase Auth `app_metadata.role` is `"admin"`. Only the service role can write `app_metadata` (users can't, unlike `user_metadata`), and it rides in the session token, so the check needs no table or migration. Make an account admin in the Supabase SQL editor, then sign out and in again so the token picks it up:
`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '<owner email>';`
- Admin pages live under `/app/admin` (index: `/app/admin`; model comparison: `/app/admin/import`). Non-admins get a 404 there, from the proxy and again from the page itself.
- Everywhere else an admin sees exactly what any user sees, so the owner can test the real flow. Nothing outside `/app/admin` links to it; open it by URL.
- `/app/import` stays for everyone, without the model picker or comparison: it uses the default AI chain, like the log form.
- Server side, `/api/ai/providers` and the `model` option on `/api/import/email` and `/api/photo/identify` are admin-only (403 otherwise).

### 2026-10-13: Share cards are drawn on the phone; sharing opens after logging
Owner's call: sharing should feel like Hevy. Saving a new entry now opens a share screen (`/app/entries/[id]/share`) with a swipeable carousel of card designs and three actions: **Stories** (the share sheet with only the image, where Instagram offers Stories), **More** (the share sheet with the image and a line of text) and **Download**. Entries also get a Share button. On browsers that can't share files (most desktops), Stories and More save the image instead. A web page can't post straight to an Instagram story; only native apps can, so the iOS app can add a direct button later.
- Three designs to start, from the owner's "Share cards" canvas (https://claude.ai/artifact/JBrH9jzd4ke4YtpRLQWhPC): "Square · single, full photo", "Hevy-style · photo" (show of the year, Nth visit to the venue, rating) and "Hevy-style · photo, seen before" (times seen instead of venue visits). 1080×1080 PNG with rounded corners.
- Cards are drawn in the browser with Canvas 2D (`apps/web/src/lib/share-card.ts`), not by a server route as `docs/ARCHITECTURE.md` suggested. The system font (SF Pro on iPhone) matches Footlight, the private photo never goes to a server, it costs nothing and needs no new dependency. A server-rendered card is still needed later for Open Graph previews on public entry pages.
- Stats count the owner's entries up to and including this one (by date, then by when logged), so an old entry's card shows what was true then. No rating drops the rating column; no photo uses a dark ground with a coral glow.
- Follow-up from more Hevy screenshots: one full-width card at a time (no peeking), a **Background** toggle that drops the photo and shading for a transparent PNG with shadowed text (to lay over your own story photo; the preview shows a checkerboard), a sideways-scrolling action row and **Copy text**. Hevy's "Workout link" equivalent waits for public entry pages; no X/Twitter button for now.

### 2026-10-13: Landing page SEO basics
The landing page gets a canonical URL, full Open Graph/X tags with a generated 1200×630 preview image (`opengraph-image.tsx`), `WebSite` structured data, a sitemap, and a `Sitemap:` line in `robots.txt`. The public origin comes from `NEXT_PUBLIC_SITE_URL`, falling back to Vercel's production domain. `/login` is no longer disallowed in `robots.txt`: it's linked from the landing menu, and crawlers must fetch it to see its `noindex`. The preview image uses the regular-weight Geist that ships with `next/og`; a heavy font file would match the wordmark better.

### 2026-10-13: Stubbed's Instagram account is @stubbedapp
Owner's info. The share screen's caption reads "Share your show · Tag @stubbedapp" (like Hevy's "Tag @hevyapp"), and the copied/shared text ends "Logged on Stubbed @stubbedapp". The handle is not drawn on the cards themselves; they carry the `stubbed` wordmark and the user's handle.

### 2026-10-13: Public profile at /@handle
Modelled on Hevy's profile (owner's screenshots). `/@handle` (rewritten to `app/u/[handle]`) shows a cover strip of up to five recent public photos, avatar, handle and display name, three stats (shows, theatres, cities), a month calendar, and public entries as cards, newest first.
- **Opt-in is the handle** (owner's call): a profile is live once a handle is set in `/app/profile` and off when it's cleared. No separate switch. *Superseded below by "Private profiles, Hevy style".*
- **Public entries only, for everyone**, including the owner looking at their own page. The page reads with the publishable key and no session (`createPublicClient`), so RLS can't return private rows. Stats come from `public_profile_stats(profile_id)` in Postgres, so iOS gets the same numbers.
- **Month calendar** (owner's go-ahead for this slice of the "theatregoing calendar" idea): one month at a time, Monday first, show days filled in coral and linked to their entry. It opens on the month of the latest show, since most months have none. Granularity toggles and heatmap shading are still undecided.
- Rendered per request, not cached, so an entry made private disappears straight away. Its own `og:image` waits for the server-rendered card (share cards above are drawn on the phone); until then it inherits the site's.

### 2026-10-13: Landing page content for search and AI answers (GEO)
The landing page was too thin for search engines or AI assistants to describe (171 words, one heading level). Added, all worded for the private beta (no open sign-up, no prices, no dates):
- A "What is Stubbed?" section in plain, quotable sentences, a visible "What you can do" heading over the feature cards (now h3, plus "Bring your history" and "Public or private"), and a "Questions" FAQ. The FAQ list (`components/landing/Faq.tsx`) also feeds `FAQPage` structured data and `/llms.txt`, so they can't drift.
- Structured data is now a graph: `WebSite`, `Organization`, `WebApplication` (no offers, since sign-ups aren't open) and `FAQPage`. Add `sameAs` links to `Organization` once there are social accounts.
- Title 56 characters, description 158, the hero phone image has alt text.
- The page is ~650 words. An audit tool asked for 800; padding a landing page reads worse to people and AI, so it stops there.
- FAQ commitments to check: "logging your shows and getting your own data out will always be free" (from the ground rules in [Stubbed: Monetisation Ideas](https://docs.google.com/document/d/1LJanHT3SpBYSQB7SiRVaeX-1PFZTPQ-cBLXlSC50KAM/edit)), CSV export ("you'll be able to"), and "a native iPhone app is planned".

### 2026-10-13: Terms of Service and Privacy Policy
Added `/terms` and `/privacy`, linked from the footer, plus a privacy link under the waitlist form. Written to cover the UK (UK GDPR, DPA 2018, PECR, Consumer Rights Act, Online Safety Act), the EU (GDPR, consumer law, DSA notice and action) and the US (CCPA/CPRA and other state laws, CalOPPA, COPPA, DMCA notice). Choices: minimum age 16 everywhere (simplest age that works for GDPR consent across the EU and keeps clear of COPPA); governing law England and Wales, with consumers keeping their local mandatory protections and courts; essential cookies only, so no cookie banner. Contact email is support@getstubbed.app. The owner's call: leave out the operator's legal name and postal address for the private beta; UK/EU GDPR and the UK E-Commerce Regulations expect both, so add them to `apps/web/src/lib/legal.ts` before public launch (the pages show them once set). Not legal advice: have a lawyer review before public launch. Update the policy in the same change whenever a feature starts collecting or sharing something new.

### 2026-10-13: The entry page is the share screen
Owner's call: sharing is first class. The separate `/app/entries/[id]/share` page is gone; the entry page (`/app/entries/[id]`, where logging lands with "Logged. Share it?") opens with the card carousel and action row. **Edit** is now one of the actions in that row, after Copy text. Below the actions: the entry's type, full date, note, trips and visibility, then Delete. Replaces the "Share button on the entry page" part of "Share cards are drawn on the phone".

### 2026-10-13: Profile onboarding at /welcome
Owner's call: a signed-in user with no handle is sent to `/welcome` before any `/app` page, to set their name (required), handle (required), a bio (optional, ≤ 160 characters) and one link (optional, e.g. Instagram; `https://` is added to a bare `instagram.com/you`). `profiles` gains public `bio` and `link` columns (migration `20261013130000_profile_onboarding.sql`); the link must be an http(s) URL in Postgres too, so it is safe to render as a link later. The proxy does the check; once a handle exists it remembers that in an `httpOnly` cookie holding the user id, so later navigations skip the profile lookup. The handle field checks availability as it's typed, and the save still catches a clash. No reserved-handle list yet.

### 2026-10-13: Private profiles, Hevy style
Owner's call, after looking at how Hevy does it. Replaces "opt-in is the handle":
- **Everyone has a handle and a profile page.** The handle is set at `/welcome` and can be changed but not removed (a trigger refuses setting it back to null).
- **Private profile switch** in `/app/profile` (`profiles.is_private`, default off). A private `/@handle` shows only the handle, name, avatar, bio and link, with "This profile is private" and no stats, calendar, cover photos or entries, and isn't indexed. Enforced in RLS, not just on the page: other people can't read a private profile's entries or trips (even public ones), their trip links or their photos. Per-entry visibility and the default visibility are unchanged, like Hevy's per-workout setting.
- `/app/profile` also edits bio and link, and `/@handle` shows them.
- **Follows later (Phase 3).** Then "private" becomes "approved followers can see it", as in Hevy, via follow requests.

### 2026-10-13: Profile photos
Users add, change or remove a profile photo by tapping the avatar on `/welcome` (optional) or `/app/profile`. It saves on its own as soon as it's picked, separate from the rest of the form. The photo is cropped to the centre square and re-encoded to a 512 px JPEG on the device, which strips EXIF/GPS, then uploaded to a new **public** `avatars` bucket at `{user_id}/{timestamp}.jpg` (migration `20261013150000_avatars.sql`); `profiles.avatar_url` holds its public URL. Public because avatars are public anyway (a private profile still shows its avatar), so no signed URLs. A new file name per upload means caches never show the old photo; the old file is deleted after the profile points at the new one. No in-app cropper yet.
- **Google photo by default.** On first sign-in with Google (no handle and no avatar yet), the auth callback copies the Google profile photo (512 px) into the `avatars` bucket and sets it as the avatar, so `/welcome` starts with it and the user can change or remove it there. Copied rather than linked, so visitors never load images from Google and the avatar doesn't break when the Google photo changes. Only `*.googleusercontent.com` over https is fetched (3 s timeout, JPEG ≤ 2 MB); any failure just skips the photo.

### 2026-10-13: Sign in with Apple on the web
Owner's request. The login page now offers "Continue with Apple" above "Continue with Google", through the same Supabase OAuth flow and `/auth/callback`. Sign-ups stay off, so Apple only signs into an account whose email matches; "Hide My Email" relay addresses won't match, and the error says to choose "Share My Email". Apple shares no profile photo, so only Google sign-ins get a default avatar. The web flow's client secret expires after at most 6 months and must be regenerated (`supabase/README.md`). The iOS app will use native Sign in with Apple (`signInWithIdToken`) against the same provider, which also satisfies App Store rule 4.8.

### 2026-10-13: Basic analytics: Vercel Web Analytics + own `events` table
Owner's call. Page traffic (landing, legal pages, public profiles) goes to **Vercel Web Analytics**: free on Hobby, cookieless (no consent banner), one new dependency (`@vercel/analytics`, approved). Signed-in paths (`/app`, `/login`, `/auth`, `/welcome`) are excluded. Product events go to a write-only Supabase **`events`** table instead of Vercel custom events, which need Vercel Pro; it keeps us at $0 and lets the iOS app record the same events. Two events for now: `entry_logged` (photo or by hand, and how detection did) and `card_shared` (which button, which design). Signed-in users only, so the table can't be spammed anonymously. Anything the database already knows (entries, trips, waitlist `source`) is counted from its own table, not duplicated. No IPs, user agents or free text are stored. Setup and saved queries: `docs/ANALYTICS.md`.

### 2026-10-13: Planned shows are entries with a status, and trips can be derived
Owner's call. A show you're going to see is the same `entries` row as one you've logged, with `status` `planned` → `logged`, not a separate model (migration `20261013210000_planned_entries.sql`). A planned entry needs only a show (title) and a date: `venue_id` is now optional on every entry, and a planned entry can't carry a rating. Logging it later updates the same row, so its trip membership and share links survive. Existing rows and clients default to `logged`. Planned entries are owner-only for now (public RLS reads `logged` entries only), so "I'm going to X" can't leak through a public profile before the owner has decided whether planned shows are shareable. `public_profile_stats` counts logged entries only and no longer drops entries without a venue. In the app, upcoming entries show as a collapsible section at the top of the diary.
- **Not decided yet (trips):** whether trips stay a first-class model (`collections`) or become a view derived from city and date. Nothing about trips changes in this migration.
- **Web reads tolerate a null venue:** the diary, trip, entry, public profile and share-card code show an entry without a venue (no venue stat on the card; editing it asks for a venue on save).
- **Still to do in the apps:** iOS must tolerate a null venue too. (The Upcoming section and planning a show came on 2026-10-14, below.)

### 2026-10-14: Waitlist sign-ups go to Kit, with double opt-in
Owner's call, replacing the Supabase-only waitlist from #10. Kit (kit.com, free plan) sends a confirmation email, so people know they're on the list, and only confirmed addresses count, which filters out junk and bot sign-ups. The honeypot stays. The server action creates the subscriber as inactive and adds them to a double opt-in form (Kit's v4 API, server-side key, no new npm dependency); the sign-up source goes into the referrer URL as `utm_source`. Kit is now the list: the owner imports the existing `waitlist` rows once by CSV. Until `KIT_API_KEY` and `KIT_FORM_ID` are set, sign-ups still go to the `waitlist` table, so none are lost. Trade-off: the list now lives with a third party, but it can be exported from Kit as CSV.

### 2026-10-14: Trips are stored, dated and made by hand; Home · Log · Profile; labels deferred
Owner's call, after discussing derived and hybrid trips. Most visits aren't part of a trip, so trips stay out of the way of logging (migration `20261014120000_trips_v2.sql`).
- **Navigation:** the tabs are **Home · Log · Profile**. Home is the diary for now (a timeline comes later). The Trips tab is gone: trips are listed on Profile, and `/app/trips` redirects there.
- **Trips are stored and made by hand**, not detected. No automatic "make this a trip?" suggestion for v1: any rule for "you're away" needs a home city or past entries to compare against, and new users have neither. Revisit once there's real usage to learn from.
- **Where trips are made:** "+ New trip" on Profile; in the diary, **Select** shows → "Add to a trip" (an existing trip covering all their dates, or a new one with its dates prefilled); and "+ Plan a trip" in the diary's Upcoming header. A trip's page has "Add shows", listing only shows within its dates, all pre-ticked.
- **Log form:** no Trip field by default. It appears only when one of your trips covers the show's date, with that trip pre-selected.
- **Trips have dates:** start and end are both required, and a trip holds only shows dated within them. The database blocks adding a show outside the dates, shrinking the dates past a show, and re-dating a show outside its trip; the user edits the trip's dates first.
- **No trip privacy setting:** a trip is public when it holds a public, logged show (and the profile isn't private); its public view lists only those shows. `collections.visibility` is dropped.
- **Labels are deferred** to a later version. The `label` kind stays in the schema, unused; the app no longer creates or shows labels. No trips or labels existed, so nothing was migrated.
- **Planning a show = giving it a date after today.** The same log form saves it as `planned`, with no rating and an optional venue, into a collapsible **Upcoming** section at the top of the diary. Editing it after the date saves it as logged on the same row. Imported tickets for future dates are saved as planned too. Planned shows don't count in share-card stats, trip stats or the `entry_logged` event.

### 2026-10-14: Trip recap cards on the trip page (#16)
A trip's page opens its share sheet, the same one as an entry (carousel, Stories, More, Download, Copy text), with four trip designs adapted from the "Share cards" canvas (https://claude.ai/artifact/JBrH9jzd4ke4YtpRLQWhPC): **List** and **Photo grid** (dark), **Collage** and **Photos** (light).
- **All square**, owner's call: 1080×1080 with 20-unit rounded corners like the entry cards, and the square trip wrap's header (name; place · dates · N shows) and footer (wordmark, handle) in the same place on every card. An earlier mix of 9:16 Story and 1:1 cards made the carousel change height as you swiped. The canvas's Story layouts (list, grid, collage) are drawn square instead.
- Drawn on the device with Canvas 2D (`apps/web/src/lib/share-card-trip.ts`), like the entry cards, so the system font is used and the photos never go to a server.
- Cards cover the shows seen (logged), in date order; planned shows are left out, as in the trip stats. Without any, there's no share sheet. Stats: number of shows, the city (or "N cities"), theatres visited and the average rating.
- Adapting to the number of shows: the list has photo rows up to 4 shows, compact rows (no thumbnails) up to 6, then 5 rows and "+ N more shows". Grids hold up to 6 tiles, with "+N" on the last. A show without a photo is a tile with its title (initials in the list).
- **Collage layouts per number of shows**, owner's call: the canvas's "Trip collage" row has a hand-placed square layout for each of 2 to 8 shows (polaroid positions, sizes and tilts), copied as is. One show gets a single large polaroid; past 8 the 8-show layout is used, preferring shows with photos, with "+N" on the last polaroid. Title tiles put the title at the top there, since the next row of polaroids overlaps the bottom.
- No "Background" (transparent) toggle for trip cards: each design is built around its ground or photos.
- Analytics: `card_shared` records the design id (`trip-list`, `trip-grid`, `trip-collage`, `trip-square`).

### 2026-10-14: Account deletion
The Profile tab ends with "Delete account". A modal asks the user to type their handle before the delete button enables; Postgres checks the handle again (`delete_my_account`), so iOS gets the same rule. Deletion is immediate and permanent, with no grace period. Entry photos and avatars are removed through the Storage API first, then the auth user is deleted, which cascades to profile, entries, trips and events. Shows and venues the user added stay in the shared catalogue, unattributed.

### 2026-10-14: iOS app scope and the backend changes it needs first
Owner's calls for the first iOS version, which replicates the web owner app:
- **Share cards are drawn natively** in SwiftUI, a second copy of the web's Canvas designs (`apps/web/src/lib/share-card.ts`). Native rendering keeps the photo on the phone and allows a direct Instagram Stories button. Replaces "the app fetches `/api/card/:id`" in `docs/ARCHITECTURE.md`.
- **No import on iOS** (email or photo batches). It gets its own iOS-focused import feature later. The photo-first log flow (nearby theatres, show suggestion) stays, since it's part of logging.
- **Left out:** the admin pages and model picker, and the landing, waitlist, FAQ and legal pages (the app links to the web for those).
- **The public profile is a screen in the app**, reading public entries only, as `/@handle` does.
- **Minimum iOS 17**, so phones from 2018 on (iPhone XS/XR, SE 2nd gen) can run it.

Backend changes so iOS doesn't reimplement web logic:
- The AI and nearby-theatre routes accept `Authorization: Bearer <access token>` as well as the web's session cookie. A request with the header is judged on the token alone.
- Share-card stats (show of the year, visit to the venue, times seen) moved from TypeScript to `entry_card_stats(entry_id)` in Postgres, counting shows actually seen: planned entries no longer count (owner's call), except an entry on its own card. Owner-only: another user's entry id returns nothing.
- The Google profile photo copied on first sign-in happens in the web's `/auth/callback`; native Google sign-in skips it, so the iOS app does the same on the device (see `apps/ios/README.md`).

### 2026-10-14: Reserved handles
Nobody can claim a handle like `stubbed`, `admin`, `support` or `login` (#1). The list covers Stubbed's own names, staff-sounding ones, site pages and routes, and words like `null` or `everyone`. It lives in `RESERVED_HANDLES` (`apps/web/src/lib/profile-handle.ts`), so `/welcome` and `/app/profile` say "reserved" as you type, and in Postgres (`public.is_reserved_handle`, migration `20261014150000_reserved_handles.sql`), so the API refuses it too. A unit test fails if the two lists drift. Exact matches only: `admin_fan` is fine.
- A trigger, not a check constraint: a handle someone already holds stays valid if the list grows, and only claiming a new one is refused.
- The check applies to app users (`anon`, `authenticated`), not to the SQL editor or the service role, so the owner can still give `@stubbed` to the official account.
- Share cards stay square only: the story (1080×1920) and 4:5 post sizes are dropped for now (owner's call, #15).

### 2026-10-14: Public entry and trip pages, with server-drawn link previews
Owner's go-ahead (#15, #16). `/e/[id]` shows one public show as a post; `/t/[id]` shows a trip's name, dates, who went, its numbers (shows, theatres, nights, average rating) and each public show in date order. Both share the public profile's light shell and waitlist prompt (the layout moved into the `app/(public)` route group, so URLs are unchanged).
- **Privacy is RLS's call.** Reads use the publishable key with no session (`lib/public-pages.ts`), like `/@handle`, so a private or planned entry, a trip with no public show, or anything on a private profile is "not public" (noindex), even for the owner. Private shows inside a public trip are left out, and so are their counts.
- **Link previews are drawn on the server** with `next/og` at `/api/og/entry/[id]` and `/api/og/trip/[id]` (1200×630, the share cards' dark ground, coral glow and stars, with the `stubbed` wordmark and @handle; Geist, since next/og can't use the system font). The pages link them with `?v=` from the entry's `updated_at` (a trip: a hash of its name, dates and shows), so edits get a fresh image. The CDN keeps an image for an hour, which bounds how long a preview survives after an entry is made private. `robots.txt` allows `/api/og/`, since some unfurlers honour it.
- **Link** on the share screen copies the public page's address, shown only when the page would be public. Recorded as `card_shared` with `action: copy_link`.
- Public entry cards now link to their page, their trip chips to the trip page, and the avatar and handle to the profile. On a trip page the cards drop the repeated header and the trip's own chip.
- Square only: the trip recap stays square like the entry cards (owner's call); the issue's Stories format and carousel aren't planned.
- Not-found pages answer with status 200 and a noindex tag, as `/@handle` already does: the pages stream, so the status is sent before the read finishes.

### 2026-10-14: Follow and unfollow, pulled forward from Phase 3
Owner's call: build follows before the iOS app, so iOS copies a complete web MVP. It completes "Private profiles, Hevy style":
- **Public profile: Follow takes effect at once. Private profile: Follow sends a request** the owner approves or declines under Profile → Follow requests. Approved followers see a private profile's public shows, trips, photos and stats; private entries stay owner-only whoever follows. Making a profile public approves waiting requests; making it private keeps existing followers.
- **Either side ends a follow:** unfollow, cancel a request, decline, or remove a follower from your followers list. Nobody is notified, and there's no "declined" state, so asking again just works.
- **Counts are public** on every profile (as on Instagram and Hevy). **Lists** (`/@handle/followers`, `/@handle/following`) are hidden on a private profile from anyone but the owner and approved followers, and a public profile's lists leave out private profiles the viewer can't see.
- All rules are in Postgres (`follows` table, RLS, triggers, `profile_is_visible`, `follow_counts`), so iOS writes the same table directly. `/@handle` now reads the visitor's session to show the button; entries are still read anonymously, except by an approved follower of a private profile.
- **Not in this slice:** the feed of followed users' entries, finding people (search, suggestions), notifications for new followers or requests, and blocking. Sign-ups are still off, so only accounts made in the dashboard can follow for now.

### 2026-10-14: Home is the feed; the diary moves to the Profile tab
Owner's call, on top of follows (above). Hevy style.
- **Home is the feed** (`feed_entries()` in `20261014170000_feed.sql`, so iOS matches): your own logged shows, private ones included and marked "Private", plus the shows RLS lets you see from everyone you follow, newest first, the latest 30. Including your own shows means the feed is never empty for a solo user. Upcoming shows stay out. Your shows open in the app; others' open their public page, or don't link when the profile is private.
- **Find people** (`/app/people`, `search_profiles()`, replaced by the header search on 2026-10-18): handle prefix or any part of the name, each with the Follow / Requested / Following button. A "Follow people you go to the theatre with" card shows on Home until you follow someone.
- **Profile tab:** avatar, handle, name, bio, shows / followers / following (linking to the lists), follow requests to approve, "Edit profile" and "View public profile", then a **Diary | Trips** switch (`?view=trips`). Your details, privacy and account deletion moved to `/app/settings`; the Follow button's "Edit profile" on your own `/@handle` goes there too.
- Not yet: notifications for new followers or requests, blocking, reactions or comments (still a decision for #4), feed pages beyond the latest 30 (now done, below).

### 2026-10-14: The feed pages
Home loads 20 shows, then the next 20 as you scroll near the end, with a "Load more" button for keyboards, screen readers and retries, until "You're all caught up". Pages are cut in Postgres on (date, created_at, id) (`20261014180000_feed_paging.sql`, replacing `feed_entries`), so shows logged in the same instant, as an import saves them, are never skipped or repeated. The first page is rendered on the server; later ones come from a server action (`loadFeedPage`) and stay when you tap away and back. Logging a new show starts them over. Replaces "the latest 30".

### 2026-10-14: iOS project set up
The Xcode project in `apps/ios` builds, tests and runs from the command line (`apps/ios/scripts/dev`), so Claude Code can work on it from a remote session on the Mac and check UI through Simulator screenshots.
- **Bundle ID `com.felixng.stubbed`** (now `app.getstubbed`, see 2026-10-21), team `AAW3XNQ6D3`, automatic signing, iOS 17, iPhone only, portrait.
- **No project generator** (XcodeGen, Tuist): Xcode's synchronized folders pick up new files on disk, so the project file rarely changes. Build settings live in `Config/*.xcconfig`.
- **Debug talks to local Supabase, Release to the hosted project.** Both keys are publishable (RLS protects data); an optional git-ignored `Secrets.xcconfig` overrides Debug, e.g. for a real phone.
- **Swift types are generated** from the local schema (`scripts/dev types`). The script backticks enum cases like `public` and `private`, which the generator leaves as bare Swift keywords.
- One package: `supabase-swift` (2.x). Tests use Swift Testing.

### 2026-10-14: Likes and comments, Hevy style
Owner's call, after follows: include reactions and comments rather than defer them. Migration `20261014190000_likes_comments.sql`.
- **Likes:** one heart per person per entry, with a count. **Comments:** plain text, up to 500 characters, oldest first, with no editing (delete and post again) and no replies or mentions.
- **Who:** anyone signed in who can see the entry: a public, logged entry on a public profile, or on a private profile they're an approved follower of. Private and planned entries take no likes or comments. You can like your own show.
- **Who sees them:** whoever can see the entry. If it's made private, its likes and comments are hidden from everyone but its owner and come back if it's made public again.
- **Deleting:** commenters delete their own comments; the entry's owner can delete any comment on their show. Nobody is notified.
- **Where:** every public entry card (Home feed, profile, trip page, entry page) ends with Like and Comment. The thread lives on the entry's page (`/e/[id]#comments`), with "Liked by @a, @b and N others" above it. The owner's entry screen in the app links there with the counts. Signed-out visitors sign in and come back (`safeNext` now allows `/e/<id>` and `/t/<id>`).
- **`/e/[id]` now opens for approved followers of a private profile** (read with their session), so they can see and join the thread. Those pages aren't indexed and get no preview image; link previews still read anonymously. The Home feed's cards for those shows now link there too.
- **Not in this slice:** notifications for likes and comments, a list of everyone who liked, reporting or blocking (Phase 3 moderation hooks) and turning comments off per entry.

### 2026-10-14: iOS Google sign-in without the GoogleSignIn SDK
The iOS app signs in with Google through Supabase's own OAuth flow, shown in a secure browser sheet (`ASWebAuthenticationSession`) that returns to `stubbed://auth-callback`, instead of Google's iOS SDK. Why: no new dependency, no separate iOS OAuth client in Google Cloud, and it's the same flow the web uses. Cost: a browser sheet instead of Google's native account picker. Owner setup: add `stubbed://auth-callback` to the hosted project's Auth → URL Configuration → Redirect URLs (local `supabase/config.toml` already has it). Apple stays native (`signInWithIdToken`).

### 2026-10-15: One photo per entry in the import tool
Owner's call. The import tool no longer groups photos from the same evening into one draft: each photo is its own draft (and its own identify call), and a photo only joins a draft that has no photo yet (its booking email). Several photos per entry is planned for later, likely as a paid feature (see "Monetisation ideas" in the project brief), so this is switched off in the UI only (`GROUP_VISITS` in `ImportTool.tsx`); `groupPhotos` and multi-photo identify stay in `lib/import`.

### 2026-10-15: The project brief moves to a Google Doc
Owner's call: the brief is now the Google Doc [Stubbed: Project Brief](https://docs.google.com/document/d/1NdEgeTRMkKQ5TL87Urwpe7WG9fcrejPsZKsmrO2Enak/edit), one source of truth that's easy to share outside the repo. It was rewritten to match what's built (iOS parity as the current focus, Social largely done, the data model as built, the Phase 1 gaps). `CLAUDE.md` now links to it and keeps only the standing working agreements, so every Claude Code session still loads those. Replaces "Project brief lives in `CLAUDE.md`". Open decisions 4 (email import: paste-in and file upload are built) and 5 (likes and comments, decided 2026-10-14) are closed.

### 2026-10-16: Product context in Google Drive, code and tech context in the repo
Owner's call, building on the brief's move to a Google Doc. The [Stubbed folder](https://drive.google.com/drive/folders/1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI) on Google Drive holds the product and project context (what, why, audience, status, roadmap, ideas, brand, monetisation) for any tool to read: design, marketing, copywriting, SEO. The repo holds the code and tech context. The rule is spelled out in `CLAUDE.md` ("Where context lives") and at the top of the brief.
- `docs/MONETISATION.md` moved to the Google Doc [Stubbed: Monetisation Ideas](https://docs.google.com/document/d/1LJanHT3SpBYSQB7SiRVaeX-1PFZTPQ-cBLXlSC50KAM/edit) in that folder.
- The brief's data model and tech approach moved into `CLAUDE.md` ("Tech overview"); the brief keeps a short non-technical summary.

### 2026-10-16: The iOS app's UI diverges from the web
Owner's call. The iOS app keeps the web's features, data and rules (Postgres stays the shared source), but its UI is now designed as a native iOS app (Apple Fitness and Personal Best as references) rather than a copy of the web's mobile layout: system grouped backgrounds, inset grouped containers without drop shadows, a native tab bar with Log as a tab that opens a sheet, Dynamic Type and SF Symbols throughout. Share cards still match the web, since they're the images people post. The rules are in `apps/ios/CLAUDE.md`, "Design direction".

### 2026-10-18: Entry cards laid out like Instagram posts
Owner's ask (#85): a tighter feed card. `PublicEntryCard` (Home feed, profiles, trip pages, entry pages) now runs header, then the photo edge to edge, then Like / Comment / Share, then the note as a caption after the bold handle, then trip chips.
- **Show, where and stars sit on the photo**, over a black gradient (80% at the bottom) with a light text shadow, so they read on bright photos too. The gradient is dark in either appearance, so on it the stars use the dark appearance's `star` and white empty stars (set by overriding `--star` and `--outline` on the overlay).
- **The whole photo opens the show**: the title link is stretched over it.
- **Without a photo**, the show, where and stars stay as text under the header; the reactions and caption follow as above.
- On trip pages the caption has no handle, matching the header being left out there.
- iOS (`HomeView`) isn't changed yet.

### 2026-10-18: People search in the header
Owner's ask (#86): find people from a search box rather than a block on Home, like Hevy's sidebar search. The owner left the details to Claude.
- **Where:** a search box in the app header (placeholder "Search", labelled "Search people by handle or name" for screen readers, since "Search people" doesn't fit beside the wordmark on a phone) on every page, between the wordmark and the menu. Matches (handle prefix or any part of the name, `search_profiles()`) drop down under the header, each with the Follow / Requested / Following button. On a phone the list spans the header's width.
- **Behaviour:** opening a profile clears the search. Tapping elsewhere or pressing Escape closes the list, and a half-typed search comes back when you focus the box again. The shell doesn't read the session (so it prerenders), so the box takes your id from the browser session on the first search, to leave you out and read your follow statuses.
- **Removed:** the "Follow people you go to the theatre with" card and the "Find people" link on Home, and the `/app/people` page. An empty feed with no follows points to the search box instead.
- **People only for now.** Shows and venues could join the same box later.
- iOS isn't changed yet.

### 2026-10-18: Comments inline on the feed
Owner's ask (#87): comments under each show in the Home feed, with a box to post one, as on Hevy, instead of only on the entry's page. The owner left the details to Claude. Migration `20261018120000_comment_previews.sql`.
- **What shows:** each public show in the feed shows its latest 2 comments (oldest first), after the caption and trip chips. With more, "View all N comments" opens the whole thread in place (read in the browser). The comment box is always there, one line that grows as you type: Enter posts, Shift+Enter is a new line, and Comment focuses the box. Your private shows still take no comments.
- **Read path:** `entry_comment_previews(entry_ids, per_entry)` returns the latest comments per entry with their authors, in one call per feed page. It runs as the caller (security invoker), so the `entry_comments` policies decide what comes back, exactly as reading the table does; at most 10 per entry. pgTAP: `comment_previews_test.sql`.
- **State:** the feed card keeps the thread itself (`FeedThread`): posting adds your comment and deleting removes one without refreshing, since older feed pages load in the browser where a refresh doesn't reach. Leaving Home and coming back keeps everything, including an unfinished comment, because nothing there is a finished task to clear (no `useFreshOnReturn`).
- **Elsewhere:** profiles, trip pages and the entry's page are unchanged; their Comment button still opens the thread on the entry's page.
- iOS isn't changed yet.

### 2026-10-18: Google Analytics 4, cookieless, alongside Vercel
Owner's call. GA4 is added to the public pages next to Vercel Web Analytics, which stays. To keep "no analytics cookies, no consent banner" (2026-10-13), Consent Mode is set to `denied` for every type before anything is sent and is never granted, so GA stores nothing on the device and gets cookieless pings only; `ads_data_redaction` is on. No new dependency: `gtag.js` loads through `next/script`, and the queue is set up in `SiteAnalytics`. Page views are sent by hand (`send_page_view: false`) on public paths only, and `ga-disable-<id>` is set while on `/app`, `/login`, `/auth` or `/welcome`, so a client-side move into the app reports nothing. Off until `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. Trade-off: with consent denied, GA's standard reports stay mostly empty until traffic is high enough for its modelling (see `docs/ANALYTICS.md`). The privacy policy names Google as a processor for visit statistics.

### 2026-10-18: Trip collage card, stats in the header and bigger polaroids
Owner's call. The Collage card (`trip-collage`) shows the trip's shows, venues and nights as large accent-coloured numbers on the right of its header, with the label under each, matching the stat tiles on the trip page; the subtitle drops its "· N shows". The header keeps its height. `TripCardData` gains `nights`, the trip's length from its dates (end minus start, so 9–17 Oct is 8; hidden for a one-day trip), not the days with a logged show. The trip page's Nights tile, the public trip page and its link preview use the same number ("N shows in D nights"; a one-day trip drops the nights). The 7- and 8-show layouts are now two brick rows of 144×192 polaroids (were 110×146), overlapping sideways so four fit across. Other trip designs and iOS are unchanged.

### 2026-10-18: Domain under the wordmark on share cards
Owner's call. Every share card (entry and trip, web and iOS) shows `@getstubbed.app` in small type under the `stubbed` wordmark, in the card's secondary colour, so a shared image leads back to the site. The handle stays on the right, level with the wordmark. The wordmark moves up a little and the domain uses some of the bottom padding, so the content area of each card is unchanged. The string lives in `CARD_DOMAIN` (`lib/share-card.ts`) and `cardDomain` (`EntryCard.swift`). The 2026-10 social-handle note above still holds: `@stubbedapp` is in the caption and shared text, not on the card.

### 2026-10-20: iOS screens follow the native guide; feed post cards stay custom
Reviewed the iOS app against `docs/IOS_NATIVE_GUIDE.md`. List-like screens are now `List(.insetGrouped)` with system chevrons, swipe actions and context menus: Profile (bulk select is the system edit mode with Add to trip and Delete in the bottom bar, as Photos does), followers and following, Find people, public profile, public entry (comments are rows; swipe to delete) and public trip. First loads show grey placeholder rows (`PlaceholderRows`, `.redacted`) instead of a spinner. Custom button styles are replaced by `.borderedProminent` / `.bordered`; the log form's chips are a `Picker`, buttons and rows; rows that open a sheet have no chevron; stars scale with Dynamic Type; the card press uses the default animation.
- **The one custom container kept:** post cards in the Home feed (and where a post is shown on a profile, trip or entry page). A feed of posts is the Mail / Letterboxd case the guide allows: each card is one tap target with its own like, comment and trip controls, which a plain list row can't hold. Inside a `List` they push through the router with buttons, because a `NavigationLink` in a list row gets a disclosure chevron.
- Swipe actions that ask first (delete a show or comment, remove a follower) are red but not `role: .destructive`, which removes the row before the confirmation can appear.
- The calendar uses `Grid`, not `LazyVGrid`: a lazy grid inside a list cell crashed with a layout loop.

### 2026-10-21: iOS bundle ID is `app.getstubbed`
Owner's call, before the app was created in App Store Connect (after the first upload a bundle ID can't change). Replaces `com.felixng.stubbed`: the reverse of the domain we own, `getstubbed.app`, so it's ours and doesn't tie the app to a personal account. Test targets are `app.getstubbed.tests` and `app.getstubbed.uitests`, and the log subsystem matches. Universal links' app ID (`/.well-known/apple-app-site-association`) is `AAW3XNQ6D3.app.getstubbed`. Owner setup: register the ID in App Store Connect, and add it to Supabase → Auth → Apple client IDs (and any Google iOS OAuth client).

### 2026-10-21: iOS share cards on a Share screen; photo-first feed posts
Owner's ask, comparing with Hevy on a phone. The share cards move from the entry and trip screens to a **Share** sheet (sharing is a task of its own, so a sheet per the native guide), where the card spans the screen with 16pt margins, as Hevy's does. Entry and trip screens open it from a Share button in the bar and a "Share this show / trip" row with a thumbnail. A newly saved show opens it straight away, as Hevy does after a workout. **Feed posts are photo first**, as on Instagram and Hevy: the header, the photo at the card's full width (4:5), then the show, stars, note and the counts row; a show without a photo is a text post, with no grey thumbnail. Photos load through `RemoteImage`, which caches and retries, because `AsyncImage` in a scrolling feed gave up when a scroll cancelled the download and left an empty box.

### 2026-10-21: Public design system page at /design-system
Owner's ask: a page to share the design system with other AI tools. `/design-system` shows the tokens (light and dark side by side), type styles, spacing, radius, shadows, icons and the real web components in both appearances; "Copy for AI tools" copies it as markdown, and `/design-system.md` serves the same markdown for tools that fetch a link. Both are built from one module, `lib/design-system.ts`, and a test fails if its colours drift from `globals.css`. The page is always light, like every other page, and is public but `noindex`, and isn't in the sitemap or linked from the site.

### 2026-10-21: Light by default is a design system rule
Owner's call, after `/design-system` showed dark on a dark-mode device. Light is the default everywhere: every web page sets `data-theme="light"` on its root and iOS sets `.preferredColorScheme(.light)`. Replaces the "follows the system appearance" principle in `docs/DESIGN.md` and on the design system page. Dark tokens stay defined and working, and the page still shows them, for when dark mode comes back.

### 2026-10-22: iOS people search is a button; comments are a drawer
Owner's asks. The "Follow people you go to the theatre with" banner on Home took too much room, and an always-visible search bar under the title still did. Home now has just a search button in its bar, as on Instagram and Hevy: it opens a **Search people** sheet with the field focused, results with Follow as you type, and choosing a person closes the sheet and opens their profile on Home. The banner, the Find people screen and its route are gone. **Comments on a feed post open as a pull-up drawer** over the feed, as on Instagram: half height, drag to full, swipe down to close, "No comments yet · Start the conversation." when empty, and the box ("Add a comment for @handle") pinned to the bottom. A show's own page keeps its comments inline.

### 2026-10-22: The design system page covers iOS
The `/design-system` page (and its markdown) gains a full iOS section: the native rules, how each colour token is expressed in SwiftUI (system colours for backgrounds and text, `Palette` for the coral ones), the SwiftUI components with their files, and screenshots of the app's main screens from the simulator. The components table's SwiftUI column now names the real types (system button styles, `RatingStars`, `Poster`, `EntryRow`, `PostCard`, `Wordmark`) instead of planned `FL…` ones that were never built, and the iOS tab icons are the real ones. A test checks every token is mapped and every screenshot file exists.

### 2026-10-22: One primary share action; the rest under More
A design critique found the in-app share row overloaded: seven equal circles (Background, Stories, More, Download, Copy text, Link, Edit) that scrolled sideways on phones, with Edit cut off. Stories is now the one coral `Button` ("Share to Stories"). Under it sit two quiet capsules: "Transparent" (was "Background"; now pressed when the background is off) for entry cards, and "More", which opens a grouped list of Share… (the native share sheet with the caption, as the old More did), Download image, Copy text and Copy link. Each item closes the list when it runs; Escape closes it and returns focus to More. Edit left the share row for the top right of the entry page, like a navigation bar; planned entries keep their Edit button in the card. `card_shared` events are unchanged: the same action names fire from the same handlers. Trip recaps use the same sheet, without Transparent.

### 2026-10-22: The desktop web app gets a sidebar from md (768px)
A design critique found that at desktop width the app was a 640px phone column with a bottom tab bar, though the design docs promised a sidebar; the owner chose the sidebar. From `md` the header and tab bar hide and a 256px left sidebar holds the wordmark, people search, Home, Log, Profile, Import shows and Sign out. Pages keep their 640px column beside it, since feed cards, the log form and share cards are designed for that measure. `md` rather than `sm`: at 640px a sidebar would leave the column under 400px. Log is a plain sidebar item, not the raised coral button, so the page's own primary action (Save, Choose photo) stays the only coral fill. Sticky bottom bars that sat on the 49px tab bar drop to the bottom edge from `md`.

### 2026-10-22: Shared entry and trip pages open on the card
From the design critique: someone who taps a shared link landed on a plain feed post, after the waitlist card. `/e/[id]` and `/t/[id]` now lead with the card itself, using the link-preview image (`/api/og/entry|trip/[id]`, versioned with `?v=`), so the page opens on what the message preview showed. Then the show as a post (or the trip's name, dates, one quiet line of numbers and who went, then its shows), then "See @handle’s diary", then the waitlist card for signed-out visitors.
- **Why the preview image, not the phone-drawn share card:** the share cards' stats (show of the year, venue visits) come from `entry_card_stats`, which only the owner may call, and counts that include private shows would leak them. The preview image is drawn from public data only and is already cached.
- **Where it doesn't show:** a private profile's shows, which only approved followers see while signed in, have no preview image, so their page starts with the post as before.
- **Waitlist card position:** the public routes are split into two route groups (URLs unchanged): `(profile)` puts the join card first, as before; `(card)` puts it last. The join card and header button moved to `components/profile/JoinCard.tsx`. A layout-level `useSelectedLayoutSegment` switch was tried first, but under `cacheComponents` it needs a Suspense boundary, which would make the profile's join card pop in.
- The trip page's big-number stats panel is now one line under the name, since the card above shows the same numbers large.

### 2026-10-23: Back links, an in-app confirm dialog, and the private-shows note
From a design critique (`/impeccable harden`). Every page below a tab now starts with one `BackLink` (a drawn chevron and the parent's name, 44px target), like an iOS navigation bar: entry → Profile, edit → the show, trip and new trip → Trips, import → Log, settings → Profile, admin import → Admin. Fixed parents rather than `history.back()`, so the link says where it goes and works from a shared or reloaded URL. Deletes use `useConfirm` (`components/ui/ConfirmDialog.tsx`), a native modal `<dialog>` in place of `window.confirm`: focus stays inside, Escape and a backdrop tap cancel, and Cancel takes focus first so Enter never deletes. The trip delete's error moved from `window.alert` to inline text. The Profile tab counts every logged show while `/@handle` counts public ones; that's by design, so the Profile tab now says how many private shows the public profile leaves out instead of the two numbers silently disagreeing.

### 2026-10-23: One verb for adding a show: "log"
From the design critique: the web app called the same action "Log" (tab), "Track a visit" (log page), "Track a show" (empty state) and "Add your first theatre visit". It's now "log" everywhere a person adds a show: the tab, the page title ("Log a show"), empty states, the landing page, the join card, share captions ("Logged on Stubbed") and the link-preview image. "Import" stays the separate bulk action ("Import shows"). SEO titles and descriptions (`lib/site.ts`, `llms.txt`) and the privacy policy keep "track", which is how people search for a theatre diary.
- **Cards:** the footer reads `getstubbed.app`, without "@", so it no longer looks like a second handle beside the user's.
- **Diary:** the logged list has a "Seen" heading with its count, matching "Upcoming". The Upcoming shortcut reads "+ New trip", as on the Trips view, so a trip isn't mistaken for a planned show.
- **Import:** the main copy says what we read from emails and photos; the file formats move to a footnote, and "Drop … here" only shows with a mouse or trackpad.
- **Errors:** "Couldn’t update" and "Something went wrong" now name the thing that failed (the like, the follow, the request, the comment, the waitlist).

### 2026-10-23: Web type stays on the text-style scale; tab labels are Caption 2
Tab bar labels moved from 10px to an 11/13px `text-caption-2` token (iOS Caption 2), the platform minimum and the one stated exception to the Footnote floor; 13px would crowd three labels under 24px icons. Off-scale sizes now map to text styles: the 15px pill links and the small `Button` use `text-subheadline` (15/20, which adds its -0.016em tracking), and `ShowCard`'s 40px poster initials use `text-large-title`. Feed cards on Home are `h2` (they sit right under the `h1`), so the outline no longer skips a level; `PublicEntryCard` takes a `level` prop and stays `h3` under section headings. The landing feature descriptions get 24px leading (1.41) instead of body's 22px, since they're running prose. The hero subhead, display headline and the 20px feature titles were already within range and stay as marketing sizes.

### 2026-10-23: Landing pictures are drawn with the app's own components
From a design critique (`/impeccable polish`). The "How it works" panels were placeholder SVGs labelled "MOCKUP · 1200 × 1500", and the hero phone showed two concerts and city names. All of them are now drawn in code (`components/landing/Screens.tsx`): the hero diary, Log a show, the share card and Upcoming plus trips, using `ShowRow`, `Poster`, `RatingStars` and the real `renderCard` for the share card (no photo).
- **Why not screenshots:** local data has no photos (every poster would be initials) and the entry, share card and trip screens show the venue's city, which public copy must not name. Drawn screens stay sharp at any density, follow the tokens and can't leak a real diary. Sample data is theatre only, venues without cities, handle `@sillyelphaba`.
- **Removed:** the hero's eyebrow ("For the theatre regulars", a cliché the detector flags), the three feature chips (they repeated the "How it works" titles, and "Trips and stats" promised a stats page that isn't built), and the pulsing gold dot in the beta pill (gold is for stars only). The pill now reads "Currently in private beta", in sentence case.
- `public/landing/features/*.svg` and `src/images/hero-diary.webp` are deleted.

### 2026-10-23: One coral fill per screen; Log is a plain tab
From the design critique: on phones the raised coral Log button sat about 25px under the log form's sticky Save, and other screens showed two or more coral fills.
- **Tab bar:** Log is a plain tab like Home and Profile (selected in `tint-text`), as on iOS and in the desktop sidebar. The sticky Save and Save-all bars lose the extra bottom padding that cleared the raised button. A raised button off the log page was considered and dropped: it would still compete with Save on every other screen's primary.
- **Demoted fills:** Approve in follow requests is a secondary button; the avatar picker's camera badge and the share sheet's active page dot use `label`, not `tint`. Follow stays primary, as on iOS (`.borderedProminent` per row).
- **Calendar:** show days are Coral Wash with `tint-text` numbers and a dot underneath, so a show day isn't marked by colour alone. Each still links to the day's entry with an accessible label.
- **Feed comments:** each card's comment box is folded until Comment is tapped (which sets `aria-expanded` and focuses the box) and folds again after posting. An open box with a half-written comment survives leaving the page, as before. The inline Post is secondary.

### 2026-10-23: Final polish: two date styles, page-control targets, placeholder rows
The last pass after the critique fixes.
- **Dates:** the app showed four styles ("Mon, 5 Oct 2026", "Monday, 5 October 2026", "5 Oct 2026", "12 Sept 2026"). `formatDate` now has two: plain ("5 Oct 2026") for rows and metadata, and `WITH_WEEKDAY` ("Mon 5 Oct 2026") where one show's date stands alone (entry pages, feed cards, import drafts, link previews). It drops en-GB's comma after the weekday and writes "Sep", not "Sept". Long months stay for sentences and alt text.
- **Share sheet page dots:** 44×44 targets around the 8px dots (they were 24px), with negative margin so the row doesn't push the card and button apart.
- **First loads:** Home's feed and the Profile diary and trips show `PlaceholderRows` (static grey show rows, `role="status"`), like the iOS app, instead of a "Loading…" line. No pulse, by design.

### 2026-10-23: The share payoff: an instant card, an honest Stories button, stars for trip averages
From the design critique: after saving, the share sheet showed a blank "Drawing…" box, and on desktop "Share to Stories" quietly downloaded.
- **Placeholder card:** while the canvas cards draw, each slide shows a stand-in built from the data on hand: the design's own ground (the entry cards' no-photo dark ground with its coral glow; dark or light per trip design, with the light cards' separator edge), the title, place and date, and five stars in half steps. It's sized in container units (`cqw`), laid out like the square card, and stays in the same 1:1 slide, so nothing jumps. The drawn PNG fades in over it in 240ms (`card-in`, `motion-safe:` only, so reduced motion swaps it at once). It isn't kept under a card without a background, whose clear parts would show it.
- **Stories button:** labelled by what it will do. Whether the browser can share files is checked once with an empty PNG probe (`useSyncExternalStore`, server snapshot "can share"), so the label is right before the cards are drawn: "Share to Stories" with the Instagram glyph, or "Download for Stories" with a download glyph. The tap still checks the real file, and the `card_shared` actions are unchanged.
- **Trip averages:** the grid trip card already drew the average as stars; it now rounds to the nearest half star (`halfStep`), like every rating. The OG trip image drew "4.8 average rating"; it now draws five half-step stars and "average" in `#FFD60A`, the dark `star` token the share cards and entry OG image use (Applause Gold's light value, `#b96f00`, is only for light grounds, as in the light placeholder).

### 2026-10-23: Shared-link pages show only what the card lacks; wordmark at 800 in link previews
From the second design critique: `/e/[id]` and `/t/[id]` opened on the card image, then repeated its title, venue, date and stars underneath.
- **Under the card:** the entry page shows the note (as a caption after @handle), its trip chips, Like and Comment, the comment thread, then who logged it with "See @handle's diary" (`LoggedBy`), then the waitlist card for signed-out visitors. The photo isn't repeated, since the link preview already draws it. The trip page shows the shows, then `LoggedBy`. The trip's name, dates and numbers line (with its bare "4.8 average rating") is gone, since the card carries them.
- **Screen readers:** the card is the page's `h1`, and its alt text carries the facts drawn on it (show or trip, where, when, stars or average), so nothing is said twice. Entries only a signed-in viewer may see have no preview image, so they keep the full post.
- **Wordmark weight:** next/og bundles only Geist Regular, and passing any font replaces it. `lib/og.tsx` reads Geist Regular and ExtraBold (OFL, ~73 KB each, in `apps/web/assets/fonts`, traced via `outputFileTracingIncludes`) once at module scope, and the footer wordmark uses weight 800. No new dependency or service; the files are committed rather than fetched from Google Fonts at render time, so a preview never waits on another host.

### 2026-10-23: One profile: the Profile tab is the public profile plus the owner's controls
From the design critique, owner's call. `/app/profile` and `/@handle` now share `components/profile/ProfileHeader.tsx` (cover, avatar, handle, name, follow counts, bio, link, stats).
- **Counts:** visitors still get `public_profile_stats` (and nothing on a private profile they can't see). The owner gets a new SQL function, `own_profile_stats()`, which counts every logged show for `auth.uid()` only, private ones included, plus `public_shows`; it isn't granted to `anon` (pgTAP: `own_profile_stats_test.sql`). The "N private shows aren't on your public profile" footnote stays under the stats, so the two pages' numbers never silently disagree.
- **Owner controls:** Edit profile and View public profile were two full-width pills; now Edit profile sits where Follow does, with a "…" menu (View public profile, Import shows). Follow requests moved from an inline list to a "1 follow request ›" row that opens `/app/profile/requests`.
- **Fold:** the header is tighter on phones (64px cover band, 96px with photos, 80px avatar, 12px gaps), so at 390×844 the first Upcoming row starts around 620px, above the tab bar; before, the diary started below the fold. The calendar goes inside the diary, between Upcoming and Seen, rather than in the header; its days jump to the diary rows (`EntryList` rows now carry `entry-<id>` ids).
- **Plurals:** stat labels agree with their numbers via `lib/plural` ("1 City", "2 Theatres", "1 follower"), shared with the profile's meta description.
- **iOS** keeps its own Profile layout for now; matching it is a follow-up.

### 2026-10-23: Wayfinding: nav highlighting, back links that follow you, login help
From the design critique: entry and import pages lit no nav item, the entry page always said "‹ Profile", and the login page was a dead end.
- **Nav:** entry pages sit under Profile, where the diary lists them, in both the tab bar and the sidebar (`section()` in `AppTabBar.tsx`), even when opened from the feed: an entry belongs to its owner's diary. Import keeps its own sidebar item on desktop; the phone tab bar has none, so there it lights Log, the tab that links to it. On desktop the import page drops its "‹ Log" back link, since it's a top-level item there.
- **Back links:** linking pages add `?from=` to entry links (`lib/back-link.ts`): `home` (feed), `trip-<id>` (trip page), `import` / `admin-import` (import drafts). The entry page reads only these values, so the link can't leave the app; a trip counts only when the entry is in it, which also gives its name ("‹ NYC Oct 2026"). Anything else, including a direct or shared load, falls back to "‹ Profile". Not `history.back()`: it's wrong after a direct load and can leave the site. The edit page carries `from` too (`readFrom` passes on only these values), so its back link and the save after an edit land on the entry with the same back link (see the polish entry below).
- **Login:** the wordmark links to the landing page. A footnote says sign-ups are closed with a link to the waitlist (`/#waitlist`). Password reset by email isn't built, so the page says to email support@getstubbed.app instead of offering a reset it can't do.
- **Public pages, signed in:** the header slot that holds "Join the waitlist" for signed-out visitors now holds "Open app" (tint-fill, linking to `/app`) for anyone signed in, so an owner viewing `/@handle`, `/e` or `/t` has a visible way back besides the wordmark. It renders nothing while the session is checked, so signed-out pages don't change.

### 2026-10-23: Polish after the critique fixes (#114–#117)
A consistency pass over the four PRs, plus the critique's minor observations.
- **Edit keeps `from`:** the entry page's Edit links, the feed's Edit pencil (`from=home`) and the edit page's back link carry `from`; `LogForm` adds it to the entry URL after saving.
- **Targets and focus:** "View 1 comment", "Sign in to comment", the entry page's likes and comments link, "+ New trip" (Trips view and Upcoming) and "Import shows" on Log are 44px tall with the focus ring. Standalone text actions take the ghost button's look at subheadline size (tint-text, tint-fill on hover); negative margins keep the layout where it was. The followers and following pages use `BackLink` instead of a "←" text arrow.
- **Trips:** a trip's own chip is left off its rows on the trip page (`EntryList` `inTrip`), as `/t` already did.
- **Entry page details** show the stars under the date: the card is an image, and a clear card can hide them.
- **Landing:** one coral fill, the hero's call to action. The drawn Save and Share mock buttons are white with coral ink, and the selected "How it works" number uses chip-selected (Velvet Ink). The sample diary mixes theatres from different places, still without naming a city. The hero button says "Join the waitlist", as everywhere else.
- **Login:** the "Sign in" heading uses Title, like other page headings.
- **Checkerboard:** the transparency pattern keeps its neutral greys on purpose (as in Photos, so it doesn't tint a clear card); they're named constants with a comment in `ShareSheet.tsx`.

### 2026-10-24: Visitor calls to action on public pages
From the design critique: signed-out visitors saw two coral "Join the waitlist" fills, and "Sign in to like / comment" prompts most of them can't complete, since sign-ups are closed.
- **One coral fill:** the header's "Join the waitlist" is now secondary (tint-fill, tint-text), like "Open app" for members. The join card renders on every public page a signed-out visitor sees (first on profiles, last on entries and trips), so its button stays the page's one coral fill. Coral only where no card renders would have meant never.
- **Likes and comments:** counts stay visible. A visitor's Like goes to the join card (`#join`, `JoinPrompt.tsx`); under comments, "Join the waitlist to like and comment" (secondary pill on the entry page, text link in feed cards) does the same, with a quiet "Already have an account? Sign in" for members who are signed out.
- **Landing:** ends with "Stubbed is in private beta." and a secondary "Join the waitlist" back to the hero form, so the form's button stays the only coral fill.
- **Not changed:** the profile header's coral Follow button for visitors still goes to sign in; it's out of this change's scope.

### 2026-10-24: Shared entry and trip pages open on a live card, not the preview image
From the design critique. Supersedes the "why the preview image" part of "Shared entry and trip pages open on the card" (2026-10-22). At 390px the 1200×630 preview raster drew the venue line and handle at about 7px, couldn't be zoomed or read as text, and looked lighter than the bold square card people post. `/e/[id]` and `/t/[id]` now start with `EntryHero` / `TripHero` (`components/profile/CardHero.tsx`), drawn in HTML: the card's dark stage with its coral glow (`.stage` in `globals.css` sets the dark tokens inside it, so `RatingStars` and the wordmark draw as on the card), the title as the page's `h1` (Title, Large Title from `sm`), venue · date, five stars, the photo when the entry has one (square on phones, wider from `sm`), and the `stubbed` wordmark with @handle over a hairline. Trips show the name, dates and place, "N shows in D nights" in coral, the average as stars, and up to four photos.
- **Public data only:** still no ordinals ("14th show of 2026", venue visits). They come from `entry_card_stats`, owner-only, and count private shows; a public count would disagree with the card and could reveal that private shows exist, so they're left out. Trip numbers count public shows only, as before.
- **The preview image stays** for link previews (`og:image`, `twitter:image`) only.
- **Private profiles' shows** (approved followers only) keep the post layout; its title is the page's `h1` (`PublicEntryCard page`).
- **Motion:** the card's words settle in once (700ms, from 40% opacity), under `motion-safe`.

### 2026-10-24: Landing pictures are real iPhone screenshots
The owner found the drawn landing screens (2026-10-23) flat: every poster was initials on grey. The hero and the four "How it works" panels are now screenshots of the iOS app, in a near-black phone frame (`components/landing/Screens.tsx`, `Phone`); in the panels the phone sits at the top and runs off the bottom edge. Images are `public/landing/{hero,log,share,history,plan}.jpg` (1206×2622), served through `next/image`.
- **The objections to screenshots are answered in the data, not the app.** `apps/ios/scripts/dev marketing` seeds a local-only `@sillyelphaba` diary (`apps/ios/scripts/marketing-seed.sql`) with the owner's own theatre photos, runs `MarketingUITests` (left out of `scripts/dev ui`) on a 9:41 status bar, and saves the shots to `apps/ios/build/marketing/`. The seeded venues have no city or country, so the card, entry and edit screens show only the theatre's name. `apps/web/scripts/landing-shots.sh` copies them into `public/landing/`.
- **Photos stay out of git.** They're read from `apps/ios/build/marketing-photos/01.jpg`–`08.jpg` (git-ignored), one per logged entry, newest first. Only the finished screenshots are committed.
- **Which screens:** Home (hero, the feed's photo card), the edit form for Log (the photo flow needs AI detection, which local Supabase doesn't have), the Share screen, the diary, and a trip.

### 2026-10-25: Next.js 16.4.0 → 16.4.3 for security advisories
`pnpm audit` flagged three advisories against `next@16.4.0`, all fixed from 16.4.1: unauthenticated remote code execution in the image optimisation API ([GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw)) and in `use cache` functions ([GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr)), and a denial of service in App Router server actions ([GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)). We use both `use cache` (`cacheComponents`) and server actions, so all three applied. Bumped `next` and `eslint-config-next` to the latest patch, 16.4.3; no code changes were needed. Run `pnpm audit --prod` in `apps/web` when Next prints its security notice on `next dev`.

### 2026-10-25: Posters without a photo use "House Lights"
The owner picked direction 1 of three typographic fallbacks explored for `Poster` (the others were a programme cover and a ticket stub). A show with no photo now gets its title in Velvet Ink on one of three warm wells (`fill`, `tint-fill`, `glow`), the show type in small caps and a short Clay rule; below 80px wide a container query swaps the title for a two-letter monogram. It is the smallest step from the old initials tile, and it stops a diary of unphotographed shows reading as one uniform pink column.
- **Deterministic and portable.** The well and the title's position come from FNV-1a over the trimmed, lowercased, NFC title (`lib/poster.ts`, unit-tested), so a show looks the same everywhere and iOS can run the same loop over `title.utf8`. The title size is computed in container units from the longest word and the length, so no measuring in the browser and it works in server components.
- **Only existing tokens, no coral or gold.** `glow` was "never behind text"; the poster wells are now the one documented exception (DESIGN.md).
- **Decorative.** The poster is `aria-hidden`; the title is always printed beside it. Photos still win.
- **`type` prop** threaded through `EntryList` (diary, app trip pages), `ShowRow` and `ShowCard`. Feed cards, public profiles, public trip pages and import drafts don't render a `Poster`.
- **Feed stays compact.** Feed cards (`PublicEntryCard`) show no cover without a photo, and the title, type and stars already sit under the header. A full-width 16:9 House Lights band would only repeat the title in bigger type and push the note and comments down, so it isn't added.
- **iOS not changed yet.** To match natively: a `ZStack` on `FLColor.fill`/`tintFill`/`glow`, the title in `.font(.title2.bold())` with `.minimumScaleFactor`, and `ViewThatFits` (or a width check) for the monogram, using the same hash.

### 2026-10-25: Ideas go through Claude; GitHub issues are the one list of work
The owner's ideas were spread across GitHub issues, notes and a reminders app, at very different levels of detail ("import" in one place, a full spec in another). Now:
- **Capture through Claude.** The owner sends ideas and direction changes to Claude, often one line from a phone. The `idea` skill (`.claude/skills/idea`) reads the code and docs, asks at most three quick questions, and files a detailed issue, or comments on an existing one. Direction changes update the brief, `PRODUCT.md`, the `CLAUDE.md` files and this log, through a pull request.
- **GitHub as the backup.** When Claude isn't available, the "Quick idea" issue form takes a title only and labels it `inbox`; the `triage` skill expands it later.
- **Labels are the source of truth** for status (`inbox`, `needs-decision`, `ready`, `in-progress`), priority (`P0`–`P2`) and area (`web`, `ios`, `database`). A "Stubbed roadmap" project board auto-adds the repo's issues and only displays them, so agent sessions never need project access.
- **One issue per run.** The `next` skill builds the top `ready` issue into one pull request that closes it.
- **The brief keeps direction, not the list.** "Roadmap and ideas" moved out of the brief's remit in `CLAUDE.md` and `PRODUCT.md`.

### 2026-10-25: A show catalogue from Wikidata; official artwork stays inside the app
Reverses the 2026-10-12 call against a seed catalogue (noted in #1): shows were added inline, by import or from OpenStreetMap only. The owner wants consistent titles, no duplicate shows and a diary that looks finished, as in Mezzanine. Epic #147.
- **Source: Wikidata** (CC0), for the few thousand musicals, plays, operas and dance works with a Broadway or West End production (#145). No scraping of IBDB, Playbill or similar sites, whose terms forbid it.
- **One row per show:** `shows.wikidata_id` is unique. The log form's show search uses our list first and then Wikidata, and picking a Wikidata result upserts on that ID; typing a new show goes through a "Did you mean…?" step (#146). Users can still add any show, so fringe and local productions keep working.
- **The catalogue is optional.** It's an enhancement, never a dependency: the app works just as well with an empty catalogue, when Wikidata is slow or down, and for shows the catalogue doesn't have. User-added shows get every feature catalogue shows get, no feature requires `wikidata_id` or artwork, and tests run against an empty catalogue. Stubbed covers any theatre, anywhere, and most of that will never be in Wikidata.
- **Artwork** comes from each show's official website share image, fetched by an admin script (#132). It appears only inside the app, for signed-in people, and never on share cards, public pages or link previews: those are published by our users, and posters belong to the productions. Removed on request, and never fetched again.

### 2026-10-25: The logo: two tickets in three variants; its gradient is brand art
Owner's pick after comparing options. The logo is two admission tickets, drawn in code (`brand/make_logo.py`) so every asset comes from one source, in three variants: the **app icon** (E1: the gradient tile with white outlined tickets), the **mark** (A2: gradient tickets, transparent) and the **outline mark** (E2: gradient outlines, transparent). Each has a job: the icon for app icons, the browser tab and anywhere the background is unknown; the mark beside the wordmark on light backgrounds (website and web app headers, sign-in, welcome, link previews); the outline mark for large decorative uses and as the base of the iOS dark and tinted icons.
- **The gradient (magenta #e8247f, coral #ff5a5a, amber #ffa040) is brand art, not a UI colour.** It's an exception to "one tint": interface elements keep `tint`. The owner found a flat on-palette version too plain; big consumer and SaaS icons carry gradients when they're bold and simple.
- **Assets:** `brand/render.py` writes the web favicon (`favicon.ico`, `icon.svg`), `apple-icon.png`, PWA icons and a web manifest, downloadable SVG and PNG files in `public/brand`, and the iOS `AppIcon` with dark and tinted versions for iOS 18+ (no alpha channel, as the App Store requires) plus `BrandMark`. It renders with a headless Chromium; Quick Look flattens transparency onto white.
- **Lockup:** the mark before the wordmark at 1.05× its size with a 0.28em gap (`<Wordmark mark />` on the web, `Wordmark(mark: true)` on iOS). The footer and share-card hero keep the wordmark alone. Replaces the placeholder iOS icon (`scripts/make-app-icon.swift`, removed).

### 2026-10-26: Priority is the board's order, not labels
Updates "Ideas go through Claude" (2026-10-25). The owner wants to prioritise by dragging, not by labelling. Work is grouped into small epics (one outcome each; every issue is a sub-issue of exactly one epic), and:
- **Epics** are ranked by their top-to-bottom order in the "Stubbed roadmap" board's "Epics to prioritise" view. GitHub stores that order, and the `next` skill reads it through the project API.
- **Issues within an epic** follow the epic's sub-issue order, which the owner can also drag.
- **`P0` stays** for the rare urgent issue that jumps the queue. `P1` and `P2` are retired.
- **Trade-off:** reading the board needs project access (`read:project`), which this Mac's GitHub login has but cloud sessions may not. Without it, `next` asks the owner which epic is next instead of guessing. Status labels (`ready`, `needs-decision`…) are still the source of truth for status.

### 2026-10-26: The favicon is the mark, not the app icon
Owner's call. The browser tab icon (`favicon.ico`, `icon.svg`) now uses the mark (A2) squared up on a transparent background, so the tab matches the logo in the header. Home-screen icons (`apple-icon.png`, the PWA icons) stay on the app icon tile, because iOS and Android fill a transparent icon with black or white. Updates "The logo: two tickets in three variants" (2026-10-25).


### 2026-10-27: Report and block, before the App Store
App Review guideline 1.2 asks apps with user content to let people report content and block users, and to act on reports. Moderation was Phase 3's "hooks"; it's now built, on web and iOS (#144, #176):
- **Blocking hides people from each other both ways.** Postgres decides (`blocks`, `profile_is_visible`, the follows, likes and comments policies): a blocked person can't see the blocker's profile, shows, likes or comments, and can't follow them; the blocker sees a "You've blocked @x" page with Unblock. Blocking ends follows both ways and removes the blocked person's likes on the blocker's shows. They aren't told. The web's public pages read through the publishable key, so they also ask with the visitor's session and show a 404 to someone who's been blocked.
- **Reports** cover a show, a comment or a profile, with a reason, an optional note and "Also block". Only admins read them, at `/app/admin/reports`, where Hide deletes the comment or makes the show or profile private, and Dismiss leaves it. A report keeps a snapshot of the text, so it still makes sense after an edit.
- **Not yet:** an email to the owner for each new report (needs a Resend API key) and a way to tell reporters the outcome. Until then, check `/app/admin/reports` daily.

### 2026-10-27: Sign-up is open to everyone
Owner's call ("user should be able to sign up going forwards"), answering #149's open question: open to everyone at once, not waitlist batches; no captcha unless abuse shows up.
- **Web:** `/signup` (Apple, Google, or email + password of at least 8 characters), `/forgot-password` and `/reset-password`. Email accounts confirm by email first.
- **iOS:** "Create an account" and "Forgot your password?" sheets on Sign in. The confirmation email carries a 6-digit code as well as the link, so the app confirms without leaving it; the reset link opens the web.
- **Email links** go to `/auth/confirm` with a token hash (`supabase/templates/`), not a PKCE code, so they work in any browser, including a phone's mail app after signing up in the iOS app.
- **Waitlist retired:** the landing page, join cards and prompts now lead to sign-up, and the Kit form code is removed. The list stays in Kit (and the old `waitlist` table) for one "we're open" email; `/confirmed` now points old links at sign-up.
- **Hosted setup (owner):** turn on sign-ups and email confirmation, paste the two templates into Authentication → Emails, and check Resend's free 100 emails a day is enough.

### 2026-10-27: Google's own sign-in button and sheet, so Google names Stubbed
Owner's call (#179, #180): Google's account chooser said "to continue to tvjkuzyrqsikpmryqymy.supabase.co", which looks unfamiliar or phishy, because Google names the domain its redirect returns to. A Supabase custom domain would fix it but is paid.
- **Web:** our own neutral "Continue with Google" button, matching Apple's (owner's call, after Google's drawn button looked out of place). It opens Google's popup with Google Identity Services' code client (script from `accounts.google.com`, no npm dependency); the server action `signInWithGoogleCode` trades the one-time code for Google's ID token with `GOOGLE_CLIENT_SECRET` (`lib/google-oauth.ts`), passes it to `signInWithIdToken` and copies a new account's Google photo. Without the client ID or the secret, or if the popup is blocked, the same button uses the redirect flow. Google's branding rules allow a custom button with its "G".
- **iOS:** reverses "iOS Google sign-in without the GoogleSignIn SDK" (2026-10-14). Adds the `GoogleSignIn-iOS` package (owner's go-ahead) for Google's native sheet, then `signInWithIdToken` with a nonce, like Apple. Without `GOOGLE_IOS_CLIENT_ID` it falls back to the browser-sheet flow, so `stubbed://auth-callback` stays.
- Apple keeps its current flows on both.

### 2026-10-27: Stories goes straight to Instagram on iOS
Owner's call (#129). The share screen's Stories button now puts the selected card on the pasteboard as a sticker (on a dark backdrop matching the cards, or Instagram's own background when "no background" is on) and opens `instagram-stories://share`, per Meta's "Sharing to Stories" docs, so it lands in Instagram's story composer instead of the share sheet. Meta requires a Facebook App ID with each share: it lives in `FACEBOOK_APP_ID` (`apps/ios/Config/Shared.xcconfig`, not secret). Without it, or without Instagram installed, Stories opens the share sheet as before. `instagram-stories` is in `LSApplicationQueriesSchemes`. The `card_shared` event keeps `action: "stories"`.

### 2026-10-27: Share from the feed card on iOS
Feed cards (`PostCard`) get a share button after the like and comment counts, as on Instagram and Hevy. Your own show opens the same Share screen as the entry screen (cards, Stories, Download), drawn on demand; someone else's opens the system share sheet (`ShareLink`) with a line and a link to its public page, never a card, since a card is its owner's to post. Planned shows have no share button, and nor do other people's shows on a private profile, since their page only opens for approved followers. When the counts, share and trip pill don't fit on one line (a small phone, a long trip name, large text), the trip pill moves to a line of its own instead of being cut off, and the footer stops growing at the first accessibility text size. The card-drawing code moved from `EntryView` to `EntryShare` so both places send the same thing.

### 2026-10-27: The Apple sign-in secret rotates itself
Owner's request. Apple's client secret for web sign-in is a JWT signed with our `.p8` key and lasts at most 6 months, and hosted Supabase only takes the finished JWT, so it had to be regenerated by hand (2026-10-13). A scheduled GitHub Action (`.github/workflows/rotate-apple-secret.yml`, monthly and on demand) now signs a new 180-day secret with Node's built-in `crypto` (no dependencies), checks it against Apple's token endpoint before saving, saves it with the Supabase Management API (`PATCH /v1/projects/{ref}/config/auth`, `external_apple_secret`) and checks that Apple sign-in starts. Free on GitHub Actions. The `.p8` and a Supabase access token live in GitHub Actions secrets. iOS doesn't use the secret (native sign-in). Considered and set aside: a Supabase custom domain (paid) and moving auth to Clerk, Firebase Auth or Auth0, which manage the key themselves but would mean migrating every RLS rule off `auth.uid()`. Setup: `supabase/README.md`, Auth.

### 2026-10-28: The autopilot: drag an epic to "Ready for Claude" and it ships
The owner wants Claude to pick up an epic from the board without being asked, and to see it through to production.
- **Trigger:** the roadmap board's Status field gained "Ready for Claude" and "In review" (Todo, Ready for Claude, In Progress, In review, Done). User-owned projects send no webhooks, so a launchd job on the owner's Mac polls every 30 minutes (`scripts/autopilot/run.sh`, set up by `install.sh`). It must be this Mac: iOS builds need Xcode, TestFlight needs the owner's Apple account in Xcode, and the board needs the Mac's GitHub login with project access.
- **One epic at a time,** top of the "Ready for Claude" column first, in the autopilot's own clone (`~/Library/Application Support/stubbed-autopilot/stubbed`), so the owner's checkout is never touched. `claude -p` runs with an allow-list of tools; force-pushes, pushes to `main` and `supabase db reset` are denied.
- **The whole epic, merged when green** (owner's choices): one pull request per ready sub-issue in the epic's order; GitHub's checks must pass, and for iOS `scripts/dev build` and `test` on the Mac (iOS isn't in CI). Merging deploys the web app through Vercel.
- **Migrations are applied by Claude** (owner's choice): `supabase db push` before merging, using the database password from the Mac's Keychain. Exception, added by Claude: a migration that drops or irreversibly rewrites data is held for the owner, since it can't be undone.
- **One TestFlight build per epic,** after the last merge, when `apps/ios` changed.
- **Anything needing the owner** (`needs-decision`, `needs-human`, a failed check twice, a failed deploy or upload) moves the epic to "In review" with a summary comment. Claude never merges a red pull request or one it didn't open.

### 2026-10-28: iOS import by picking photos, held in memory
#155, scoped by the owner to stand alone: no stored drafts, no review list, nothing kept between sessions.
- **Where:** "Import from photos" under "Start with a photo" in the log sheet. A multi-select `PhotosPicker` (up to 100 photos) turns the sheet into `ImportView` in place (`AppRouter.startImport`).
- **Grouping on the device:** `PhotoImport.group` is the web's `groupPhotos` (`lib/import/drafts.ts`) ported to Swift, with the same thresholds (same date, within 5 hours, within 250 m of every located photo in the night). It stays in Swift rather than Postgres because it runs on EXIF that never leaves the phone. Nights come oldest first.
- **One form per night:** each night opens the normal `LogView` (`importing:`), titled "Night 2 of 6", with Save, "Skip this night" in the bottom bar, and Stop. It fills exactly as single-photo logging does, from the night's first photo (until #141); "Change photo" picks another.
- **Memory:** each photo is read once for its date, place and a thumbnail, then let go. A night keeps only its `PhotosPickerItem` and reloads its photo when opened.
- **Ahead of time:** `PhotoLookup` starts the nearby lookup and show identification as soon as a photo is read. The import starts the next night's while you're on the current one; single-photo logging uses the same type.
- **After saving** a night, the import moves on instead of opening the share screen; closing it with anything saved opens the Profile tab. `entry_logged` gains `source: "photo_import"`.
- **Fixtures:** `scripts/fixtures/import-*.jpg` are copies of `curtain-call.jpg` with only the EXIF date changed. `scripts/dev ui` now adds each fixture once per Simulator, so new ones reach Simulators set up earlier.

### 2026-10-28: Import callout until the first logged show
#194. New users start with an empty diary, so Home and the Profile diary (web and iOS) lead with one card: "Bring in the shows you’ve seen", Import from photos (primary) and Log a show / Track a show (secondary, each app's own wording).
- **When:** the user has no `logged` entries; planned ones don't count. It can't be dismissed and goes once a show is logged. Home counts with a head-only query on `entries` (iOS reuses `Profiles.loggedCount`); the diary uses the entries it already loads.
- **Where:** top of Home, above any posts from people you follow, standing in for the empty-feed state; on the diary, in place of "No shows yet", with planned shows still listed under Upcoming.
- **iOS:** the card's `PhotosPicker` opens the log sheet straight into the import (`AppRouter.startImport` now creates the sheet when none is open). Web links to `/app/import`.

### 2026-10-28: Import from photos on the iOS Profile tab
#195. Once a show is logged (and the callout has gone), Profile offers import in two places: an "Import from photos" row (`photo.stack`) at the foot of Seen, like "Plan a trip" under Upcoming, hidden while selecting; and the same item in the ⋯ Account menu. A `PhotosPicker` inside a `Menu` doesn't present, so the menu item sets a flag that `.photosPicker(isPresented:)` presents. Web already links to `/app/import` from its profile menu and sidebar.

### 2026-10-28: Never assume a show was at night
The owner: "it can be an afternoon show, we should never assume." Copy says **show** (or visit) where it said night: the iOS import reads "3 shows", "Show 2 of 6", "Skip this show", "1 show logged"; the import callout says "photos from shows you’ve been to … sorts them by show"; the landing page and the photo-identification prompt lose "night out" and "that night". In code the import's grouped photos are a `Visit`.
- **Trip nights stay,** because they're the trip's length (end date minus start date), not a guess about show times. iOS had been counting distinct show dates as "nights" on the trip and public trip screens; it now uses the trip's dates like the web (`Trip.nights`, `tripNights`), and hides the stat for a one-day trip as the web does.

### 2026-10-28: Stand-up is its own show type
Owner's request, and their choice to keep Comedy beside it (comedic plays and sketch) rather than rename it. `show_type` gains `standup` after `comedy`, labelled "Stand-up" on web, iOS and posters, and the photo and email identifiers can return it.
- **Older iOS builds:** the generated `ShowType` enum fails to decode a value it doesn't know, which would fail a whole feed or diary for builds from before this change. `Show` now decodes an unknown type as Other, so the next new type won't break older builds; builds already on TestFlight need updating once stand-up shows exist.

### 2026-10-29: Design system "Footlight Sweep": the palette comes from the app icon
The owner liked the logo's colours and found the app "fine but inconsistent and boring in places, especially on iOS". The review found why: the colour iOS actually showed for buttons, links and the selected tab was `tintText` #b33a19, a rust brown (the coral had been darkened until white text passed, and slid to brown); stars were mustard; peach avatars and rust text sat on cool iOS grey with system red beside them; and none of the icon's three colours (magenta #e8247f, coral #ff5a5a, amber #ffa040) appeared in the app. Of four colour-only options (coral accent; magenta for actions with coral and amber in supporting roles; the sweep on a warm ground; the sweep on system grey), the owner picked the last, "D".
- **Accent:** the icon's coral, one step deeper on light so white text passes: `tint` #dc2f4f (4.6:1 with white), `tint-text` #c4234a (5.7:1 on white, 5.1:1 on #f2f2f7). Dark uses the icon's coral exactly (#ff5a5a). `on-tint` is now white on light. The iOS app tint stays `tintText`, since `tint` falls short of 4.5:1 as small nav-bar text on the grouped grey.
- **Stars:** amber, #e07400 on light (3.15:1 on white, enough for graphics) and the icon's #ffa040 on dark and on the dark share cards.
- **The sweep:** the icon's gradient (`--sweep` / `bg-sweep`, `Palette.sweep`) behind avatars with no photo, iOS posters with no photo, an empty profile cover, and as a ring around your own avatar on the iOS Profile tab. Only white bold text sits on it, centred, where the coral midpoint gives 3:1 for large text; white fails on the amber end. The web keeps its "House Lights" typographic poster (now on cool wells) rather than turning it into a gradient tile.
- **Neutrals:** the web's warm paper neutrals are replaced by Apple's system greys (#f2f2f7 background, #e9e9ee fill, #6c6c70 secondary text at 5.2:1), so web and iOS share one ground. Web shadows move from warm brown to a cool near-black; the primary button's shadow is cast in Deep Coral Ink. This retires the Warm Shadow Rule and "nothing reads as cold grey".
- **Share cards** take the new coral and amber on their dark ground (web canvas, SwiftUI, `og.tsx` link previews, the share-sheet placeholder); the light trip card moves to the grey neutrals. The Instagram Stories background behind a sticker moves from warm brown to #1c1c1e → #3a1418.
- Destructive stays system red on iOS and #9e1b2c on the web. The coral accent sits closer to red than the old rust did; destructive actions are still separated by their own section and a confirmation dialog.
- `DESIGN.md`, `.impeccable/design.json`, the `/design-system` page data (`lib/design-system.ts`) and `apps/ios/CLAUDE.md` are updated to match, and so is the design-system artifact (https://claude.ai/artifact/2r1EvQn2286Y29ZJNgPfP6), renamed "Footlight Sweep" in place: its tokens gain `sweep-magenta`, `sweep-coral` and `sweep-amber`, since its token format takes no gradients.

### 2026-10-29: Optional Wikidata show catalogue, refreshed by a script (#145)
Reverses the 2026-10-12 choice against a seed catalogue, following the owner's implementation brief on #145. Existing local/user-created shows still work with no catalogue; there is no live dependency on Wikidata and no new npm dependency, API key or schedule.
- **Source:** Wikidata CC0. `P1219` is an IBDB show ID; `P1218` is a production ID and is not used. No IBDB or Playbill scraping. The sync sends an identifying User-Agent, pages candidates, fetches details in batches and retries 429/5xx with backoff.
- **West End:** live probes found no building instances of the class "West End theatre" (`Q1359589`), so that tempting rule would silently add nothing. Instead `supabase/scripts/west-end-theatres.json` records 38 reviewed building IDs, resolved by English labels and theatre-building type in Westminster/Camden; historical predecessor buildings of the Adelphi are omitted. Premiere venues use `P4647` or `P1191`'s `P276` qualifier. A probe against seven of these venues returned 26 works, including *2:22 A Ghost Story*, *The Audience* and *Made in Dagenham*. This is bounded source coverage, not a complete history of every production; extend the reviewed venue list when needed.
- **Mapping:** English labels/aliases, earliest `P1191` year (falling back to `P577`), official website and description. Opera subclasses win over musical; ballet/dance works map to dance; literary/dramatic works and comedic plays map to play. Film, album, TV, song and poster items are skipped; a 50-item live sample revealed a poster incorrectly carrying an IBDB ID, which motivated the last exclusion. Unknown types stay `other`. Websites/descriptions are fetched but not stored until a future feature owns their schema. Input duplicates prefer IBDB, then oldest known year, then numeric Wikidata ID. Existing catalogue identities are never deleted when source coverage changes.
- **Writes:** privileged `psql`, connection only via `SUPABASE_DB_URL` (local Supabase by default), no credentials in argv/output. Upsert and merge are one transaction. Only title/type/year/aliases refresh; inserts alone set verified and null creator. Dry run is a read-only transaction and previews merges against the proposed catalogue plus retained existing identities.
- **Merge safety:** immutable NFKD/lowercase title normalisation strips combining accents, collapses whitespace, removes leading "the" and a documented set of trailing theatre qualifiers. It does not guess transliterations or use aliases. Merge only a unique same-title/same-type candidate; multiple titles or any type disagreement stay for admin review. Locks protect the reference move/delete from concurrent inserts. Entry data and trip links stay unchanged; the existing updated-at trigger still records the reassignment. Only the service role may execute the security-definer merge.
- **Rollout:** apply the migration before merging, then the owner reviews a hosted dry run and explicitly runs the first hosted sync. No hosted writes during implementation, and no monthly action is enabled.

### 2026-10-29: Share cards v2: two designs, bigger type, an optional rating
The owner found the cards' logo, handle and stats too small, and the middle of the photo hard to see, and asked for something closer to Hevy's, with less data and a way to leave a low rating off (or post a card that tags the cast).
- **Two designs instead of three:** **Stats** (show of the year, the venue visit or times seen, and the rating across the top; the title on one line above the logo) and **Name only** (the title, the stars when shown, the logo). The venue · date line is gone from both.
- **Bigger:** stat labels 15 → 20, values 24 → 30, stars 20 → 24 (540-unit card). The logo is the ticket mark and "stubbed" at 36, the @handle 24 in white. The `@getstubbed.app` line under the wordmark is dropped from entry cards (owner); trip cards keep it.
- **The photo shows:** shade only behind the stats (top 150) and the bottom quarter, instead of the bottom half.
- **Rating toggle** on the share screen, beside Background/Transparent, hides the rating on both cards (Stats swaps in "Seen · 1st time"). It starts off for 2 stars or below. Both versions are drawn up front, so the share sheet still opens straight from the tap. `card_shared` gains `rating`.
- **Tag @getstubbed.app:** that's Stubbed's Instagram handle; the share screen and captions said @stubbedapp.

## 2026-10-30 — Owner Profile stats and iOS Insights (#131)

Profile carries current-year performances, current weekly streak, all-time
longest weekly streak and a GitHub-style daily grid above Diary / Trips.
Insights pushes from Profile using native inset-grouped List sections, a system
year Picker, Swift Charts monthly bars, an on-device country choropleth and a
show-type radar with a readable percentage list. Existing theme, text styles,
SF Symbols and semantic surfaces apply; no new packages, shadows or brand tokens.
The tiny calendar cells are chart marks, with visual tap drill-down plus a native
calendar picker as the full-size/VoiceOver interaction alternative. Radar axes
are relative to the most-seen type; the exact share of visits is printed in the
list. Map boundaries are bundled public-domain Natural Earth 1:110m geometry;
small countries remain accessible through the country list. Country outlines use a fixed world projection rather than a live map camera, so compact screens show all countries at once and scrolling stays with the List.

Shared SQL owns aggregates, canonical country aliases, caller isolation and
calendar streak rules. Dates are performance dates; planned entries are excluded,
repeat/private visits count, and missing countries remain in totals. Current
streaks span calendar years and tolerate the unfinished current day/week;
selected-period longest streaks only use selected visits (weeks are Monday-first).
`own_insights` and paginated `own_insight_entries` are security-invoker RPCs,
explicitly scoped to auth.uid(), with no anon grants. The phone supplies its
calendar date for current-streak evaluation. Owner-only components are not added
to public profiles. Share cards remain independent, and this PR does not implement
the web Insights surface or public-profile stats. Synthetic screenshot fixtures
run only for InsightsUITests and never change hosted data.
