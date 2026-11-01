---
name: Stubbed
description: Footlight Sweep, a native-first system in the app icon's magenta, coral and amber, for logging and sharing shows at the theatre.
colors:
  background: "#f2f2f7"
  surface: "#ffffff"
  fill: "#e9e9ee"
  label: "#1c1c1e"
  label-secondary: "#6c6c70"
  separator: "#e0e0e5"
  outline: "#8e8e93"
  tint: "#dc2f4f"
  tint-pressed: "#c4234a"
  tint-text: "#c4234a"
  tint-fill: "#ffe4e1"
  on-tint: "#ffffff"
  star: "#e07400"
  destructive: "#9e1b2c"
  focus: "#1c1c1e"
  glow: "#ffdde2"
  sweep-magenta: "#e8247f"
  sweep-coral: "#ff5a5a"
  sweep-amber: "#ffa040"
typography:
  large-title:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "41px"
    letterSpacing: "0.011em"
  title:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
    letterSpacing: "0.013em"
  title-2:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "0.016em"
  headline:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.024em"
  body:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "-0.024em"
  callout:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "21px"
    letterSpacing: "-0.02em"
  subheadline:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "-0.016em"
  footnote:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
    letterSpacing: "-0.006em"
  caption:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  caption-2:
    fontFamily: "-apple-system, SF Pro Text, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "13px"
    letterSpacing: "0.006em"
  wordmark:
    fontFamily: "-apple-system, SF Pro Display, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.045em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "32px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.on-tint}"
    typography: "{typography.headline}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-primary-hover:
    backgroundColor: "{colors.tint-pressed}"
  button-secondary:
    backgroundColor: "{colors.tint-fill}"
    textColor: "{colors.tint-text}"
    typography: "{typography.headline}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-secondary-hover:
    backgroundColor: "{colors.fill}"
  button-ghost:
    textColor: "{colors.tint-text}"
    typography: "{typography.headline}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-ghost-hover:
    backgroundColor: "{colors.tint-fill}"
  button-neutral:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label}"
    typography: "{typography.headline}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-neutral-hover:
    backgroundColor: "{colors.fill}"
  chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.label}"
    typography: "{typography.footnote}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "28px"
  chip-selected:
    backgroundColor: "{colors.label}"
    textColor: "{colors.background}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "50px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  poster:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.outline}"
    rounded: "{rounded.sm}"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label-secondary}"
    height: "49px"
  tab-bar-selected:
    textColor: "{colors.tint-text}"
---

# Design System: Stubbed

The source of truth is the design system artifact: https://claude.ai/artifact/2r1EvQn2286Y29ZJNgPfP6. It is native first: built for the SwiftUI iOS app, with the web app and site mirroring it. Its `ios.md` has the Swift files (`FLColor`, `FLMetrics`, components); `web.md` has the web rules. If you change a token or rule, change it in the artifact first, then mirror it here (frontmatter and prose), in `.impeccable/design.json`, in `apps/web/src/app/globals.css`, in `apps/web/src/lib/design-system.ts` (the public `/design-system` page and `/design-system.md`) and in the Swift files (`apps/ios/Stubbed/Design/Theme.swift`).

The frontmatter holds the light tokens, which are the ones every screen uses today. Dark values stay defined in `globals.css` and `Theme.swift` and are listed in the sidecar (`.impeccable/design.json`, `colorMeta.*.dark`).

## Overview

**Creative North Star: "Front of House"**

Stubbed should feel like a good theatre lobby: welcoming and orderly, so you know where to go without being told twice. The structure is calm native iOS (grouped surfaces on system grey, system type, standard navigation), and the colour comes from the app icon: one coral cue lights the next thing to do, and the icon's magenta-to-amber sweep marks identity. Nothing performs for attention; the shows, posters and photos are the show.

Density is comfortable, never cramped: 17px body text, 44px minimum targets, rows that breathe at 16px padding. The neutrals are Apple's system greys, so the app feels at home on an iPhone; warmth comes from the icon's colours set against them, never from tinted neutrals. The system is native first. The iOS app uses Apple's controls and semantic colours with the coral tint; the web app mirrors the same tokens in Tailwind and keeps the same calm.

Light by default: every page and screen is light, whatever the device setting (owner's call). On the web each page sets `data-theme="light"` on its root, which switches the whole document to the light tokens (`globals.css`); a new page must do the same. iOS sets `.preferredColorScheme(.light)`. The dark tokens stay defined and working for when dark mode comes back.

**Key Characteristics:**
- One coral accent on system grey, used for the next action and nothing else.
- The app icon's gradient (the sweep) wherever a person or show has no picture yet.
- System type only (SF Pro on Apple devices), at the iOS text-style sizes.
- Grouped surfaces with hairline separators; capsule buttons and chips.
- Native first: iOS uses system controls; the web mirrors the tokens, not iOS chrome.
- Terse copy: sentence case, no emoji, no exclamation marks; button labels are verbs; numbers are digits and tabular.

## Colors

Every brand colour comes from the app icon, a diagonal sweep from magenta (`#e8247f`) through coral (`#ff5a5a`) to amber (`#ffa040`). Coral is the accent, amber marks ratings, and the full sweep marks identity. The neutrals are Apple's system greys, the same as the iOS app's system colours. Chosen 2026-10-29 from four logo-derived options (see `docs/DECISIONS.md`).

Contrast: `tint` takes white text at 4.6:1; `tint-text` reads at 5.7:1 on white and 5.1:1 on `background`; `star` is 3.2:1 on white (graphics need 3:1). Dark mode uses the icon's own coral and amber, which pass on `#1c1c1e`.

### Primary
- **Footlight Coral** (`tint`): fills the one primary action on a screen, and icons that mark a state (a liked heart, the selected calendar day). The icon's coral, a step deeper on light so white text passes; in dark mode it is the icon's coral exactly (`#ff5a5a`). Not used as small text on `background`, where it falls short of 4.5:1.
- **Footlight Coral, pressed** (`tint-pressed`): the hover and pressed fill of the primary button.
- **Deep Coral Ink** (`tint-text`): the brand colour wherever it is read as text: links, ghost and secondary button labels, the selected tab, and the iOS app's global tint. The same coral as `tint` on dark.
- **Coral Wash** (`tint-fill`): secondary button fill, highlighted rows.
- **White on Coral** (`on-tint`): text and icons on a coral fill. White on light, black on dark.

### Signature
- **Footlight Sweep** (`sweep`): the app icon's gradient at 45°, magenta at the bottom left to amber at the top right (`--sweep` and `bg-sweep` on the web, `Palette.sweep` on iOS). Behind an avatar with no photo, an iOS poster with no photo, an empty profile cover, and as a 2.5pt ring around your own avatar on the iOS Profile tab. Only white bold text goes on it, centred, where the coral midpoint gives 3:1 for large text; never body text, never a button or control fill.

### Secondary
- **Applause Amber** (`star`): rating stars and award marks only. The icon's amber on dark; a deeper `#e07400` on light so the stars hold 3:1 on white.
- **Warm lime progress** (iOS `Palette.progressText` / `Palette.progressFill`): IN PROGRESS on owner and public year summaries. A yellow-green hue derived by warming Sweep magenta’s complementary green toward Sweep amber. Light text/fill `#2d4d12` / `#bef28c` (7.46:1); dark `#bef28c` / `#263c17` (9.34:1). Native caption bold, 12pt horizontal and 4pt vertical capsule padding. Dynamic Type scales the label; accessibility sizes stack it below the year. This is a status treatment; interactive controls keep coral.

### Neutral
- **Lobby Grey** (`background`): every screen; marketing pages stay on it. iOS `systemGroupedBackground`.
- **Programme White** (`surface`): grouped lists, cards, inputs, sheets, the tab bar.
- **Grey Well** (`fill`): chips, wells, hover fills, one of the three web poster fallback wells.
- **Velvet Ink** (`label`): all primary text, the wordmark, the focus ring.
- **Faded Velvet** (`label-secondary`): secondary text, placeholders, unselected tabs. 5.2:1 on white, 4.7:1 on `background`.
- **Hairline** (`separator`): hairlines between rows, inset to the text, and card and input borders.
- **Steel Outline** (`outline`): control borders, empty stars, placeholder initials on posters.
- **Curtain Red** (`destructive`): delete, sign out and error text. iOS uses `.red` for the same jobs.
- **Footlight Glow** (`glow`): decorative halo behind a hero image or device mockup, and one of the three web poster fallback wells; otherwise never behind text.

### Named Rules
**The One Tint Rule.** `tint` is the only accent, and it fills the one primary action per screen. Where the brand colour is read as text, use `tint-text`. Nothing else is coral.

**The Sweep Is Identity Rule.** The sweep stands in for a picture (a person, a show, a cover) and marks you as you. It is never a button, a background for reading, or decoration on its own.

**The Amber Is for Stars Rule.** `star` appears only on ratings and award marks, never as a second accent.

## Typography

**Display Font:** SF Pro Display (system stack on the web: `-apple-system, "SF Pro Display", BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif`)
**Body Font:** SF Pro Text (same stack with `"SF Pro Text"`)

**Character:** The platform's own type, so the app reads as native on an iPhone and neutral elsewhere. Hierarchy comes from the iOS text styles, not from a brand face. No web fonts.

### Hierarchy
- **Large Title** (700, 34/41px): iOS top-level screens (native Large Titles). Not used for web app page headings.
- **Title** (700, 28/34px): web app page headings (`h1`), so they don't outweigh the header wordmark.
- **Title 2** (700, 22/28px): section headings, with `font-display`.
- **Headline** (600, 17/22px): row titles, button labels.
- **Body** (400, 17/22px): the default for all running text and inputs.
- **Callout** (16/21px), **Subheadline** (15/20px): supporting lines, such as `venue · date` under a show title.
- **Footnote** (13/18px), **Caption** (12/16px): metadata and chips. Body text never goes below Footnote.
- **Caption 2** (500, 11/13px): tab bar labels only, the one stated exception to the Footnote floor. It matches the iOS tab bar and sits at the 11px platform minimum.
- **Marketing sizes** sit outside the iOS styles: the landing hero headline (`clamp(44px, 7vw, 76px)`, extra bold), section headlines on long marketing pages such as /press (`clamp(32px, 5vw, 48px)`, extra bold, tracking -0.03em; marketing pages only, never in the web app under /app or on iOS) and feature card titles (20px).

On the web these are Tailwind font sizes that carry line height, weight and tracking: `text-large-title`, `text-title`, `text-title-2`, `text-headline`, `text-body` (default), `text-callout`, `text-subheadline`, `text-footnote`, `text-caption`, `text-caption-2` (tab labels only). On iOS, use Dynamic Type text styles only; no fixed point sizes in screens.

### The wordmark
`stubbed`, always lowercase: SF Pro Display, weight 800, letter-spacing -0.045em (Swift `.tracking(-size * 0.045)`), line height 1, no text transform, in `label`, never `tint` or `tint-text`. 20pt in app navigation and headers, 26–32px in the web header (28 on the landing page), 16 minimum. Accessible label "Stubbed". "Stubbed" with a capital S in running text.

### Named Rules
**The System Type Rule.** No web fonts and no hand-picked point sizes: every size is one of the text styles above, or a documented marketing size.

## Layout

A 4px base with seven steps: `space-1…space-7` = 4, 8, 12, 16, 20, 24, 32px (Tailwind `1, 2, 3, 4, 5, 6, 8`). The screen gutter and row padding are 16px; sections sit 20px apart; web page gutters widen to 32px from the `sm` breakpoint. Anything tappable is at least 44px (`min-h-11`).

The web app is mobile first. Below `md` (768px) it has a sticky header (wordmark and people search) and a bottom tab bar like the iOS app. From `md` both give way to a 256px sidebar on the left, with a hairline on its right edge, and the page sits beside it. The page column is 640px wide at every size, centred in the space it has, because feed cards, the log form and share cards are designed for that measure; it gains 32px of top padding from `md`. Content is a single column of grouped lists and cards; shelves of 160px portrait `ShowCard`s scroll horizontally on wider screens. Sticky bottom bars (Save, select actions) sit on the tab bar below `md` and on the bottom edge from `md`.

iOS follows its own layout rules in `apps/ios/CLAUDE.md` ("Design direction"): each tab is a `NavigationStack`, screens sit on `systemGroupedBackground`, and lists are `List(.insetGrouped)`.

## Elevation & Depth

Depth is mostly tonal: grey background, white surfaces, hairline separators. On the light web, cards, grouped lists and inputs add a soft ambient shadow cast in a cool near-black (`rgba(20, 20, 30, …)`), always paired with a `separator` border; the shadow lifts, the border defines. In dark mode the border does the work alone. iOS uses no drop shadows at all: inset grouped containers on `secondarySystemGroupedBackground` with a 1pt stroke at `Color.primary.opacity(0.06)`.

### Shadow Vocabulary (web)
- **shadow-sm** (`0 1px 2px rgba(20,20,30,0.06), 0 10px 22px -12px rgba(20,20,30,0.2)`): cards, grouped lists, the email field and other inputs, the neutral button.
- **shadow-lg** (`0 2px 4px rgba(20,20,30,0.08), 0 36px 60px -22px rgba(20,20,30,0.36)`): device mockups and sheets.
- **shadow-btn** (`0 1px 0 rgba(255,255,255,0.3) inset, 0 6px 12px -6px rgba(196,35,74,0.5)`): the primary button only, its glow cast in Deep Coral Ink.

### Named Rules
**The Quiet Shadow Rule.** Shadows are ambient, never structural: soft and cool, always with a hairline border beside it. Only the primary button's shadow takes colour, from the coral it sits under.

**The Native Depth Rule.** No drop shadows on iOS. Grouping and system backgrounds carry the depth.

## Shapes

Soft and friendly, never sharp. Four radii: `rounded-sm` 8px (posters, thumbnails), `rounded-md` 12px (cards, grouped lists, inputs), `rounded-lg` 20px (sheets, large cards), `rounded-pill` (buttons, chips, avatars). Posters are always 2:3. iOS uses continuous corners: 16pt on grouped containers, 8pt on posters.

## Components

Native and bright: iOS controls with the coral tint, capsule buttons, grouped surfaces on system grey, the sweep for identity and, on the web, soft cool shadows.

React components live in `apps/web/src/components/ui/`. The iOS app no longer mirrors them one to one: it uses system controls (`.borderedProminent`, `.bordered`, `List`, `Form`) with the components listed in `apps/web/src/lib/design-system.ts` (`IOS_COMPONENTS`).

| Component | iOS | Props | Notes |
|---|---|---|---|
| `Button` | `.borderedProminent` / `.bordered` | `variant` primary \| secondary \| ghost \| neutral, `size` md \| sm | Capsule, 50px tall; one `primary` per screen, with `shadow-btn`; `neutral` (surface, hairline border) for third-party sign-in such as Google |
| `Chip` | tag capsule on `tertiarySystemFill` | `selected`, `onClick`, children | Capsule; selected inverts, never `tint` |
| `RatingStars` | `RatingStars` / `RatingInput` | `value` 0–5 (halves), `size` px | |
| `ShowRow` | `EntryRow` | `title`, `type`, `venue`, `date`, `rating`, `poster` | Inside a `surface` list with `separator` hairlines |
| `ShowCard` | none (use `EntryRow`) | same as `ShowRow` | 160px portrait card for web shelves |
| `TabBar` | native `TabView` | `items`, `active`, `onSelect` | Below `md` only; from `md` the app shows `AppSidebar` (`components/app/AppSidebar.tsx`) instead |
| `Wordmark` | `Wordmark` | `size` px (min 16) | Lowercase text, `sr-only` "Stubbed" |
| `Poster` | `Poster` | `title`, `type`, `poster` | 2:3, the photo when there is one; otherwise "House Lights" (below). Decorative (`aria-hidden`) |

### Buttons
- **Shape:** capsule (`rounded-pill`), 50px tall (`md`) or 44px (`sm`, 15px text).
- **Primary:** Footlight Coral fill, White on Coral label, `shadow-btn`, 24px side padding, headline weight. One per screen.
- **Secondary:** Coral Wash fill with a Deep Coral Ink label. **Ghost:** transparent with a Deep Coral Ink label. **Neutral:** surface, hairline border and `shadow-sm`, for third-party sign-in.
- **Hover / Focus:** colour-only transitions (primary to `tint-pressed`, others to `fill` or `tint-fill`). Focus is a 2px `focus` outline at a 2px offset. Disabled drops to 40% opacity.

### Chips
- **Style:** 28px capsule, Grey Well fill, Velvet Ink footnote text at medium weight, 12px side padding.
- **State:** selected inverts (Velvet Ink fill, white text), never coral. With `onClick` a chip is a toggle button (`aria-pressed`).

### Cards / Containers
- **Corner Style:** 12px (`rounded-md`); iOS grouped containers 16pt continuous.
- **Background:** Programme White on Lobby Grey.
- **Shadow Strategy:** `shadow-sm` with a `separator` border on the web; none on iOS.
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** 50px tall, Programme White, hairline `separator` border, 12px radius, `shadow-sm`, 16px side padding, body text; placeholders in Faded Velvet.
- **Focus:** the shared 2px `focus` outline at a 2px offset.

### Navigation
- **Web, below `md`:** a bottom tab bar on Programme White with a top hairline: Home, Log and Profile as three equal tabs, as on iOS (Log is a plain tab, never a raised coral button, so the page's own primary stays the only coral fill). 49px items with a 24px line icon over an 11px medium label (`text-caption-2`). Unselected tabs in Faded Velvet, the selected tab in Deep Coral Ink (`aria-current="page"`).
- **Web, from `md`:** a sidebar on Lobby Grey (`AppSidebar`): the wordmark (28px), the people search box (its results open 384px wide over the page), then Home, Log and Profile, a hairline, Import shows, and Sign out pinned to the bottom in Curtain Red. Items are 44px capsule rows with a 24px line icon and a body-size label in Velvet Ink, hovering to Grey Well; the selected item is Deep Coral Ink on Coral Wash, semibold, with `aria-current="page"`. Log is a plain item here, not a coral button, so the page's own primary action stays the only coral fill. Trip and settings pages select Profile, as in the tab bar.
- **iOS:** a native `TabView` (Home, Log, Profile); Log opens the log sheet rather than a screen.

### Poster and ratings (signature)
- **Poster:** the show's photo at 2:3, 8px corners; without a photo, the House Lights fallback below on the web, and the show's initials in white bold on the sweep on iOS.

### Poster fallback ("House Lights", web)
A show with no photo still gets a poster, set from its title and type. The title in bold Velvet Ink on one of three wells (Grey Well, Coral Wash, Footlight Glow), the type in small caps in Faded Velvet ("Show" for other), and one short Steel Outline rule above the title, with a 1px hairline inside the edge. The well, and whether the title sits at the top or the foot, come from an FNV-1a hash of the trimmed, lowercased title (`lib/poster.ts`), so the same show always looks the same; the title size is fitted to its longest word and its length, in container units. Below 80px wide (diary and trip rows) a container query swaps the title for a monogram (two initials, skipping a leading article and minor words) in Steel Outline over the rule. Only existing tokens and the system type: never coral or amber. The poster is `aria-hidden`, since the title is always printed beside it. Feed cards show no cover without a photo, so the feed stays compact.
- **Ratings** always show as the five `RatingStars` in Applause Amber, in half steps, never a bare number. Empty stars use Steel Outline.

### Calendar and feed
- **Profile header:** one `ProfileHeader` for `/@handle` and the Profile tab: cover (up to five recent photos, or a sweep band), an 80px avatar (on the sweep when there's no photo) overlapping it with the page's action on the right, handle, name, follow counts, bio, link, then Shows, Theatres and Cities with labels that agree with their numbers (`lib/plural`). Visitors get Follow; the owner gets an accessible pencil link inside the profile card and a Settings gear above it. Settings groups profile editing, privacy, public profile, import, help and account actions. The owner card also keeps a footnote for private shows the public profile leaves out, and a full-width "N follow requests ›" row at the card's foot. On the Profile tab the calendar sits in the diary, between Upcoming and Seen, so the diary starts above the fold at 390px.
- **Profile calendar:** a day with a show sits on Coral Wash with its number in Deep Coral Ink and a small dot beneath, so it isn't colour alone; today is Deep Coral Ink text with no fill. Each show day is a link labelled with the date and the shows.
- **Feed cards:** like and comment counts, then the note and the latest comments. The comment box stays folded until Comment is tapped, and folds again after posting; its Post button is secondary, since a feed has no single primary action.

### Icons
SF Symbols on iOS (`book`, `plus.circle`, `chart.bar`, `person` for the tabs). On the web, inline line icons drawn to match at 24px with a 1.5px stroke, as in `TabBar`. No icon package.

## Do's and Don'ts

### Do:
- **Do** set `data-theme="light"` on the root of every new web page; iOS keeps `.preferredColorScheme(.light)`.
- **Do** keep exactly one `primary` button per screen, and use `tint-text` wherever the brand colour is read as text.
- **Do** pair every web shadow with a `separator` border, and cast shadows in the cool `rgb(20, 20, 30)`.
- **Do** take every brand colour from the app icon: coral, amber, or the sweep.
- **Do** use the text styles and spacing steps above; make every tap target at least 44px.
- **Do** show ratings as five stars, and use `@sillyelphaba` as the sample handle, never a real person's name.
- **Do** use system controls on iOS (`.borderedProminent`, `List`, `Form`, SF Symbols), per `apps/ios/CLAUDE.md`.

### Don't:
- **Don't** use `tint` as text, as a background for anything but the primary action, or for a selected chip.
- **Don't** colour the wordmark coral, uppercase it, or set it below 16px.
- **Don't** add web fonts or an icon package, or tint the neutrals warm.
- **Don't** use the sweep as a button, behind body text, or as decoration with nothing to stand in for.
- **Don't** put drop shadows on iOS, or port web layout patterns (floating action buttons, custom card styles) to the iOS app.
- **Don't** set body text below Footnote (13px), or use `glow` behind text outside the poster fallback. Tab bar labels (Caption 2, 11px) are the only exception.
- **Don't** write copy with emoji, exclamation marks or title case.


### Press kit

`/press` uses the existing always-light public header, footer, system type and Footlight Sweep semantic tokens. A readable story column sits beside the links on desktop and stacks below them on smaller screens. Inline 24px line icons replace the source document's emoji.

`PressMedia` groups the app icon, four screenshot subjects (each horizontal, vertical and transparent) and walkthrough video. Unavailable assets are labelled, non-interactive placeholders, never broken previews or download buttons. Commented image, video and anchor examples identify the drop-in points. The missing beta invitation remains an honest text status, and App Store availability reads “Not published yet”. The website, shared support email and owner-supplied creator Instagram are live links.

Runtime screenshot gallery pending: local browser access is disabled in Work settings. Mobile, tablet and desktop captures must be added after visual review; no mockups or stale screenshots substitute for them.

### Notifications

Home’s bell sits beside Search on mobile and desktop web, with an accessible shared unread count and a decorative unread dot. Notifications has back navigation, a settings shortcut, mark-all-read, and Today / Yesterday / This week / Earlier activity. Rows use the existing avatar, surface, separator, label and tint tokens; unread is communicated through weight and accessible text as well as a dot. Loading, empty, retry and pagination are explicit states. Native iOS uses inset-grouped List/Form sections and semantic colours.

Notification settings distinguishes account preferences from this installation’s permission. Each implemented category has its own inbox/push control. Preview-off sample copy is generic. Optional quiet hours show times and a named time zone. iPhone browser-tab guidance explains Add to Home Screen → open its icon → Enable; Android explains browser permission and optional installation. Desktop offers the shared inbox and account mobile preferences, without a permission prompt. Web runtime screenshots remain outstanding because local browser control is disabled; do not substitute mockups for running captures.

Notification settings use push-category switches only. Permission is a contextual inset-grouped invitation with a bell symbol, short heading, supporting copy and one native action; it disappears after enabling. Denial offers system Settings, never a repeated OS prompt. The inbox has no category controls; previews and quiet time use device settings.
