# Decisions

A short log of choices made and why, mostly about how things are built. Newest at the bottom. Product context (what and why) lives in the Google Drive [Stubbed folder](https://drive.google.com/drive/folders/1uYsjPogzITCDc_DNE5_gQtJrdEocfxRI); see "Where context lives" in `CLAUDE.md`.

## Open decisions

| # | Question | Needed by | Notes |
|---|----------|-----------|-------|
| 1 | Confirm architecture in `docs/ARCHITECTURE.md` (Next.js on Vercel Hobby + Supabase Free) | Now | Proposed 2026-10-12 |
| 6 | Badges: app-defined only, or user/group-defined too? | When badges are scheduled | Idea; see the brief's "Ideas to explore" |
| 7 | Discord: channel webhook vs. Discord login vs. server/bot integration | When Discord is scheduled | Idea; tied to groups |

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

### 2026-10-13: Stubbed's Instagram account (superseded: use @getstubbed.app)
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
Owner's call. Every share card (entry and trip, web and iOS) shows `@getstubbed.app` in small type under the `stubbed` wordmark, in the card's secondary colour, so a shared image leads back to the site. The handle stays on the right, level with the wordmark. The wordmark moves up a little and the domain uses some of the bottom padding, so the content area of each card is unchanged. The string lives in `CARD_DOMAIN` (`lib/share-card.ts`) and `cardDomain` (`EntryCard.swift`). The social-handle note above was later superseded: use `@getstubbed.app` in captions, shared text and Instagram links.

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

## 2026-10-30: Profile year summary and dedicated Trips destination

Replace the Diary/Trips segmented control with a permanent diary and a Trips navigation row above Insights. Trips are a collection of visits and open their own inset-grouped screen, with creation in its navigation bar. Keep diary bulk-selection and Add to trip unchanged.

The Profile summary is explicitly the current year, with an IN PROGRESS badge and equally weighted Shows, Weekly streak and Best this year metrics. Use the current-year insights response: the live streak can cross a year boundary; the best streak is limited to the displayed year. Stack metrics for accessibility text sizes. Keep the existing activity heat map and its accessible date action.

Public iOS profiles share the compact identity/counts layout and year-summary presentation, retaining Follow/Edit/More controls and omitting owner-only Trips and Insights navigation. A new SECURITY INVOKER public_profile_activity RPC computes public-only logged counts and weekly streaks under existing RLS, including private-profile approval and blocks; it never uses own_insights. Heat-map dates open a separately queried public date sheet. Apply migration 20261030211500_public_profile_activity.sql before releasing this client.

## 2026-10-30: Native Profile navigation rows and progress status

Trips and Insights rely on the List's native minimum row height instead of adding a 44pt label inside native row padding. Align the system separator to the leading content edge so it matches the separator above the rows. Preserve system Dynamic Type and row hit targets. The shared IN PROGRESS chip uses contrasting green text/fill tokens. Remove the public-profile footer remark while preserving public-only queries and RLS. This follow-up changes presentation only.

## 2026-10-31: Warm lime year status

Give IN PROGRESS more presence on owner and public profiles with native caption bold (previously caption2 semibold) and 12pt horizontal capsule padding (previously 8pt). Keep 4pt vertical padding and the existing accessibility-size stacking. The badge remains a status label.

Derive a warm lime around 91° hue by bringing Sweep magenta’s complementary green (about 152°) toward Sweep amber (about 30°). Light appearance uses #2D4D12 text on #BEF28C; dark uses #BEF28C on #263C17. The stronger lime fill complements the warm brand palette without adopting the reference app’s turquoise or conventional muted green. Text contrast is 7.46:1 in light appearance and 9.34:1 in dark appearance. Keep the pair scoped to progress status; the app’s interactive tint stays coral.

### 2026-10-30: Separate Settings from the profile card editor

The owner requested the non-notification UI slice independently of #137's
undecided delivery behaviour. Web and iOS now use a Settings hub for profile,
privacy, import, help and account actions. The Profile navigation action is a
gear; a labelled pencil lives in the identity card it edits (an explicit
exception to iOS's usual navigation-bar edit placement). The editor writes
identity fields only; the separate privacy form writes only `is_private`, so
saving an older profile draft cannot overwrite a newer privacy choice. Existing
public-profile Edit actions target the focused editor. No backend/schema changes
or notification controls are included. Web's global mobile overflow is removed
in favour of the Profile Settings entry point; desktop import/sign-out shortcuts
remain available. At accessibility text sizes the iOS identity header stacks
below the avatar/pencil, and counts use vertical labelled rows to avoid cramped
text.


## 2026-10-31: Press kit placeholders (#229)

Build `/press` from the owner's press-kit document using existing public-page conventions and light Footlight Sweep tokens. Preserve the authorised product and founder copy; Personal Best informs section order only. Keep media and absent beta/App Store/creator links visibly pending and non-interactive, with commented drop-in tags. Use `LEGAL.email` for the support address specified by #236 rather than duplicating it. No third-party services or dependencies. The brand Instagram in the brief is not evidence of Felix's personal creator URL. #236 remains blocked on owner-supplied URLs; do not represent its acceptance as passed.


### Press kit owner clarification

The app is not published on the App Store, so show “Not published yet” rather than suggesting an outstanding available URL. The owner supplied `https://www.instagram.com/hellofelix__/` as the creator profile; use the canonical profile URL without QR/tracking parameters. Beta invitation remains pending; the existing public web beta is accessible through `/signup`, but no TestFlight invitation has been supplied for the press CTA.

### 2026-10-31 — Shared social notification policy and durable intake (#137, #241)

Five social categories have independent inbox/push choices, default on. Account push defaults on, subject to each installation's OS/browser permission. Desktop gets the shared inbox only. Rules stay in Postgres; a successful social action, source-event deduplication, grouped inbox update and outbox insert share one transaction. Raw event/inbox tables are not exposed to clients; recipient RPCs recheck live sources, blocks and visibility for both text and counts. Category-off stops new inbox rows, preserving history.

Timing is centralized in the service-owned `notification_policy` singleton, with named fields rather than client literals: 24-hour like groups, 5-minute like push collection, 24-hour push expiry and 90-day inbox retention. Values were explained to the owner; the owner requested easy configuration. Changing them requires a reviewed policy data migration. Push may reach both enabled native and web installations on the same phone (owner confirmed); there is no fingerprinting or automatic channel pairing. The existing Supabase Edge Function worker approach is approved subject to staying on Free; no schedule or hosted migration is enabled by these PRs. See `docs/notifications/architecture.md`.

### 2026-10-31 — Native push dispatch and registration (#242)

Use the existing Supabase Edge Runtime with a secret-authenticated, manually deployed worker; no extra vendor or active schedule. Application dispatch consumes a narrow queue contract and APNs sender contract. APNs signing, endpoint selection and provider response mapping are confined to the concrete adapter. SQL owns expiring leases, revision/destination uniqueness, eligibility rechecks, bounded backoff, expiry and invalid-registration removal. Generic alert copy is the default; optional previews contain actor/action/show but no comment body.

Device permission is separate from the account push preference. Native authorization is contextual and denied/revoked states never re-prompt. Returning to the foreground reconciles permission; sign-out/account switching rotates an installation identity and queues old cleanup durably. A separate random revocation secret permits deletion after auth expiry without exposing inbox data. Foreground native push refreshes shared activity without a duplicate system banner. Push-link resolution replaces its temporary route, avoiding Back returning to a redirect loop. Production device delivery and signing capability verification remain acceptance work; local tests do not prove APNs delivery.


### 2026-10-31 — Native notification routing and accessibility

Inbox rows use native NavigationLink chevrons and a typed resolver route carrying the observed revision. Resolution replaces the temporary route and marks only that observed activity read. At accessibility text sizes, avatars and unread state stack above full-width copy. Simulator regression tests verify row navigation, Back, interactive settings and the largest accessibility text size.

### 2026-10-31 — Mobile browser push without a store wrapper (#243)

Use standards-based Web Push with the approved pinned `web-push` library only at the Edge Function composition boundary. The application/SQL policy does not depend on it. The manifest has stable `/app` identity/start URL, root scope and standalone display. Explicit mobile eligibility includes iPhone/iPad Home Screen apps and supported Android browsers; capability alone does not make a desktop eligible. iPhone tabs explain installation; Android explains browser permission and optional installation.

Browser subscription registration is authenticated, private and tied to a random installation/revocation secret. Cleanup survives sign-out, permission loss and expiry; an old endpoint's expiry cannot delete its replacement. VAPID public/private ownership and deliberate key rotation are documented. The service worker displays/clicks notifications without caching authenticated pages. It verifies the current account before optional previews, otherwise falls back to generic text. Browser-required visible receipt, without an extra in-app banner, remains a draft foreground default pending owner confirmation; native APNs suppression and browser user-visible delivery are deliberately different contracts. Real iPhone Home Screen/Android delivery and runtime web screenshots remain outstanding; mocks/builds are not evidence of completion.


### 2026-10-31 — Repeat actions and concurrent mark-all reads

Owner confirmed a configurable 24-hour repeat-push cooldown, separate from inbox retention. Like/follow source rows receive immutable server-owned UUID generations. Reprocessing the same generation is a duplicate; a genuinely new request cycle becomes unread/actionable. Repeat like/relationship pushes are limited by actor/category/entry using queued-intent timestamps; distinct comments remain independent. Dispatch follows the latest queued intent, so a later inbox-only cooldown revision does not silently cancel an earlier legitimate queued alert.

Mark-all-read materializes the exact recipient row/revision snapshot in one statement. A numeric global cutoff alone could consume a late-committing activity revision. A synchronized two-transaction regression test covers that race and runs in the existing database CI job. Integration corrections live in the final migration, maintaining a single ordered migration sequence; the four draft PRs are reviewed as a dependent stack and must not be shipped independently before integration acceptance.

### 2026-10-31 — Simplify notification controls (owner-directed follow-up)

Supersedes the general preference and inbox-control decisions above. The owner removed Mobile push, permanent device/permission rows, preview privacy, quiet hours and in-app category settings. Keep only category push choices; the inbox always contains all eligible activity. OS permission, lock-screen previews and Focus/DND handle device behavior. Push payloads always include live eligible actor/action/show copy, never comment bodies; session/privacy checks remain mandatory.

A contextual permission card in the inbox and settings disappears when enabled. Denied/revoked state points to system Settings without another authorization request. The reference is Personal Best’s official press-kit cards (https://getpersonalbest.com/press): leading-aligned headline, supporting copy and one action. Its precise permission banner was not publicly verifiable, so this is an original native implementation rather than a claimed reproduction.

The cleanup migration removes notification_preferences, its timezone trigger/validation and general-setting RPC, category.inbox and notifications.inbox_enabled. Existing push-category choices, inbox/read state, live-source privacy, outbox leases/retries and timing policy remain. No deleted preference silently continues applying. Earlier hidden history becomes visible if its source is still eligible, within retention; no historical push is enqueued. Older TestFlight builds’ settings APIs are incompatible with this cleanup and must be replaced alongside the migration. Production rollout is separate from this PR.

### 2026-11-01: Press kit: real assets, generated from the app
The owner found /press (#246) didn't follow the reference (getpersonalbest.com/press) and had no assets (#254).
- **Layout:** the reference's single reading column (title, a dark "Try it out" card, links, a short fact list, what it is, story, enquiries), then screenshots and media at full width. Light theme, Footlight Coral tokens; the doc's emoji become small line icons (no emoji in public copy).
- **Assets are generated, not hand-made:** `apps/web/scripts/press-assets.sh` builds `public/press/` from real app output: the iOS app icons, the landing screenshots (`public/landing/`), and a stats screenshot from `MarketingUITests.testCaptureInsights`. Headless Chrome renders a framed transparent PNG per screen and a 1920×1080 landscape image per group (Home/Log, Share cards, Trip view, Stats); the share card is cut from the share screen; everything goes into one zip. Rerun it when the screenshots change.
- **The stats screenshot** is captured past the streaks: the sample diary has no current streak, and "0 weeks" reads badly in press.
- **No empty slots:** the video placeholder is gone until a walkthrough exists. The App Store line says "coming soon" (#247) and the beta button asks for a TestFlight invite by email (#236).
- **Size:** about 10 MB of images and a 5 MB zip in git. Acceptable for now; move them to a CDN if the kit grows.

## 2026-11-01: Sharing controls follow the selected card (#124)

Remove the rating toggle and low-rating auto-hide. Data + Photo and Rating + Photo have separate content and eligibility; an unrated or photo-less entry never fabricates a rating card. Background cards alone own solid, gradient and transparent variants, including light/dark transparent ink. A selected background never affects a photo preview or any export action. Stable design IDs replace positional selection, actions use a native three-column grid, and drawing shows a card-shaped placeholder. This introduces the full Data background as the control/rendering foundation; Encore and Show number follow in #140.

## 2026-11-01: Entry sharing set and count illustrations (#140)

The entry set is Data + Photo, Rating + Photo, full Data, Encore and Show number. Photo designs require a usable photo; Rating + Photo also requires a saved rating. Encore appears only on repeat visits. The two count illustrations use a large seal with ribbon details inside the square, with no awarded-badge state or invented thresholds. All attendance numbers retain entry_card_stats' historical semantics. Missing venues remove a metric rather than duplicating times seen. Optional Compact Data remains deferred.

Entry destinations are keyed by entry ID. The repeat-visit UI test exposed NavigationStack reusing the prior entry's loaded cards and share-offer state when a save replaced a same-show destination. A newly logged visit must load its own counts and offer its own share screen.

## 2026-11-01: Share Insights without recomputing counts (#256)

Insights now opens the existing share screen for Weekly streak, Year in theatre and Show mix. All cards are backgrounds, with the same alpha/ink variants and fixed footer as entry cards. Current streak is live across year boundaries and only offered in current-year/All time context; historical years never relabel it. All time offers the radar and live streak, not a fake single-year recap. Empty periods do not produce an achievement. SQL's logged/private/repeat handling is unchanged. The spider chart uses the existing seven categories and most-seen-category scale, with counts and percentages on its axes. No public entry link or entry caption is invented. Insights UI suites use the existing synthetic diary only in the local test runner.

## 2026-11-01: Web sharing uses the same eight layouts (#257)

Canvas exports mirror the five entry and three Insights compositions, with explicit photo/background capabilities. Each background design pre-renders solid, gradient and both transparent inks; photo designs render a single immutable asset. This keeps the selected file ready for the browser's synchronous share gesture and makes the background picker incapable of changing a photo export. Stable design IDs handle eligibility changes. Published blob URLs survive cached-page hiding and are revoked only when replaced; canceled unpublished renders are discarded.

An owner-only Profile link opens `/app/insights/share` with a period selector and the existing caller-only `own_insights` RPC. This ships aggregate sharing independently of the full web Insights page. The browser supplies its local day, as iOS does. Entry cards keep historical SQL ordinals; missing logged-entry stats fail rather than presenting fabricated zero ordinals. Trips retain their existing renderer and public-link policy. No additional database schema, counters or dependencies are introduced.

### 2026-11-01: Show the attached photo on an owner's entry (#126)
The entry Form leads with the existing signed photo at 4:5, with no row insets so the system grouped section supplies its corners. Entries without an attachment offer a quiet Add a photo row that opens the existing editor. The display reuses the private-bucket signed URL already loaded for sharing; it adds no storage or privacy paths.

### 2026-11-01: Give text-only feed posts an initials poster (#127)
Posts without a photo use the existing 48×64 Poster beside the show title, venue and stars. Their title uses bold title3 to lead the smaller handle, while notes retain the full card width. Photo posts retain their full-width 4:5 image and headline title. This brings the feed into line with the existing iOS design rule and diary/trip poster treatment.

### 2026-11-01: Native iOS controls and rating interaction polish (#128)
Onboarding is a native Form with field feedback in section footers and Continue in the navigation bar, keeping it reachable above the keyboard. The log start uses a native prominent photo picker and scrolls at large text sizes. Rating input scales its stars with Dynamic Type, fits the available width, keeps its spoken value without a bare numeric caption, and separates taps from directional drags so vertical Form scrolling does not change a rating. VoiceOver retains half-star adjustment and gains Clear rating. Logging entry points consistently say Log a show. Trip creation stays on Trips rather than Upcoming; request responses sit beside profile navigation without a redundant chevron, and stack at accessibility text sizes. Entry navigation uses Show so the title does not repeat. The public-profile cover-band request was already superseded by the compact profile redesign.

### 2026-11-01: The autopilot is removed
Owner: "kill the autopilot, it doesn't work well." Reverses the 2026-10-28 autopilot. `scripts/autopilot/` is deleted and the working agreement is gone from `CLAUDE.md`; nothing polls the board any more. The `epic` skill stays for when the owner asks to "build epic #N" in a session, without the board-column moves. The board's "Ready for Claude" and "In review" columns no longer trigger anything.

## 2026-11-01: Share actions back to the round icon row

The owner preferred the earlier share actions over #263's three-column `.bordered` grid, so the actions are the round 56pt icons in a horizontally scrolling row again (Instagram-gradient Stories, then More, Download, Copy text, Link), with the "Share your show · Tag @…" caption and a reserved notice line. The Background and Text colour pickers from #263 stay, and the rating toggle stays removed. The Share screen is an exception to the "`.bordered` buttons, never a custom style" rule, like the share cards themselves.

## 2026-11-01: Background picker sheet, four grounds

Following Hevy, a data card's background is chosen from a sheet opened by a Background action at the start of the action row, replacing the segmented pickers on the page. The action is always there on entry shares, showing the current ground, and is dimmed on photo cards, which have none.
- **Four grounds:** Dark (the old Solid; raw value still `solid` so analytics stay comparable), Light (white, new), Gradient and Transparent. Light draws dark text.
- **Text colour only for Transparent.** Its Light/Dark swatches appear in the sheet only then; every other ground sets its own ink, and a leftover choice is ignored when exporting.
- The sheet is a `.medium` detent with background interaction enabled, so the card above stays undimmed and updates as you pick.

### 2026-11-01: The background sheet keeps the whole card in view
Follow-up to #295, from testing it on iPhone 17e. The sheet is now sized to its contents (a plain header instead of a navigation bar; taller only when Transparent adds Text colour), and while it's up the card shrinks to fit above it, so every choice shows on the whole card, small phones included. The sheet has a solid background, and the action row and tag line fade out beneath it, since iOS 26's floating sheet showed their ends beside it. With Transparent and Dark text, the preview's checkerboard turns light so the text reads; exports are unchanged.

## 2026-11-01: All sharing layouts in the show carousel (#297)

The owner expected the eight layouts in one place after sharing a show. Entry sharing now appends the three existing current-year Insights cards, using the owner’s current stats even when the selected entry is historical. Entry ordinals retain their original date-based context. Aggregate cards carry explicit current-year/live labels and never inherit a show caption or public entry link; returning to an entry card restores its actions. Aggregate filenames contain the stats design and period, without an entry title. The standalone Insights period selector remains.

The count badge is available from the first visit: “First visit” at 1×, “Encore” from 2× onward, per the owner’s follow-up. Its stable design ID stays `encore`. Photo and rating prerequisites remain real requirements. To keep all three stats templates available from an older show even when this year has no visits, show truthful zero totals/charts and “No current streak”; the standalone empty Insights view keeps its existing empty state. No counts or achievements are invented. The current native round action row, background sheet and Light option are preserved.

### 2026-11-01: Productions and runs, our own catalogue data, and no cloud AI
Owner's calls after reviewing the show catalogue and logging plan against the code and hosted data (1 user, 29 entries, 3,340 shows, 25 venues, already two duplicate venues and three spellings of London). Planned, not built: #147, #272, #273.
- **Productions and runs.** Reverses "production deliberately omitted". `productions` (a staging of a show) and `runs` (a production at one venue between two dates; a tour is many runs). Entries keep show, venue and date, and gain a nullable `production_id`, set to null if its source data is removed, so no entry is ever lost to a licence ending (#276).
- **Crawled, not curated.** The owner won't curate data by hand, so a crawler fills productions and runs going back 20–25 years: Wikipedia (#277), then IBDB and Playbill (#287), monthly on GitHub Actions (#288). **Including IBDB and Playbill is the owner's call and reverses the 2026-10-25 "no scraping" rule**, knowing the Broadway League's terms forbid automated harvesting; the risk is being blocked or asked to remove the data. So each source can be switched off and its rows deleted, their pages are parsed by code only (never sent to a model), and only facts and source links are stored. It also crawls theatre → shows: a theatre list (West End, Off-West End, pub, Broadway, Off-Broadway, UK and US regional, stored as `venues.circuit`, #290), each theatre's own pages (#291) and Wayback Machine snapshots of its What's on page back to about 2001 (#292). Shows the crawl finds that aren't in the catalogue are created with `source = 'crawler'`, unverified. A cheap model reads only pages the rules can't parse (Wikipedia prose, theatre websites, Wayback snapshots), capped per run, in the admin crawler, never in the app. Epic #289. Runs carry a confidence score: high-confidence runs fill the show, the rest are chips. Edinburgh Festivals API and Theatricalia come later.
- **Venues stay flat:** each auditorium is its own venue. Cities are normalised to one value per city (#274).
- **Typed-in shows stay visible to everyone.** "Did you mean…?" before adding a show or venue, plus an admin merge, instead of a creator-only shadow catalogue (#146, #274).
- **No live Wikidata search, and no wider sync for now.** The catalogue stays at the 3,322 shows from #202; #205 was closed on purpose while the approach is revisited (#146, #275 closed).
- **User-taught aliases get their own table,** because the Wikidata sync rewrites `shows.aliases` (#35).
- **No cloud AI.** Claude photo detection and email extraction are both removed. The web suggests shows from EXIF date, nearby venues and our runs/entries (#278). iOS also reads titles and printed dates with Vision on the device (iOS 17+), with Foundation Models optional behind an availability check if the spike shows it helps (#279, #280). Photo detection goes only after those land, so logging doesn't get worse (#281). Email import is paused: the option leaves the web import tool, and #3 decides what comes back (#282).

## 2026-11-02: Repeat-show leaderboard in iOS Insights

Most-seen shows sits directly after Activity, per the owner’s layout follow-up, and follows the selected year or All time. It includes only shows with at least two logged visits in that period, including private entries and visits without a venue. Postgres groups by show ID, ranks by visit count (equal counts share a rank), and sorts ties by title then ID. Separate catalogue shows with identical titles remain separate. Each native navigation row opens the existing paginated visit list filtered to that show and period. The optional show filter replaces the prior RPC signature with a defaulted parameter so existing clients can continue omitting it without overload ambiguity. Planned visits remain excluded. Apply the migration before releasing the updated iOS client.

### 2026-11-02 — Native notification response completion on the main actor (#242)

Tapping a like alert reproduced a cold-start crash in the simulator:
`NSInternalInconsistencyException: Call must be made on main thread`.
The symbolicated stack enters UIKit state restoration from the generated
Objective-C closure for the async `PushAppDelegate.userNotificationCenter(_:didReceive:)`
on a cooperative executor. Moving only the observable-state assignment to
`MainActor.run` did not move the generated completion there.

Use synchronous, explicitly nonisolated UserNotifications delegate callbacks.
Extract a UUID before crossing executors, then update pending navigation and
invoke the system completion on the main actor. Malformed IDs, dismissals and
unsupported actions still acknowledge on main without navigating. Foreground
receipt keeps the existing inbox-only presentation and also completes on main.
No unsafe actor assumptions, blanket concurrency suppression, SDK dependency or
backend changes are needed. A simulator regression taps actual system alerts
from background and terminated states; physical TestFlight retesting remains
separate acceptance work.

## 2026-11-02: Share every Insights section

Each Insights section has one system share symbol with a 44pt hit target in its header; Overview places it beside the headline count. The control is absent when its section has no shareable data. It opens the existing background-capable carousel on that section’s design, while the navigation-bar action opens the full collection. Streaks offers current weekly/daily and best weekly/daily designs, with current streaks limited to current-year/All time contexts and bests labelled with the selected period. Overview gains an All time design; Activity exports the displayed calendar year even in All time mode; Year by year always exports the complete history, with empty calendar years left as gaps. Most-seen shows exports the first five ranked shows; Around the world reuses the bundled country geometry and lists the top three country counts. Cards keep the established footer, square export and five background/ink appearances. The show-entry carousel retains its existing eight layouts. Most-seen shows follows Activity on the page. The Activity chart height and share-action icon grounds scale with Dynamic Type to keep axis labels and symbols from overlapping or clipping at accessibility sizes. No backend migration is needed.

## 2026-11-02: Prepare stats sharing on demand and retain coral

Stats sharing previously waited for the profile read and all eligible designs in five appearances (up to 50 PNG exports). Insights now prefetches the footer handle while browsing. The share carousel lists design metadata up front, prepares only the selected design’s five variants, and keeps completed designs for the lifetime of that sheet. Swiping or dismissing cancels unused work; rendering yields between variants so the native progress indicator stays responsive. A failed preparation offers Retry. Share actions stay disabled for an unprepared selection, even if another design is cached. The placeholder and finished artwork use the same explicit square dimensions.

All iOS stats designs retain coral in charts, heatmaps, streaks or leaderboard ranks. Light backgrounds/dark transparent ink use the page’s deeper coral; dark backgrounds/light transparent ink use the brighter coral for contrast. Labels and other text keep their selected ink. The country map draws its polygons in one Canvas pass and uses the full card content width at its natural aspect ratio; the country count sits beside the title so the larger map and country list still fit. This is presentation-only and requires no database migration.

### 2026-11-02: Show nicknames people teach (#35)
`shows.aliases` belongs to the Wikidata sync, which rewrites it, so nicknames users teach ("Les Mis", "Lez Miz", "MJ") live in `show_aliases`, one per show however it's written (unique on the normalised text). `search_shows` reads both and lists each show once, at its best match.
- **How they're taught:** after a search that found nothing, picking a show asks "Remember 'X' for this show?" (inline on the web, an alert on iOS). Not when the miss was the same search overtyped. On the web, an email import mapped to an existing show saves the email's title quietly.
- **Only useful ones are kept:** `remember_show_alias` skips anything search already finds in its top 3 (a retyped title, a typo), so ticket titles like "HAMILTON" add nothing.
- **No review for now** (#35 triage); `created_by` is kept for moderation later (#4). Anyone signed in can add; creators edit or delete their own. `merge_into_catalogue` moves a merged show's nicknames to the catalogue show, and #274's `merge_shows` must do the same.

Most-seen shows sits below the overview and follows the selected year or All time. It includes only shows with at least two logged visits in that period, including private entries and visits without a venue. Postgres groups by show ID, ranks by visit count (equal counts share a rank), and sorts ties by title then ID. Separate catalogue shows with identical titles remain separate. Each native navigation row opens the existing paginated visit list filtered to that show and period. The optional show filter replaces the prior RPC signature with a defaulted parameter so existing clients can continue omitting it without overload ambiguity. Planned visits remain excluded. Apply the migration before releasing the updated iOS client.

### 2026-11-02: Pro: commercial decisions and the technical contract
Supersedes "Monetisation is deferred" in `CLAUDE.md` and `PRODUCT.md`. Epic #219; contract issue #258; full contract in `docs/PAYWALL.md`.
- **Owner's decisions:** one paid tier, "Pro" for now, with the name in config; monthly £2.99 and annual £19.99; a 30-day trial on every plan; no special treatment for existing users; iOS and web at launch; RevenueCat for both, with Web Billing (Stripe) on the web. Free/Pro line from 1 Nov: this year's stats are free except Show mix; Show mix, earlier years and All time are Pro.
- **Prices and trials live in the stores**, read at runtime from RevenueCat offerings, so they change without a release. The tier name and two switches (`paywall_sales_enabled`, `paywall_gates_enabled`) live in `app_config`.
- **One access policy in Postgres** (`feature_access` + `has_feature`). Gated responses keep their shape, return locked fields empty and list them in `access.locked`, so the current iOS build (non-optional fields) keeps decoding and never receives paid values.
- **"This year" is the server's**: the client's `today` is clamped to the server date ± 1 day, so it can't unlock an earlier year.
- **Membership is written only by the server**, from RevenueCat's API state on each webhook, on demand after purchase, and in a daily reconciliation, keyed to the Supabase UUID as RevenueCat's App User ID.
- **Vercel Hobby is non-commercial**: web sales need a commercial plan first (owner will handle; noted on #261).

### 2026-11-02: "Did you mean…?" before adding a show or venue (#146)
Typed-in shows and venues stay visible to everyone, so duplicates are stopped before they're added rather than hidden. Live Wikidata search was dropped in the #147 review; this uses our own tables only and finds nothing, harmlessly, with an empty catalogue.
- **Tidy titles in Postgres** (`tidy_show_title`): no "(Broadway)", "- UK Tour", ": The Musical" or ticket parts after a dash, bar, comma or colon ("- Premium Orchestra", ", Stalls Row F"); all-caps titles of 5+ characters in normal case, so "MJ" and "SIX" stay. A trigger applies it to every user-added show on insert, from any app or the import; catalogue titles are left as Wikidata has them.
- **`similar_shows` / `similar_venues`** return up to three close matches. `same` marks the same one: equal once tidied and normalised (ignoring spaces, apostrophes and theatre/theater, or a nickname), and for venues also under 2 km away or, without locations, in the same city. Saving (web `ensureShow`/`ensureVenue`, iOS `Entries`) and import matching reuse a `same` match outright; other matches are offered.
- **Where it's offered:** web shows "Did you mean…?" under a new show or hand-added venue (including import drafts); iOS asks in a dialog when "Add …" is tapped. Offline on iOS, it adds as typed.

## 2026-11-02: Public About and FAQ guides (#228)

The existing content-page shell now exposes About and FAQ through the shared public header, footer and sitemap; Settings also links to About. FAQ content lives in a typed, server-safe data module so the rendered sections, numbered instructions, FAQPage JSON-LD and llms.txt use the same answers. Topic anchors keep the guides directly linkable without adding client-side state or dependencies. Public headers wrap on narrow screens to accommodate the additional navigation.

The owner's About draft supplies the founder story. Public instructions were checked against the web forms, import parser, photo pipeline, account deletion action and database visibility rules. Email forwarding, TheaterDiary CSV import and self-service CSV export are explicitly unavailable; CSV export stays future-tense. Guides say when they describe the website rather than assuming identical iOS controls. Photo help distinguishes stripping embedded metadata from using date/location as detection context; deletion help distinguishes the live service from backup retention and the shared catalogue.

### 2026-11-02: Merging duplicates and one city per venue (#274)
- **`merge_shows` / `merge_venues`** (service role only) move entries, and aliases for shows, then delete the duplicate in one transaction, with the same table locks as `merge_into_catalogue()`. Trip links and likes hang off the entry id, so they follow untouched. A show type mismatch is refused unless forced. Productions and runs join these functions in #276.
- **`canonical_city(city, country)`** plus a trigger on `venues`: London boroughs and OpenStreetMap areas (Greater London, City of Westminster, …) become "London"; New York boroughs become "New York". The rule is in SQL so web and iOS agree; existing rows were backfilled.
- **Admin script** `supabase/scripts/merge.mjs` lists candidates and merges one pair. Merges are dry runs (rolled back) unless `--apply`. No admin screen: one owner, so a script is enough.


### 2026-11-02: Email import paused (#282, part of #273)
- The web import tool takes photos only. `/api/import/email`, the email extraction and parsing code, and their tests are gone. Pasted or uploaded emails are never sent anywhere. #3 decides its future.
- `lib/ai` stays until #281 removes photo detection, its last user. The privacy page, FAQ, press and landing copy no longer mention emails.
- Owner action: remove `ANTHROPIC_API_KEY` (and any Groq, Gemini or Cerebras keys) from Vercel once #281 has shipped. The brief's "Import credits" monetisation idea no longer has LLM spend behind it.

### 2026-11-02: Claude photo detection removed (#281, part of #273)
- The owner chose to remove it now, ahead of the catalogue suggestion (#278) and on-device reading (#280). Until those ship, logging a photo fills the date and nearby theatres only; the show is picked by hand. Imports make one blank draft per photo with its date, nearby theatres and city.
- Gone: the identify step in the log form and import tool, `lib/identify.ts`, all of `lib/ai`, `/api/ai/providers`, the admin model-compare page, `@anthropic-ai/sdk`, and the AI env vars. `/api/photo/identify` now answers `410 {"error":"gone"}` so builds already on TestFlight show "no suggestion"; delete the route once they're gone.
- The privacy page, terms, FAQ and `.env.example` no longer mention AI providers.
- Owner action: remove `ANTHROPIC_API_KEY` (and any Groq, Gemini, Cerebras keys) from Vercel.
- 2026-11-03: `/api/photo/identify` deleted at the owner's request (#334). Older TestFlight builds now get 404; the last build that called it treated any status other than 200 or 503 as a failed lookup, so a 404 reads as no suggestion, same as the 410 did. `ANTHROPIC_API_KEY` stays in Vercel (owner's choice).

### 2026-11-02: Spike: Vision text recognition on theatre paper (#279, part of #273)
**Verdict: Vision only. No Foundation Models for now.**

What was measured: `StubbedTests/PhotoTextSpikeTests.swift` draws 13 pieces of theatre paper with known text (3 programmes, 3 Playbills, 4 tickets, 3 posters, in Helvetica, Georgia italic, Courier and Futura), then renders each clean, tilted 4°, dimmed and blurred. It runs `VNRecognizeTextRequest` (`.accurate`, language correction, en-GB and en-US), ranks a 40-title catalogue against each line and pair of lines (a stand-in for `search_shows`), and reads dates with `NSDataDetector`. Run time is on the iPhone 17 Pro Simulator at 3600×4800 px.

| Kind | Variants | Title top-1 | Title top-3 | Printed date | Time per image |
|---|---|---|---|---|---|
| Programme | clean, tilted, dim, blurred (3 each) | 12/12 | 12/12 | n/a | 1.7–3.6 s |
| Playbill | same | 12/12 | 12/12 | n/a | 1.5–3.2 s |
| Poster | same | 12/12 | 12/12 | n/a | 1.5–3.2 s |
| Ticket | same (4 each) | 16/16 | 16/16 | 15/16 (blurred "14 September" split across lines) | 1.5–3.3 s |

**These numbers are a best case and are not accuracy on real photos.** The fixtures in `scripts/fixtures` are flat colour blocks with no text, so they can't be read. Real photos (glare, angle, a hand in shot, stage-door posters) will do worse. Before #280 ships, run the harness on the owner's own photos: put them in a folder named like `ticket--Hamilton--2026-08-21.jpg` (kinds: programme, playbill, ticket, poster) and pass `TEST_RUNNER_SPIKE_PHOTOS=<folder>` as well (the command is in the test file's header comment). Any kind that scores under about 80% top-3 gets "pick from suggestions", not auto-fill.

Findings that shape #280:
- **Dates:** `NSDataDetector` returns today's date for a bare time such as "19:30". Keep only matches whose text has a month name or a day/month/year, and drop the rest.
- **"03/10/2026" follows the device's locale** (3 Oct here; 10 Mar in en-US). Use the venue's country (UK day-first, US month-first) when the venue is known, else offer both.
- Vision splits a line when it is blurred or wide. Match the title against each line and each adjacent pair, as the harness does.
- **Speed:** 1.5–3.5 s per full-size image on the Simulator. Downscale to about 2000 px on the long edge before reading, and read in the background like the nearby lookup does.

**Foundation Models: not measured.** It needs iOS 26 and an Apple Intelligence iPhone, and the Simulator has no model, so there are no numbers. Plain matching already finds every clean title, so the case for it is weak: it would add an iOS 26 availability branch for a gain nobody has shown. Revisit only if real photos show Vision text that matching can't use (an author line instead of the title, say). The owner can then time `SystemLanguageModel` on a device. The deployment target stays iOS 17.

### 2026-11-02: iOS reads titles and printed dates on the device (#280, part of #273)
Follows the spike's verdict (#279): Vision text recognition only, no Foundation Models.
- **Where:** `Data/PhotoText.swift`, started with the nearby lookup in `PhotoLookup`, so single-photo logging and the import use the same path. Photos are read at 2,000 px on the long edge. Nothing is uploaded for reading; only the catalogue lookup (`search_shows`, `search_venues`) uses the network.
- **Show:** the biggest printed lines, and adjacent pairs, are looked up. Exactly one catalogue show that matches a line fills an empty show field; several matches become "Maybe …?" rows. A hand-picked show is never changed. `#278`'s `suggest_shows` doesn't exist yet, so there is nothing to merge with; do that when it ships.
- **Paper vs stage photo:** a photo with a printed date, or two ticket words (row, seat, stalls…), is a ticket or programme. Then its printed date replaces the photo's own date, and a theatre named in the text is matched to a saved venue; the single nearby theatre is no longer filled in. A stage photo behaves as before.
- **Dates:** a printed date needs a month name and a year, or day/month/year as numbers. A bare time is not a date. `03/10/2026` is day-first except for a US venue; when the order can't be told and the country is unknown, there is no date.
- **Not done:** UI tests with ticket and programme fixture photos (the fixtures in `scripts/fixtures` have no text; the Simulator's photo picker also failed to find them in this environment). The logic is covered by 13 unit tests, including Vision reading rendered tickets offline. Real-photo accuracy is still unmeasured (#279).

## 2026-11-02: Sanity edits public copy; assets stay in code

Owner requested a CMS and implementation PR so landing, press and other public copy can be edited without a coding agent. Use Sanity Studio at `/studio`, with explicit singleton schemas for the existing copy slots. Preserve screenshots, logos, icons, generated artwork, ZIPs, route destinations and layout in the repository; provide no CMS asset-upload fields. Repository defaults keep unconfigured development/CI and CMS failures usable. Published reads use the published perspective and cache invalidation; authenticated Studio previews read drafts without persistent caching. A create-if-missing seed preserves existing editorial changes. FAQ HTML, structured data and `llms.txt` share edited answers. Account setup and ownership boundaries are documented in `docs/CMS.md`. No paid plan is required or activated.


## 2026-11-02: One cache for published CMS copy

Production continued showing an earlier headline despite successful signed webhook responses. Published reads now fetch directly from the Sanity API (`useCdn: false`, `cache: "no-store"`) inside the existing tagged `use cache` function, replacing the nested `sanityFetch` cache. This prevents an invalidated application cache from being refilled by a stale fetch/CDN result. The signed webhook expires `cms-copy`; the next visitor blocks on a current published read. Keep the 60-second revalidation lifetime and repository fallback. Draft reads retain their authenticated, uncached path. This trades an API request per cache refill for predictable publish freshness; live production verification remains necessary.


## 2026-11-02: Invalidate prerendered CMS route output on publish

After the direct-API fetch fix, production still served a Vercel cache HIT with `x-nextjs-prerender: 1` and an old headline after a successful webhook. The signed webhook now also calls `revalidatePath("/", "layout")` so prerendered page/layout output is regenerated on the next visit, alongside immediate expiration of `cms-copy`. Root-layout invalidation covers shared metadata/navigation and all copy consumers; it also invalidates other pages under that layout on infrequent editorial publishes. No token or draft-access changes.

## 2026-11-03: Photo text reading keeps reading all print (#332, part of #328)
Tried `VNRecognizeTextRequest.minimumTextHeight` to skip small print, on the spike harness (`PhotoTextSpikeTests`, Simulator, 52 synthetic images, `.accurate`). Ticket printed dates read: baseline 15/16; at 0.02, 0.015 and 0.01 all 14/16. Titles stayed 100% everywhere. Time per image did not improve (about 1.6–1.9 s at every value, baseline 1.6–1.7 s). So the threshold costs date accuracy for no measurable speed, and is not set. What did ship: the up-to-3 venue-name lookups in `matchVenue` run at once (same answer, one round trip), and `read` logs `photo text read in N ms`.

## 2026-11-03: Photo venue comes from saved venues first (#342, #343, part of #341)
Overpass was failing on every lookup, so each GPS photo sat out its timeout. Two changes: (1) the server skips Overpass for 10 minutes after every mirror fails (one trial lookup afterwards decides), Overpass waits 2 s instead of 4, and both clients give up on `/api/photo/nearby` after 6 s; (2) both apps call `nearby_venues(lat, lng, radius_m)` first. If it returns any saved venue, that is the answer (city and country from the nearest) and `/api/photo/nearby` is not called; only when none is in range does OpenStreetMap run. The bounding-box queries in iOS and web are gone; the rule lives in Postgres. On iOS a single saved theatre fills the venue before the text is read, and a ticket or programme naming a different venue replaces it while the field is untouched. Trade-off: an unsaved theatre next door to a saved one isn't listed; it can still be searched for, and is saved once logged.

## 2026-11-03: Venues seeded from OpenStreetMap, West End and Broadway labelled (#290, part of #341)
Venues are seeded from OpenStreetMap (ODbL) via QLever, with West End and Broadway houses labelled from reviewed Wikidata lists (`west-end-theatres.json`, 38 ids, and `broadway-theatres.json`, 41 ids; the one Broadway id with no OpenStreetMap theatre is Q45103687, Bijou Theatre). OSM attribution is in the terms; the OSM-derived venue rows stay available under ODbL (the table is already publicly readable). On the local run: 1,489 UK and 8,327 US named theatres fetched, 9,743 after de-duplication (the same theatre as a node and a way, shared Wikidata ids, same name under 100 m), 38 `west_end`, 40 `broadway`; a second run inserts nothing. `similar_venues` took about 110 ms with that many venues because it scanned every row, so it now prefilters with the trigram operators (each accepts everything its exact test accepts; results are identical) and a new `venues_search_key` index: about 9.5 ms. Only the migration is applied to the hosted database by the epic run; the import itself is the owner's.

### 2026-11-04: Show search ranks a whole-name match first (#368)
`search_shows` gets a tier above prefix matches: a show (or alias) whose whole normalised name equals the search, so "Six" finds *Six: The Musical* before *Six Characters in Search of an Author* (`normalise_show_title` already drops ": The Musical"). Equal matches then prefer shows with entries, then the most recent `first_performed`. The signature is unchanged and `first_performed` was already in the returned `shows` row, so shipped iOS builds still decode; new builds show the year beside the type. When results exist but none is the typed name, the "Add" row says "Not one of these? Add it as a new show".

## 2026-11-04: Launch on typed shows; build show suggestions in small steps; no productions yet
Owner's call, after comparing the #272 plan with Mezzanine's flow and export. Reverses parts of "Productions and runs, our own catalogue data, and no cloud AI" (2026-11-01). "We can slowly perfect #1 and build our catalogue, but #2 is what will user get at launch? and we will slowly reduce the % of users in journey #2."
- **Two journeys.** Journey 2, at launch: the user types the show (#353). Journey 1, after launch: the show is pre-filled from venue and date using crawled runs (#289, #272, #314). Progress is the share of photo logs filled from a suggestion.
- **No `productions` table, no `entries.production_id`.** Entries stay show + venue + date, in both journeys, and a run is found by looking those up. So older entries match new runs, and deleting crawl data can't touch an entry. Tour stops stay separate because a run is per venue. Productions come back only when a feature needs them, such as tour pages or cast, as a table plus a nullable `runs.production_id`. Why it's safe: Mezzanine's export shows its production is only show + theatre + an id, so importing it loses nothing and #215 no longer waits for this.
- **Theatre sites first.** The crawl starts from what's-on pages (#291), not Wikipedia, IBDB or Playbill, which are parked in #314. What's-on pages only show the present and future, so old photos stay in Journey 2 unless a history source is added later.
- **Pilot before anything reaches users.** Findings stay in admin-only tables. The owner starts runs for a few theatres and reviews them from an admin page (#358, #359), and decides whether the pilot passes. This changes "No review by the owner" for the pilot: review is for tuning, and scheduled runs publish on confidence once a theatre has passed (#288).
- **Admin starts crawls on GitHub Actions.** The app dispatches a workflow, so the model key stays in GitHub and "no cloud AI in the apps" holds, and crawls avoid Vercel's time limits.
- **Crawled titles stay out of show search.** Runs keep a raw title with a nullable `show_id`. A show is created only when a user taps the suggestion, an admin adds it from review (#366, #367), or it's linked when `similar_shows` says it's the same. So `shows.source` isn't needed yet.
- **`venues.whats_on_url`.** Sites shared by several venues share the URL. No separate crawl-target table.
- **Weekly to start,** not daily or monthly (#288).
- **Show names are the focus of Journey 2, with an admin tool of their own (#363, `pre-launch`).** "Getting the show name right is quite important." On 4 November, 19 of 30 hosted entries were on typed-in shows, and in a rough check of 30 hand-picked titles 7 had no matching show. Same pattern as the crawl: pull, review, publish. New names go to `show_candidates`, not `shows`, and can be reviewed by sample and added in bulk.
- **Wider Wikidata pull revisited.** The 2026-11-01 call kept the catalogue at 3,322 shows and left gaps for later (#275). #366 brings the wider query back through review, rather than syncing straight into `shows`.
- Removed from `pre-launch`: #272, #289, #314 and their issues.

## 2026-11-04: Admin theatre list reads through two admin-only SQL functions; `whats_on_url` arrives with it
`admin_list_venues` (paged, 50 a page, most-logged first) and `admin_venue_totals` take the same filters (search on name or city, circuit or "none", country, has/lacks website, has/lacks what's-on link) and refuse non-admins with `is_admin()`. They return entry counts only. `/app/admin/theatres` keeps its filters in the query string, so a filtered list is a link, and needs no client JS. `venues.whats_on_url` (http or https, 500 characters at most, not in the user column grants) is added by this migration rather than by #357, because the list filters on it; #357 adds `admin_update_venue` and the editing UI.

## 2026-11-04: Admins edit a theatre through `admin_update_venue`, which sets all three fields
`admin_update_venue(venue_id, new_website, new_whats_on_url, new_circuit)` is admin-only and writes website, what's-on link and circuit together; blank clears a field. It checks http(s) and 500 characters itself, so the error is readable, not a bare constraint violation. The column grants on `venues` stay as they were, so users still can't write these. The edit form sits on each row of `/app/admin/theatres`, with a Test link that opens the URL in a new tab; saving refreshes the list.

## 2026-11-04: Admin show list flags problems in SQL, and the name check calls `search_shows`
`admin_list_shows`, `admin_show_totals` and `admin_check_show_names` are admin-only (`is_admin()`), counts only. A show is flagged when another show has the same normalised title, or, for typed-in shows, when `similar_shows` finds a close one. The slow part is `similar_shows` (about 80 ms a call), so the search, type, source and entries filters run first and only the rows left are checked: a filtered page takes ~50 ms, the unfiltered one about 2 s with 30 typed-in shows. If typed-in shows grow into the hundreds, cache the flag. The name check runs each pasted title through `search_shows` itself, so it shows what a user typing it would see; a title counts as found when a result's name (or Wikidata alias) equals it once normalised, and its place in the results is shown. Typed-in shows people have logged are listed first.

## 2026-11-04: A corrected show title is locked in Postgres, not in the sync script
`admin_update_show` sets `shows.title_locked`, and a `before update` trigger (`keep_admin_edits`) then puts the old title and type back on any other update, so the Wikidata sync can't overwrite a fix while still updating `first_performed` and aliases. Doing it in the trigger keeps the rule in the database (the sync script is unchanged, and any future importer is covered). Only `admin_update_show` lifts it, through a transaction-local setting. The sync's dry run still counts locked rows as "updated". `admin_merge_shows` wraps `merge_shows` (the script keeps working) and also saves the deleted show's title as a nickname of the survivor when it reads differently, so what people typed still finds the show. `admin_merge_preview` gives the confirmation its counts; it asks before merging and names both shows. A type mismatch is merged with `force` only after the confirmation says the types differ and which one the merged show keeps (the surviving show's). `admin_add_show_alias` writes through the same `show_aliases` table users' nicknames use.

## 2026-11-04: Crawl tables are admin-read, service-role-write; one stub finding per site until the readers land
`crawl_runs` and `crawl_findings` have select policies for `is_admin()` and no write policies or grants, so only the crawl script (service role) writes them. `crawl_runs.kind` (`whats_on`, `show_names`) is there now so the show-name pull (#367) can share the table. Findings keep the raw title and never reference `shows`, and deleting a venue keeps its findings (venue set null). The script's `readers.mjs` takes a page and returns findings or `null`; #277 ships only a stub reader (page title, confidence 0, `method = 'stub'`, attached to a venue only when the site has exactly one) so the fetch, rate limiting, storage and reporting can be tested; #291 adds the real readers in front of it. The crawler has its own `db.mjs` that splits `SUPABASE_DB_URL` into `PG*` variables for psql, because psql 18 doesn't expand a URL in `PGDATABASE` (the older scripts still pass it that way). Its tests aren't in `.github/workflows/ci.yml` yet: the epic run may not edit workflows, so add `supabase/scripts/crawl/crawl.test.mjs` to the `web` job's `node --test` line.

## 2026-11-04: Readers for theatre sites: structured data, then a model that needs written dates
Order per page: schema.org Event JSON-LD (code, free), then the model (only for `rules_model` runs, with a budget, on pages with no structured data), then a stub finding so unreadable pages are visible. Structured data wins because a page that publishes it is usually right and costs nothing; the model is for the rest. Dates are never invented: a structured date must be a real calendar date within a year before to three years after today, and a model date is kept only when the page's own date text names a day and a month, so "Fridays in December" gives a finding with no date. Findings the structured reader can't place on a stage keep the stage text and no venue. The model is called with `fetch` (no SDK, like the other scripts) using JSON-schema output, because forced tool use is rejected on the 5.5 models; it sends no sampling parameters. Spend uses a price table in the repo (`MODEL_PRICES`: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per million tokens, from Anthropic's price list on 6 Oct 2026; Haiku's is for prompts up to 100K tokens) and a model not in it is refused rather than run unmetered, so the table needs updating when prices or models change. Not yet done: the pilot over about 10 real theatres, which needs `ANTHROPIC_API_KEY` and real what's-on links (owner), and a live call to the Messages API (the tests use a stand-in for it).

## 2026-11-04: Crawl review: marks on the finding, missed titles in their own table, scores and comparisons in SQL
Marking uses the `review` and `review_note` columns that `crawl_findings` already had, written through `admin_review_finding` (tapping the current mark clears it). Titles a run missed live in `crawl_missed` (admin read, written by functions, counted in the score), because they are facts about the site, not about a finding. `admin_crawl_scores` gives per-theatre counts (right, wrong, unsure, not reviewed, missed); the share right is right / (right + wrong), so unsure and unmarked findings don't count for or against a run. `admin_compare_runs(a, b)` treats two findings as the same thing when they are for the same theatre with the same normalised title; it reports added, lost, changed (dates or stage differ) and same, and `carried_review` shows run A's mark on a finding in run B only when the title and dates are the same and B has no mark yet. Carrying is shown, not written, so a mark is only ever set by the reviewer. "Run again with these settings" shows the command and the prompt for now, because the admin form it should open (#358) needs the owner to add Actions secrets first; `/app/admin/crawl` is a plain list of runs so the run pages can be reached.

## 2026-11-04: Wider Wikidata names go to a review table first; bulk add needs a scored sample
Built #366 after the owner chose to pick it up on 4 November, though an earlier comment said where show names come from was under review (the crawl pilot being the alternative); both can feed the same table (`source` allows `wikidata` and `crawler`, for #367). `sync-wikidata.mjs --candidates` uses the wider query from `claude/wider-wikidata-catalogue` (English-Wikipedia-article sources and the form-of-creative-work typing, about 13,500 names) but only for the candidates path: the regular sync keeps its two sources and typing, so nothing about the 3,322 shows changes. `public.load_show_candidates` (service role) never writes to `shows`. Review: **Add** tidies the title like a typed-in show (`tidy_show_title` is applied by hand because the insert trigger skips shows with a Wikidata id) and keeps the id; **Same as** links an existing show and saves the name as a nickname; **Not a show** rejects. **Bulk:** `admin_start_candidate_sample` tags a random sample of a group; the score is (added + same as) / (added + same as + not a show) over the reviewed members; `admin_add_candidates_bulk` refuses unless at least 20 are reviewed and the share is at least `min_share`. The owner left the bar open with 95% suggested; the page always sends 95%, and the function takes it as an argument (so it is enforced in SQL, not only shown, which differs from what the pick-up comment on #366 said). Bulk cannot afford `similar_shows` per row (about 80 ms each), so it links a candidate to an existing show only when the normalised titles are equal (repeats in the batch too) and adds the rest; near-misses are what the sample is meant to catch, and the one-at-a-time list shows each candidate's closest match. A bulk call handles at most 2,000 names (0.35 s locally); search stays at about 40 ms with them added. `sync-wikidata.mjs` now splits `SUPABASE_DB_URL` into `PG*` variables like `sync-osm-venues.mjs`, because psql 18 doesn't read a URL from `PGDATABASE`.

## 2026-11-04: Crawl titles reach show review only after a person marks them right
`admin_send_findings_to_review(run)` takes findings the reviewer marked right (#359), of kind `show` (talks, concerts and other are left out), and creates `show_candidates` with `source = 'crawler'`, the source page and the first theatre it was seen at (`show_candidates.venue_id`). A title that already reads as a show is skipped: its normalised title or a nickname is an existing one, or `similar_shows` says it is the same. Repeat sightings raise `seen_count` on one row (the key is the normalised title), also across runs and across theatres; a title that is already a Wikidata candidate raises that candidate's count instead of making a second. A decision on a candidate is never undone by a new sighting (a rejected name stays rejected, but is counted). `crawl_findings.sent_to_review_at` marks what was sent, so sending a run twice counts nothing twice. Crawler candidates have no Wikidata id and their type is `other` (a finding carries no type, only a kind); "Add" creates the show with that type and the admin corrects it afterwards in the show editor. Bulk add stays Wikidata-only, so crawler names are added one at a time. `admin_list_candidates` was dropped and recreated to return the source and theatre (result columns can't change with create or replace); the already-deployed page keeps working with the extra columns.

## 2026-11-05 — Card-led landing design, before asset production (#384)

The first design pass follows the owner's latest issue comments: hero → Share → Look back → See your year → closing action. The old phone gallery and halo are removed. Neutral, explicitly labelled placeholders reserve square card, diary and stats image slots; actual app captures and the landing link-preview image remain asset work for #386. No generated images or sample attendance data are introduced.

New copy uses the `sharingLanding` Sanity section, avoiding stale published hero/feature text overriding a different layout. Existing sections remain available for rollback. The headline is a provisional design line, editable in Studio; final wording is still the owner's decision. The hero links to the on-page diary preview until the hosted sample diary has public entries. No sign-up or public-page behavior changes.

The eight-card gallery uses scroll snap, visible neighbours and labelled tabs with Left/Right/Home/End navigation. Selection persists on return because it is a browsing preference. All panels remain exposed as a gallery; selection controls focus and scroll, rather than hiding neighbouring cards.

The maker note links to felix.ng and includes “Built in London”, the specific footer exception authorized in the issue comments. This does not change the general rule against launch-region copy. Marketing display sizes: 40–72px hero and 32–48px section headings, using the existing system display font and semantic colours.

This PR is a design pass for review, not completion of the epic: real assets, public sample content, Instagram in-app-browser auth verification and closure of superseded work remain separate.

Validation: typecheck, ESLint and all 105 existing tests pass. The running page was reviewed at 390, 1440 and 2000px with no document horizontal overflow; desktop hero card and text are vertically centred. Mobile tabs show the next card, and End selects/scrolls to Show mix. The mobile header fits on one row. Preview uses dummy public Supabase configuration: no real account, database content, Instagram embedded browser or OAuth flow was tested.

## 2026-11-05 — Owner review follow-up to #384 / PR #396

Pulled the latest header CTA change before editing. Applied only the owner's two decisions in issue comment 6656624819 plus the requested footer/copy tweaks: a provisional three-card placeholder fan replaces the framed hero; the eight-card gallery is a labelled, keyboard-focusable native horizontal scroll region, without tabs, tab roles, layout names or selection state. Placeholder accessibility descriptions remain honest; real per-image alt text must arrive with #386 assets. Scrolling has no forced snapping so native keyboard arrows can move freely.

Removed the hero Instagram handle and both sign-up-method lines. The shared footer now combines the maker/location note with the theatre-nerd sentence, links its first “theatre nerd” to the existing safe CMS creator Instagram URL, and has a separate labelled 44px Stubbed Instagram icon. A decorative purple heart is the owner's explicit exception to the no-emoji voice rule. New footer wording remains Sanity-backed. No live CMS documents were published.

The specific fan cards and final phone composition, diary/stats visual treatment, on-page diary-link arrow and other unselected review findings remain open. No issues are closed and PR #396 must remain unmerged.

## 2026-11-05 — Separate the numbered landing sections

Owner feedback: Look back (02) and See your year (03) merge into one grey band. Keep the numbered eyebrows; give 03 its own white surface, separator edges and full vertical padding, so Share → Look back → See your year alternates white → grey → white. The closing CTA returns to grey to preserve the next section boundary. Footer decoration now follows the requested order: UK flag, Made in London, separator, linked maker sentence, purple heart. Wording stays CMS-backed; emoji are decorative markup.


## 2026-11-05 — Correct Instagram source of truth

The owner confirmed the app Instagram handle is @getstubbed.app. Corrected the landing footer URL and PRODUCT.md, which still said @stubbedapp, and updated the Google Drive project brief. The older October decision is marked superseded; the share-card code already used the correct handle. Creator Instagram remains @hellofelix__, a separate account. Reserved profile handles and historical migrations retain stubbedapp intentionally.

## 2026-11-05 — Section 01 demo card assets

Owner approved synthetic @sillyelphaba cards targeting a frequent musical-theatre fan: 57 visits by early November (~67/year pace), 44 musicals, 8 plays, 3 comedy and 2 stand-up, 34 unique shows. Eight 1080px cards use the existing production Canvas renderers with one consistent dataset and an AI-generated fictional theatre photo. No app renderer changes or database writes. Static WebP exports replace only section 01 placeholders, served through Next Image. Each has CMS-backed descriptive alt text and the gallery explicitly identifies demo content. Reproduction/provenance is recorded with the assets; other image slots and outstanding findings remain open. PR stays unmerged.

## 2026-11-05 — Owner photos replace generated gallery photo

All four owner-supplied photos now appear as variants of the two photo layouts (ten gallery images across eight designs). Re-encoded, orientation-corrected WebP sources strip metadata. The generated curtain source is removed. Repeat-visit/data/badge cards now use Operation Mincemeat at Fortune Theatre, per the owner's West End correction. The Golden Theatre programme is restricted to the rating layout without printed venue counts; the Fortune curtain call supports the repeat-visit data card. Lost Boys photo variants use Palace Theatre and a separate demo entry. Figures remain synthetic; no database changes and PR remains unmerged.

## 2026-11-05 — Animated hero and missing stats cards

Owner requested less overlap and a Personal Best-style entrance. Hero now uses Mincemeat, Lost Boys and activity-grid exports instead of placeholders; sides expose roughly half their width and animate outward once over 750ms, staggered by 200ms. Transform-only CSS preserves layout and has no looping/floating effect. Reduced-motion disables animation while retaining the final spread. Global prefixed classes are used because the project's wildcard CSS Turbopack loader does not preserve CSS module exports. No animation dependency or client hydration is required.

The web renderer offered only three stats cards, while iOS also offers calendar activity, most-seen shows, theatre travels, year-by-year history and three additional streak layouts. Added seven static exports from the native SwiftUI views using a local macOS ImageRenderer harness and the same synthetic @sillyelphaba totals. Production app renderers/data behavior remain unchanged. CMS alt descriptions cover all new images; provenance and regeneration instructions live beside assets. Hero checked at 390/1440/2000px without document overflow. PR stays unmerged; other pending review work remains open.

## 2026-11-05 — Larger, borderless hero cards

Owner requested 30–40% larger cards and removal of the white front-card border. Rebalanced the desktop hero columns to give the fan more room: cards measure 350px rather than 265px at 1440 (32% larger). Phone cards measure 222px rather than 165px (35% larger); rear cards rise above the centre with a narrower horizontal spread to keep the fan within 390px. Removed card borders and replaced the old shadow with a soft cool shadow, an explicit owner-directed exception to the border-with-shadow convention. Updated responsive image sizes. Entrance timing and reduced-motion behavior are retained. Verified final desktop and mobile states without document horizontal overflow; lint/typecheck pass. PR remains unmerged.

## 2026-11-05 — One static hero card on phones

Owner selected a single static Mincemeat card on mobile rather than a fan or auto-changing carousel; section 01 supplies browsing variety. Below 1024px the rear cards are display:none and the centre fills the visual column up to 400px; desktop retains the enlarged animated fan. Only the centre image is explicitly preloaded. Verified at 390px: card width 358px, both rear cards hidden, no document horizontal overflow. Lint/typecheck pass. PR remains unmerged.
