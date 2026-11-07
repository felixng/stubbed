// The design system ("Footlight Sweep") as data, for the /design-system page
// and its plain-markdown twin /design-system.md, which people paste into other
// AI tools. The values mirror globals.css and docs/DESIGN.md;
// test/design-system.test.ts fails if the colours drift from globals.css.

export const DESIGN_SYSTEM_NAME = "Footlight Sweep";

export type ColorToken = {
  name: string;
  tailwind: string;
  light: string;
  dark: string;
  use: string;
};

export const COLORS: ColorToken[] = [
  { name: "background", tailwind: "bg-background", light: "#f2f2f7", dark: "#000000", use: "Every screen; marketing pages stay on it" },
  { name: "surface", tailwind: "bg-surface", light: "#ffffff", dark: "#1c1c1e", use: "Grouped lists, cards, inputs, sheets" },
  { name: "fill", tailwind: "bg-fill", light: "#e9e9ee", dark: "#2c2c2e", use: "Poster fallback wells, chips, wells" },
  { name: "label", tailwind: "text-label", light: "#1c1c1e", dark: "#ffffff", use: "Primary text" },
  { name: "label-secondary", tailwind: "text-label-secondary", light: "#6c6c70", dark: "#aeaeb2", use: "Secondary text: venue, date, captions" },
  { name: "separator", tailwind: "border-separator", light: "#e0e0e5", dark: "#38383a", use: "Hairlines between rows, inset to the text" },
  { name: "outline", tailwind: "border-outline", light: "#8e8e93", dark: "#7c7c82", use: "Control borders, empty stars, placeholder initials" },
  { name: "tint", tailwind: "bg-tint", light: "#dc2f4f", dark: "#ff5a5a", use: "Fill of the one primary action, and state icons (liked heart, calendar day); not small text on `background`" },
  { name: "tint-pressed", tailwind: "hover:bg-tint-pressed", light: "#c4234a", dark: "#ff7a7a", use: "Primary button hover and pressed" },
  { name: "tint-text", tailwind: "text-tint-text", light: "#c4234a", dark: "#ff5a5a", use: "Links, ghost and secondary button labels, selected tab" },
  { name: "tint-fill", tailwind: "bg-tint-fill", light: "#ffe4e1", dark: "#3a1418", use: "Secondary buttons, highlighted rows" },
  { name: "on-tint", tailwind: "text-on-tint", light: "#ffffff", dark: "#000000", use: "Text and icons on `tint`" },
  { name: "star", tailwind: "fill-star", light: "#e07400", dark: "#ffa040", use: "Rating stars and award marks only" },
  { name: "destructive", tailwind: "text-destructive", light: "#9e1b2c", dark: "#ff9f0a", use: "Delete, sign out, error text" },
  { name: "focus", tailwind: "outline-focus", light: "#1c1c1e", dark: "#ffffff", use: "2px focus ring, 2px offset (web only)" },
  { name: "glow", tailwind: "bg-glow", light: "#ffdde2", dark: "#2a1216", use: "Decorative halo behind a hero image or device, and a poster fallback well; otherwise never behind text" },
];

// CSS custom properties for one appearance, so a preview can show light and
// dark side by side whatever the visitor's own appearance is.
export function themeVars(appearance: "light" | "dark") {
  return Object.fromEntries(
    COLORS.map((c) => [`--${c.name}`, c[appearance]]),
  ) as Record<string, string>;
}

export const PRINCIPLES = [
  "**Native first.** Built for the SwiftUI iOS app. The web shares its features, data and rules, not its layouts. On iOS the background and text tokens are the system colours; the coral ones are `Palette` (see iOS).",
  "**Light by default.** Every page and screen is light, whatever the device setting: on the web, `data-theme=\"light\"` on the page root; on iOS, `.preferredColorScheme(.light)`. The dark values are defined and kept working, but nothing ships dark for now.",
  "**Colours from the icon.** Every brand colour comes from the app icon's sweep: magenta `#e8247f`, coral `#ff5a5a`, amber `#ffa040`. The neutrals are Apple's system greys.",
  "**One tint.** `tint` is the icon's coral (a step deeper on light, so white text on it passes) and fills the one primary action per screen. Where the brand colour is read as text, use `tint-text`. Nothing else is coral.",
  "**The sweep is identity.** The icon's gradient (`bg-sweep`, `Palette.sweep`) stands in for a missing picture: avatars with no photo, iOS posters with no photo, an empty profile cover, and the ring around your own avatar on iOS. Only white bold text goes on it, centred. Never a button or a background for reading.",
  "**Copy:** terse and confident, sentence case, no emoji, no exclamation marks. Button labels are verbs. Numbers are digits and tabular. Sample handle: `@sillyelphaba`; never a real person's name.",
  "**Ratings** always show as five stars in half steps, never a bare number.",
];

export const WORDMARK = [
  "`stubbed`, always lowercase, in `label` (never `tint` or `tint-text`).",
  "SF Pro Display (system font stack on web), weight 800, letter-spacing -0.045em, line height 1, no text transform.",
  "20pt in app navigation and headers; 26–32px in the web header (28 on the landing page); 16 minimum.",
  "Accessible label \"Stubbed\". In running text, \"Stubbed\" with a capital S.",
];

/** The logo: two admission tickets, in three variants drawn from one source (brand/make_logo.py). */
export const LOGO_VARIANTS = [
  {
    id: "icon",
    name: "App icon",
    file: "stubbed-icon",
    background: "Its own gradient tile",
    use: "The iOS app icon, the Apple touch icon and PWA icons (home screens need a full tile), and anywhere the mark sits on a photo, a colour or an unknown background. Never add a border or shadow; platforms round the corners themselves.",
  },
  {
    id: "mark",
    name: "Mark",
    file: "stubbed-mark",
    background: "White or `background`",
    use: "The logo: before the wordmark in the website and web app headers, on sign-in and welcome, and in link previews; squared up, the browser tab icon (favicon), so the tab matches the header. Transparent; only on light backgrounds.",
  },
  {
    id: "mark-outline",
    name: "Outline mark",
    file: "stubbed-mark-outline",
    background: "White or `background`",
    use: "A lighter version for large or decorative uses on white: empty states, watermarks, print. Also the base of the iOS dark and tinted icons. Not for small sizes; use the mark.",
  },
];

export const LOGO_GRADIENT = [
  { stop: "0%", color: "#e8247f", name: "magenta" },
  { stop: "50%", color: "#ff5a5a", name: "coral" },
  { stop: "100%", color: "#ffa040", name: "amber" },
];

export const LOGO_RULES = [
  "**The gradient is the sweep.** Magenta to coral to amber, bottom left to top right. In the interface it is the identity stand-in (see Principles); controls and text keep `tint`.",
  "**Lockup:** the mark before the wordmark, 1.05× the wordmark's size tall, with a 0.28em gap (`<Wordmark mark />` on the web). The wordmark stays in `label`.",
  "**Clear space:** at least a quarter of the mark's height on every side.",
  "**Minimum size:** the mark 16px tall; the app icon 16px. Below 24px use the mark or icon, never the outline mark.",
  "**Don't** recolour, rotate, stretch, outline, add shadows, put the transparent marks on photos or dark colours (use the app icon), or redraw the tickets by hand. Change brand/make_logo.py and regenerate.",
  "**Files:** `public/brand/` has every variant as SVG and a 1024px PNG; `brand/make_logo.py` and `brand/render.py` regenerate them and the favicon (the mark), Apple touch icon and PWA icons (the app icon) and the iOS app icon with its dark and tinted versions.",
];

export const FONT_STACK =
  '-apple-system, "SF Pro Text", BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif';

export type TextStyle = {
  name: string;
  tailwind: string;
  size: number;
  lineHeight: number;
  weight: number;
  tracking: string;
  use: string;
};

// The iOS text styles at their default Dynamic Type sizes.
export const TEXT_STYLES: TextStyle[] = [
  { name: "Large Title", tailwind: "text-large-title", size: 34, lineHeight: 41, weight: 700, tracking: "0.011em", use: "iOS Large Titles, content page titles" },
  { name: "Title", tailwind: "text-title", size: 28, lineHeight: 34, weight: 700, tracking: "0.013em", use: "Web app page headings (h1)" },
  { name: "Title 2", tailwind: "text-title-2", size: 22, lineHeight: 28, weight: 700, tracking: "0.016em", use: "Section headings" },
  { name: "Headline", tailwind: "text-headline", size: 17, lineHeight: 22, weight: 600, tracking: "-0.024em", use: "Row titles, button labels" },
  { name: "Body", tailwind: "text-body", size: 17, lineHeight: 22, weight: 400, tracking: "-0.024em", use: "Default text" },
  { name: "Callout", tailwind: "text-callout", size: 16, lineHeight: 21, weight: 400, tracking: "-0.02em", use: "Supporting paragraphs" },
  { name: "Subheadline", tailwind: "text-subheadline", size: 15, lineHeight: 20, weight: 400, tracking: "-0.016em", use: "Row metadata: venue · date" },
  { name: "Footnote", tailwind: "text-footnote", size: 13, lineHeight: 18, weight: 400, tracking: "-0.006em", use: "Chips, fine print; the smallest body text" },
  { name: "Caption", tailwind: "text-caption", size: 12, lineHeight: 16, weight: 400, tracking: "0", use: "Labels under numbers, timestamps" },
  { name: "Caption 2", tailwind: "text-caption-2", size: 11, lineHeight: 13, weight: 500, tracking: "0.006em", use: "Tab bar labels only; the one size below Footnote" },
];

export const TYPE_RULES = [
  "The system font only: SF Pro on Apple devices, the system sans elsewhere. No web fonts.",
  "Titles (Large Title, Title, Title 2) use SF Pro Display, bold.",
  "Never set body text below Footnote (13px). Tab bar labels (Caption 2, 11px) are the only exception.",
  "Web app page headings use Title, not Large Title, so they don't outweigh the header wordmark. iOS keeps native Large Titles.",
  "Marketing only: the landing hero headline is clamp(44px, 7vw, 76px), extra bold; section headlines on long marketing pages (/press, never the web app or iOS) are clamp(32px, 5vw, 48px), extra bold; feature card titles are 20px.",
];

export const SPACING = [
  { name: "space-1", px: 4, tailwind: "1" },
  { name: "space-2", px: 8, tailwind: "2" },
  { name: "space-3", px: 12, tailwind: "3" },
  { name: "space-4", px: 16, tailwind: "4" },
  { name: "space-5", px: 20, tailwind: "5" },
  { name: "space-6", px: 24, tailwind: "6" },
  { name: "space-7", px: 32, tailwind: "8" },
];

export const SPACING_RULES = [
  "Screen gutter and row padding: space-4 (16px). Sections sit space-5 (20px) apart. Web page gutters are 32px from the `sm` breakpoint.",
  "Anything tappable is at least 44px tall (`min-h-11`).",
];

export const RADII = [
  { name: "rounded-sm", px: "8px", use: "Posters, thumbnails" },
  { name: "rounded-md", px: "12px", use: "Cards, grouped lists, inputs" },
  { name: "rounded-lg", px: "20px", use: "Sheets, large cards" },
  { name: "rounded-pill", px: "999px", use: "Buttons, chips, avatars" },
];

export const SHADOWS = [
  { name: "shadow-sm", value: "0 1px 2px rgba(20, 20, 30, 0.06), 0 10px 22px -12px rgba(20, 20, 30, 0.2)", use: "Cards, grouped lists, the email field; always with a `separator` border" },
  { name: "shadow-lg", value: "0 2px 4px rgba(20, 20, 30, 0.08), 0 36px 60px -22px rgba(20, 20, 30, 0.36)", use: "Device mockups and sheets" },
  { name: "shadow-btn", value: "0 1px 0 rgba(255, 255, 255, 0.3) inset, 0 6px 12px -6px rgba(196, 35, 74, 0.5)", use: "The primary button" },
];

export const SHADOW_RULES = [
  "Shadows are soft and cool; only the primary button's takes colour, from the coral it sits under. In dark mode the border does the work.",
  "The iOS app uses no drop shadows: system grouped backgrounds instead.",
];

export const COMPONENTS = [
  { name: "Crawl source progress", swift: "web admin only", props: "source, scan, stage, status", notes: "Responsive surface cards use separator borders and text labels for discovered, processed and task-state counts. Collection and publication remain separately labelled. Stage filters live in the URL, rows stay in one mobile column, and status badges always contain readable text." },
  { name: "NotificationBell / Inbox", swift: "NotificationsView", props: "shared recipient RPC state", notes: "Bell beside Search has an accessible unread count and decorative dot. Shared activity uses avatar, category symbol, readable text, timestamp and unread styling, grouped by local calendar day. Opening a row marks its observed revision read; mark-all uses a server snapshot. Loading, empty, error, retry and paged older activity retain ordinary keyboard targets." },
  { name: "Notification settings / MobilePushSetup", swift: "NotificationPermissionCallout / NotificationCategorySection", props: "push categories; contextual permission invitation", notes: "Only push categories are settings. All eligible activity always appears in the inbox. A leading-aligned permission callout offers one Enable action and disappears when enabled; denial links to OS/browser settings without re-prompting. iPhone web tabs retain Home Screen guidance; desktop never prompts. Preview visibility and quiet time belong to OS controls." },
  { name: "PressMedia", swift: "web only", props: "none; owner-supplied media pending", notes: "The /press page stays light. Responsive surface cards use separator borders and labelled, non-interactive media placeholders. Each screenshot group includes horizontal, vertical and transparent slots. Only supplied, verified URLs become links; missing media never renders an empty image or download control." },
  { name: "Button", swift: "system `.borderedProminent` / `.bordered`", props: "variant primary | secondary | ghost | neutral; size md | sm", notes: "Capsule, 50px tall (sm 44px), headline weight. One `primary` per screen (`tint` fill, `on-tint` text, `shadow-btn`). `secondary` is `tint-fill` with `tint-text`; `ghost` is transparent with `tint-text`; `neutral` (surface, hairline border) is for third-party sign-in such as Google." },
  { name: "Chip", swift: "none: plain metadata text, a `Picker` or small `.bordered` buttons", props: "selected, onClick, children", notes: "Capsule, 28px tall, footnote medium, on `fill`. Selected inverts (`label` background, `background` text), never `tint`. With onClick it is a toggle button (aria-pressed)." },
  { name: "RatingStars", swift: "RatingStars", props: "value 0–5 in halves, size px", notes: "Five stars; filled in `star`, empty as a 1.5px `outline` stroke. Read-only; labelled \"Rated N out of 5\"." },
  { name: "Poster", swift: "Poster", props: "title, type, poster", notes: "2:3 at `rounded-sm`. The photo when there is one; otherwise \"House Lights\": the title in `label` on `fill`, `tint-fill` or `glow` (seeded from the title), the show type in small caps and a short `outline` rule. Below 80px wide, a monogram in `outline` over the rule. Decorative (aria-hidden)." },
  { name: "ShowRow", swift: "EntryRow, in a List", props: "title, type, venue, date, rating, poster", notes: "56px poster, headline title, subheadline `venue · date` in `label-secondary`, then stars (or a \"Want to see\" chip). Lives in a `surface` list with `separator` hairlines." },
  { name: "ShowCard", swift: "none (the feed uses PostCard)", props: "same as ShowRow", notes: "160px portrait card for web shelves and carousels." },
  { name: "TabBar", swift: "native TabView", props: "items, active, onSelect", notes: "Web app below 768px only; from 768px a sidebar with the same items replaces it. At most four tabs; 24px line icons; selected tab in `tint-text`, others `label-secondary`." },
  { name: "Wordmark", swift: "Wordmark", props: "size px (min 16)", notes: "Lowercase text, screen readers hear \"Stubbed\"." },
];

export const ICON_RULES = [
  "iOS: SF Symbols, matched to the text style beside them (tabs: `house`, `plus.circle.fill`, `person.crop.circle`).",
  "Web: inline line icons drawn to match SF Symbols at 24px with a 1.5px stroke, round caps and joins. No icon package.",
];

export const IOS_RULES = [
  "The iOS UI is native, not a copy of the web: same features, data and rules, designed as a premium native app (Apple Fitness, Health and Personal Best as references). The full guide is `docs/IOS_NATIVE_GUIDE.md`; the app's own rules are in `apps/ios/CLAUDE.md`.",
  "**Structure.** A native `TabView` (Home, Log, Profile); Log is a tab that opens the log sheet. Each tab is a `NavigationStack`: large titles on the tab roots, inline titles on detail screens, actions in the navigation bar. Profile editing is the explicit exception: a labelled pencil sits in the identity card; the Settings gear remains in the bar.",
  "**Lists are Lists.** List-like screens are `List(.insetGrouped)` on the grouped background, with system chevrons from `NavigationLink`, `.swipeActions` and `.contextMenu`. Bulk select is the system edit mode with bottom-bar actions. Detail and edit screens are a `Form`.",
  "**One custom container:** the feed post (`PostCard`), photo first like Instagram or Hevy: header, the photo at the card's full width (4:5), the show, stars and note, then counts and a trip tag on one row. The whole card is one tap target that scales to 98% when pressed.",
  "**Surfaces.** `Color(.secondarySystemGroupedBackground)` with 16pt continuous corners and a 1pt stroke at 6% of the label colour (`.groupedCard()`). No drop shadows anywhere.",
  "**Type and colour.** Dynamic Type text styles only; system semantic colours for text and backgrounds; coral only on interactive elements, the sweep only behind a missing picture. Text on coral is `onTint` (white on light, black on dark).",
  "**Controls.** System button styles: one `.borderedProminent` per screen, otherwise `.bordered` or plain tinted text. Toggles, pickers, date pickers, `.searchable` (people search opens from Home's search button as a sheet, the field focused), `ShareLink`, `PhotosPicker`.",
  "**Presentations.** Sheets for self-contained tasks, each with its own `NavigationStack` and Cancel / Save (or Done) in the bar: log a show, edit a trip, Share. Comments on a feed post open as a pull-up drawer (`.presentationDetents([.medium, .large])`), as on Instagram. Destructive steps confirm with a `.confirmationDialog`.",
  "**Loading.** Grey placeholder rows in the shape of the content (`.redacted`), never a spinner over the screen. Likes update at once and sync in the background.",
  "**Light only for now:** `.preferredColorScheme(.light)` at the root. Semantic colours keep dark mode a one-line change.",
];

/** How each colour token is expressed in SwiftUI. */
export const IOS_TOKENS = [
  { token: "progress-status", swift: "`Palette.progressText` / `Palette.progressFill`", note: "Warm lime IN PROGRESS status: Sweep magenta’s complementary hue warmed toward Sweep amber. Light text/fill #2D4D12 / #BEF28C; dark #BEF28C / #263C17. Native caption bold, 12pt horizontal and 4pt vertical padding; scales with Dynamic Type." },
  { token: "background", swift: "Color(.systemGroupedBackground)", note: "Every screen" },
  { token: "surface", swift: "Color(.secondarySystemGroupedBackground)", note: "List cells, cards (`.groupedCard()`)" },
  { token: "fill", swift: "Color(.tertiarySystemFill)", note: "Placeholders, capsule tags" },
  { token: "label", swift: "`.primary` / `Color(.label)`", note: "Primary text" },
  { token: "label-secondary", swift: "`.secondary`", note: "Venue, date, captions" },
  { token: "separator", swift: "system list separators", note: "Drawn by `List`; cards use a 6% label-colour stroke" },
  { token: "tint", swift: "`Palette.tint`", note: "Accent fills: liked heart, calendar days, avatar badge" },
  { token: "tint-text", swift: "`Palette.tintText`, set as the app `.tint`", note: "Buttons, links, the selected tab, `.borderedProminent` fills" },
  { token: "tint-fill", swift: "`Palette.tintFill`", note: "Icon badges" },
  { token: "on-tint", swift: "`Palette.onTint`", note: "Text and icons on `tint`" },
  { token: "star", swift: "`Palette.star`", note: "Rating stars" },
  { token: "sweep", swift: "`Palette.sweep`", note: "Avatars and posters with no photo, an empty profile cover, the ring around your own avatar" },
  { token: "destructive", swift: "`role: .destructive` / `.red`", note: "System red; the system styles destructive buttons" },
];

/** The SwiftUI building blocks, in apps/ios/Stubbed. */
export const IOS_COMPONENTS = [
  { name: "Import hub / Mezzanine review", file: "Screens/Import/", notes: "Native inset-grouped source list and bulk review with checkmark rows, country selection per city, edit sheets, progress, retry and a summary. Photo shortcuts continue to open PhotosPicker directly. No pricing or upgrade UI." },
  { name: "Notification permission callout", file: "Screens/Notifications/NotificationPermissionCallout.swift", notes: "Contextual inset-grouped card in inbox and settings: SF Symbol, headline, supporting copy and one native bordered-prominent action. Hidden once allowed; denied opens iPhone notification Settings without re-prompting. No permanent permission row, master switch, preview switch, quiet-hour controls or inbox category controls. Push-category toggles remain native Form rows." },
  { name: "Notifications", file: "Screens/Notifications/NotificationsView.swift", notes: "Home’s labelled bell shows the shared unread count. The inset-grouped inbox has Today/Yesterday/This week/Earlier sections, avatars, activity symbols, unread dots and exact-entry destinations. Its actions menu marks a snapshot read or opens per-category settings. Follow-request rows open actionable requests. Native NavigationLink resolves the exact destination and reads only the observed revision. Accessibility text stacks avatars above full-width copy." },
  { name: "WelcomeView", file: "Screens/Auth/WelcomeView.swift", notes: "Native onboarding Form: photo and profile fields in grouped sections, validation in footers, and Continue in the navigation bar above the keyboard." },
  { name: "Settings / Edit profile", file: "Screens/Profile/", notes: "Profile gear pushes a grouped Settings Form with profile, privacy, import, help and account sections. A borderless, labelled pencil in the identity card opens its focused editor; privacy saves independently. At accessibility text sizes, identity stacks below the avatar/pencil and counts become labelled rows." },
  { name: "PublicProfileView / ProfileYearHeading / ProfileYearMetrics", file: "Screens/People/PublicProfileView.swift, Screens/Profile/ProfileYearSummary.swift", notes: "Public profiles match the compact avatar/identity header and Shows/Followers/Following row. The shared current-year card and heat map use public, logged entries under the viewer’s RLS. Follow/Edit and More remain; owner-only Trips/Insights links are omitted. Day selection opens a public-only date sheet." },
  { name: "TripsList", file: "Screens/Trips/TripsList.swift", notes: "Dedicated inset-grouped destination from Profile, with a native back button and + toolbar action. Trips open their detail screens; creation uses a sheet. Loading, empty and error states stay inside the list." },
  { name: "ProfileInsightsSection / InsightsView", file: "Screens/Insights/", notes: "Profile shows the current year with an IN PROGRESS badge, three equal metrics (shows, live weekly streak, best weekly streak in the current year), and the heat map. The warm lime IN PROGRESS chip uses the progress status tokens, native caption bold and wider capsule padding on both owner and public profiles. The heading and metrics stack at accessibility text sizes. Trips precedes Insights beneath the grid, using native List row heights and system separators aligned to content leading; the diary remains visible. Insights opens a separate inset-grouped List." },
  { name: "ActivityHeatmap", file: "Screens/Insights/ActivityHeatmap.swift", notes: "Monday-first yearly grid, scrollable horizontally. Chart cells have visual day selection and a full-size native calendar picker alternative for VoiceOver." },
  { name: "Screen", file: "Design/Screen.swift", notes: "A scrolling screen on the grouped background with a large (or inline) title and room above the tab bar. For screens that aren't lists, like the feed." },
  { name: ".groupedCard()", file: "Design/Theme.swift", notes: "The inset grouped surface: secondary grouped background, 16pt continuous corners, 1pt stroke, no shadow." },
  { name: "PostCard", file: "Screens/Home/PostCard.swift", notes: "A feed post, photo first; text-only posts have a 48×64 initials poster beside a bold title3 show heading. One tap target with `CardPressStyle`; the avatar, counts and trip tag push through the router (a `NavigationLink` inside a List row would gain a chevron)." },
  { name: "EntryRow", file: "Screens/Entry/EntryList.swift", notes: "A diary or trip row in a List: 48×64 poster, headline title, `venue · date`, stars or \"Going\", then trips and privacy as caption metadata." },
  { name: "Poster", file: "Design/Components.swift", notes: "The show's photo, or its initials in white bold on `Palette.sweep`, at 8pt continuous corners." },
  { name: "Avatar", file: "Design/Components.swift", notes: "Circular profile photo, or the first letter in white bold on `Palette.sweep`. Your own avatar on the Profile tab wears a 2.5pt sweep ring." },
  { name: "RatingStars / RatingInput", file: "Design/Components.swift, Screens/Log/RatingInput.swift", notes: "Five SF Symbol stars in half steps, scaled with Dynamic Type. The input taps or drags horizontally, leaves vertical Form scrolling alone, fits its Dynamic Type stars to the row, and exposes half-star adjustment and Clear rating to VoiceOver. Ratings have no bare numeric caption." },
  { name: "PersonRow / FollowButton", file: "Screens/People/", notes: "A person as a List row (avatar, @handle, name) with Follow (`.borderedProminent`), or Following / Requested (`.bordered`). Request profile navigation and response buttons are sibling targets, without a redundant chevron; they stack at accessibility text sizes." },
  { name: "ShareScreen / ShareCarousel / ShareRow", file: "Screens/Share/ShareCarousel.swift", notes: "The Share sheet: square previews, stable design selection and native export actions. Background cards alone offer solid, gradient and transparent with light/dark ink; photo cards keep their photo. Data + Photo shows Seen from the second viewing onward. Show sharing offers the eight photo/data/current-year stats layouts together. First visit at 1× becomes Encore from 2×. Stats cards omit entry captions and links, including when selected from a show. The separate Insights period selector remains." },
  { name: "CommentsSheet / CommentComposer", file: "Screens/People/PublicEntryView.swift", notes: "Comments as a pull-up drawer from a feed post: half height, drag to full, swipe down to close. The composer is a growing field with an inline send arrow, pinned to the bottom with `.safeAreaInset(edge: .bottom)`." },
  { name: "PlaceholderRows / EmptyState", file: "Design/Components.swift", notes: "Redacted grey rows for a first load; `ContentUnavailableView` with an SF Symbol for empty and error states." },
  { name: "RemoteImage", file: "Design/Components.swift", notes: "Photos from a URL on a grey placeholder of the final size. Caches and retries, where `AsyncImage` gives up in a scrolling feed." },
  { name: "Wordmark", file: "Design/Components.swift", notes: "Lowercase `stubbed`, heavy, tight tracking, in `label`; VoiceOver reads \"Stubbed\". `mark: true` adds the ticket mark (`BrandMark`) before it, as on launch, sign-in and welcome." },
];

/** iOS simulator screenshots (iPhone 17 Pro and SE, synthetic test data), in public/design-system/ios. */
export const IOS_SCREENSHOTS = [
  { file: "notification-settings-allowed.jpg", title: "Notification settings after allowing", caption: "Only push categories remain once permission is granted. No permanent permission status row. iPhone 17 Pro.", width: 460, height: 1000 },
  { file: "notification-settings.jpg", title: "Notification settings", caption: "Push-category controls and a contextual permission invitation; no redundant master, privacy, quiet-hour or inbox controls. iPhone 17 Pro.", width: 460, height: 1000 },
  { file: "notifications.jpg", title: "Notifications", caption: "Shared social activity with avatars, activity symbols, unread dots and time sections. Actions include mark all read and notification settings. iPhone 17 Pro.", width: 460, height: 1000 },
  { file: "notifications-accessibility.jpg", title: "Notifications at largest text", caption: "Full-width activity copy at the largest accessibility text size, with native navigation and read state.", width: 460, height: 1000 },
  { file: "public-profile-day.jpg", title: "Public activity date", caption: "Selecting a heat-map day opens a native sheet queried for public, logged shows on that date. Empty dates have a native empty state.", width: 460, height: 1000 },
  { file: "public-profile.jpg", title: "Public profile", caption: "Compact identity header and three counts, with the existing Follow control. Year metrics count only public logged shows; owner-only buttons are absent.", width: 460, height: 1000 },
  { file: "public-profile-year.jpg", title: "Public year summary", caption: "The same year heading, three metrics and heat map as Profile, backed by public-only aggregates. The diary follows directly.", width: 460, height: 1000 },
  { file: "profile-trips.jpg", title: "Your trips", caption: "A dedicated Trips screen reached from Profile, with a native back button and + toolbar action.", width: 460, height: 1000 },
  { file: "profile-year-small.jpg", title: "Year summary on iPhone SE", caption: "Three metrics share a row on the smaller phone. The same card contains the heat map, Trips and Insights.", width: 562, height: 1000 },
  { file: "profile-year-accessibility.jpg", title: "Year summary at accessibility text sizes", caption: "The year, IN PROGRESS badge and metrics stack vertically at the largest accessibility text size. iPhone 17 Pro.", width: 460, height: 1000 },
  { file: "profile-insights.jpg", title: "Year in progress", caption: "Current year with an IN PROGRESS badge, three equal metrics and the heat map. Trips opens above Insights; the diary follows without a toggle. iPhone 17 Pro.", width: 460, height: 1000 },
  { file: "insights.jpg", title: "Insights", caption: "A native year Picker, performance counts and daily activity, in an inset grouped List.", width: 460, height: 1000 },
  { file: "insights-world.jpg", title: "Country visits", caption: "An on-device world choropleth and native rows opening each country's visits.", width: 460, height: 1000 },
  { file: "insights-types.jpg", title: "Show mix", caption: "Show-type radar with an accessible count/percentage list and native drill-down navigation.", width: 460, height: 1000 },
  { file: "insights-empty.jpg", title: "Empty Insights", caption: "An empty diary keeps year navigation and the daily grid, with clear zero counts.", width: 460, height: 1000 },
  { file: "insights-accessibility.jpg", title: "Insights at accessibility text sizes", caption: "Largest accessibility text and increased contrast on iPhone SE: month labels and grid spacing scale together.", width: 562, height: 1000 },
  { file: "home.jpg", title: "Home", caption: "Large title, the search button in the bar, feed posts on the grouped background.", width: 460, height: 1000 },
  { file: "post-photo.jpg", title: "Feed post with a photo", caption: "Photo first at the card's full width; counts and a trip tag on one row.", width: 735, height: 1000 },
  { file: "people-search.jpg", title: "People search", caption: "A sheet from Home's search button: the field focused, people with Follow as you type.", width: 964, height: 1000 },
  { file: "comments-drawer.jpg", title: "Comments drawer", caption: "A post's comments as a pull-up drawer over the feed, the composer pinned to the bottom.", width: 460, height: 1000 },
  { file: "profile.jpg", title: "Profile", caption: "Settings gear above the identity card, its edit pencil inside, then follow requests and the current-year summary. iPhone SE.", width: 562, height: 1000 },
  { file: "diary.jpg", title: "Diary rows", caption: "EntryRow in Upcoming and Seen sections; swipe or long press to edit or delete.", width: 460, height: 1000 },
  { file: "entry.jpg", title: "A show", caption: "A Form: the attached photo at 4:5, then show details, Share, likes, trips and privacy. Without a photo, Add a photo opens Edit.", width: 460, height: 1000 },
  { file: "share.jpg", title: "Share", caption: "The Share sheet: the card at full width, then the ways to send it.", width: 460, height: 1000 },
  { file: "share-photo-viewings.jpg", title: "Data + Photo", caption: "The first viewing leaves the top-right corner clear. The second viewing shows the Seen count there.", width: 460, height: 1000 },
  { file: "welcome.jpg", title: "Welcome", caption: "Native onboarding Form with labelled fields, validation footers and Continue above the keyboard.", width: 460, height: 1000 },
  { file: "log-start.jpg", title: "Start logging", caption: "A native prominent photo picker, a bordered import action and a manual-entry option in a scrollable sheet.", width: 460, height: 1000 },
  { file: "log-form.jpg", title: "Log a show", caption: "A Form in a sheet: date with quick picks, rating, note, a segmented visibility picker.", width: 460, height: 1000 },
  { file: "comments.jpg", title: "Comments", caption: "Comments as List rows (swipe to delete) and the composer pinned above the tab bar.", width: 460, height: 1000 },
  { file: "profile-settings-accessibility.jpg", title: "Profile settings at accessibility text sizes", caption: "At the largest text size, the pencil stays beside the avatar, identity has full width and counts stack into labelled rows. iPhone SE.", width: 562, height: 1000 },
  { file: "settings.jpg", title: "Settings", caption: "Grouped profile, privacy, import, help and account actions, opened from the Profile gear.", width: 562, height: 1000 },
  { file: "edit-profile.jpg", title: "Edit profile", caption: "Focused profile-card editor, opened from its pencil or Settings. Privacy and account controls stay in Settings.", width: 562, height: 1000 },
];

function table(head: string[], rows: string[][]) {
  return [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

// The whole system as one markdown document, for pasting into an LLM.
export function designSystemMarkdown(pageUrl: string) {
  return [
    `# Stubbed design system: ${DESIGN_SYSTEM_NAME}`,
    "",
    `> The design system of Stubbed, a theatre diary app (iOS and web). Use these tokens, type styles and rules when designing or building anything for Stubbed. Visual version: ${pageUrl}`,
    "",
    "## Principles",
    "",
    list(PRINCIPLES),
    "",
    "## Wordmark",
    "",
    list(WORDMARK),
    "",
    "## Logo",
    "",
    table(
      ["Variant", "File", "Background", "Use"],
      LOGO_VARIANTS.map((v) => [v.name, `[${v.file}.svg](${new URL(`/brand/${v.file}.svg`, pageUrl).href})`, v.background, v.use]),
    ),
    "",
    `Gradient: ${LOGO_GRADIENT.map((g) => `${g.color} (${g.name}) at ${g.stop}`).join(", ")}.`,
    "",
    list(LOGO_RULES),
    "",
    "## Colour",
    "",
    "Semantic tokens, each with a light and a dark value; light is the one in use. Use the token, never the raw hex. On the web they are CSS custom properties (`var(--tint)`) and Tailwind colours.",
    "",
    table(
      ["Token", "Light", "Dark", "Tailwind", "Use"],
      COLORS.map((c) => [`\`${c.name}\``, c.light, c.dark, `\`${c.tailwind}\``, c.use]),
    ),
    "",
    "## Type",
    "",
    `Font stack: \`${FONT_STACK}\``,
    "",
    table(
      ["Style", "Tailwind", "Size / line height", "Weight", "Tracking", "Use"],
      TEXT_STYLES.map((t) => [t.name, `\`${t.tailwind}\``, `${t.size}/${t.lineHeight}px`, String(t.weight), t.tracking, t.use]),
    ),
    "",
    list(TYPE_RULES),
    "",
    "## Spacing",
    "",
    table(
      ["Token", "px", "Tailwind step"],
      SPACING.map((s) => [s.name, String(s.px), s.tailwind]),
    ),
    "",
    list(SPACING_RULES),
    "",
    "## Radius",
    "",
    table(["Token", "Value", "Use"], RADII.map((r) => [`\`${r.name}\``, r.px, r.use])),
    "",
    "## Shadow",
    "",
    table(["Token", "Value", "Use"], SHADOWS.map((s) => [`\`${s.name}\``, `\`${s.value}\``, s.use])),
    "",
    list(SHADOW_RULES),
    "",
    "## Components",
    "",
    table(
      ["Component", "SwiftUI", "Props", "Notes"],
      COMPONENTS.map((c) => [`\`${c.name}\``, c.swift, c.props, c.notes]),
    ),
    "",
    "## Icons",
    "",
    list(ICON_RULES),
    "",
    "## iOS",
    "",
    list(IOS_RULES),
    "",
    "### Tokens in SwiftUI",
    "",
    table(["Token", "SwiftUI", "Use"], IOS_TOKENS.map((t) => [`\`${t.token}\``, t.swift, t.note])),
    "",
    "### SwiftUI components",
    "",
    table(["Component", "File (apps/ios/Stubbed)", "Notes"], IOS_COMPONENTS.map((c) => [`\`${c.name}\``, c.file, c.notes])),
    "",
    "### Screenshots",
    "",
    list(IOS_SCREENSHOTS.map((s) => `[${s.title}](${new URL(`/design-system/ios/${s.file}`, pageUrl).href}): ${s.caption}`)),
    "",
    "## CSS variables",
    "",
    "```css",
    ":root {",
    ...COLORS.map((c) => `  --${c.name}: ${c.light};`),
    "}",
    "/* Dark: defined, not in use yet. */",
    "[data-theme=\"dark\"] {",
    ...COLORS.map((c) => `  --${c.name}: ${c.dark};`),
    "}",
    "```",
    "",
  ].join("\n");
}
