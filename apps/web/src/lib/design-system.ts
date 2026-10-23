// The design system ("Footlight Coral") as data, for the /design-system page
// and its plain-markdown twin /design-system.md, which people paste into other
// AI tools. The values mirror globals.css and docs/DESIGN.md;
// test/design-system.test.ts fails if the colours drift from globals.css.

export const DESIGN_SYSTEM_NAME = "Footlight Coral";

export type ColorToken = {
  name: string;
  tailwind: string;
  light: string;
  dark: string;
  use: string;
};

export const COLORS: ColorToken[] = [
  { name: "background", tailwind: "bg-background", light: "#fff9f6", dark: "#000000", use: "Every screen; marketing pages stay on it" },
  { name: "surface", tailwind: "bg-surface", light: "#ffffff", dark: "#1c1c1e", use: "Grouped lists, cards, inputs, sheets" },
  { name: "fill", tailwind: "bg-fill", light: "#ffebe3", dark: "#2c2c2e", use: "Poster placeholders, chips, wells" },
  { name: "label", tailwind: "text-label", light: "#1f1210", dark: "#ffffff", use: "Primary text" },
  { name: "label-secondary", tailwind: "text-label-secondary", light: "#5e4039", dark: "#aeaeb2", use: "Secondary text: venue, date, captions" },
  { name: "separator", tailwind: "border-separator", light: "#f9e0d6", dark: "#38383a", use: "Hairlines between rows, inset to the text" },
  { name: "outline", tailwind: "border-outline", light: "#98695b", dark: "#7c7c82", use: "Control borders, empty stars, placeholder initials" },
  { name: "tint", tailwind: "bg-tint", light: "#ff7a5c", dark: "#ff6b4a", use: "Fill of the one primary action; never text on its own" },
  { name: "tint-pressed", tailwind: "hover:bg-tint-pressed", light: "#f2603f", dark: "#ff8a70", use: "Primary button hover and pressed" },
  { name: "tint-text", tailwind: "text-tint-text", light: "#b33a19", dark: "#ff6b4a", use: "Links, ghost and secondary button labels, selected tab" },
  { name: "tint-fill", tailwind: "bg-tint-fill", light: "#ffe0d5", dark: "#3d1a11", use: "Secondary buttons, highlighted rows" },
  { name: "on-tint", tailwind: "text-on-tint", light: "#1f1210", dark: "#000000", use: "Text and icons on `tint`" },
  { name: "star", tailwind: "fill-star", light: "#b96f00", dark: "#ffd60a", use: "Rating stars and award marks only" },
  { name: "destructive", tailwind: "text-destructive", light: "#9e1b2c", dark: "#ff9f0a", use: "Delete, sign out, error text" },
  { name: "focus", tailwind: "outline-focus", light: "#1f1210", dark: "#ffffff", use: "2px focus ring, 2px offset (web only)" },
  { name: "glow", tailwind: "bg-glow", light: "#ffd9cc", dark: "#2a140e", use: "Decorative halo behind a hero image or device; never behind text" },
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
  "**One tint.** `tint` is coral in both appearances and fills the one primary action per screen. Where the brand colour is read as text, use `tint-text`. Nothing else is coral.",
  "**Copy:** terse and confident, sentence case, no emoji, no exclamation marks. Button labels are verbs. Numbers are digits and tabular. Sample handle: `@sillyelphaba`; never a real person's name.",
  "**Ratings** always show as five stars in half steps, never a bare number.",
];

export const WORDMARK = [
  "`stubbed`, always lowercase, in `label` (never `tint` or `tint-text`).",
  "SF Pro Display (system font stack on web), weight 800, letter-spacing -0.045em, line height 1, no text transform.",
  "20pt in app navigation and headers; 26–32px in the web header (28 on the landing page); 16 minimum.",
  "Accessible label \"Stubbed\". In running text, \"Stubbed\" with a capital S.",
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
  "Marketing only: the landing hero headline is clamp(44px, 7vw, 76px), extra bold; feature card titles are 20px.",
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
  { name: "shadow-sm", value: "0 1px 2px rgba(120, 50, 30, 0.08), 0 10px 22px -12px rgba(120, 50, 30, 0.28)", use: "Cards, grouped lists, the email field; always with a `separator` border" },
  { name: "shadow-lg", value: "0 2px 4px rgba(120, 50, 30, 0.12), 0 36px 60px -22px rgba(120, 50, 30, 0.5)", use: "Device mockups and sheets" },
  { name: "shadow-btn", value: "0 1px 0 rgba(255, 255, 255, 0.5) inset, 0 6px 12px -6px rgba(120, 50, 30, 0.55)", use: "The primary button" },
];

export const SHADOW_RULES = [
  "Shadows are warm (brown-tinted), never grey. In dark mode the border does the work.",
  "The iOS app uses no drop shadows: system grouped backgrounds instead.",
];

export const COMPONENTS = [
  { name: "Button", swift: "system `.borderedProminent` / `.bordered`", props: "variant primary | secondary | ghost | neutral; size md | sm", notes: "Capsule, 50px tall (sm 44px), headline weight. One `primary` per screen (`tint` fill, `on-tint` text, `shadow-btn`). `secondary` is `tint-fill` with `tint-text`; `ghost` is transparent with `tint-text`; `neutral` (surface, hairline border) is for third-party sign-in such as Google." },
  { name: "Chip", swift: "none: plain metadata text, a `Picker` or small `.bordered` buttons", props: "selected, onClick, children", notes: "Capsule, 28px tall, footnote medium, on `fill`. Selected inverts (`label` background, `background` text), never `tint`. With onClick it is a toggle button (aria-pressed)." },
  { name: "RatingStars", swift: "RatingStars", props: "value 0–5 in halves, size px", notes: "Five stars; filled in `star`, empty as a 1.5px `outline` stroke. Read-only; labelled \"Rated N out of 5\"." },
  { name: "Poster", swift: "Poster", props: "title, poster", notes: "2:3 at `rounded-sm`. With no image, the show's initials in `outline` on `fill`." },
  { name: "ShowRow", swift: "EntryRow, in a List", props: "title, venue, date, rating, poster", notes: "56px poster, headline title, subheadline `venue · date` in `label-secondary`, then stars (or a \"Want to see\" chip). Lives in a `surface` list with `separator` hairlines." },
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
  "**Structure.** A native `TabView` (Home, Log, Profile); Log is a tab that opens the log sheet. Each tab is a `NavigationStack`: large titles on the tab roots, inline titles on detail screens, actions in the navigation bar.",
  "**Lists are Lists.** List-like screens are `List(.insetGrouped)` on the grouped background, with system chevrons from `NavigationLink`, `.swipeActions` and `.contextMenu`. Bulk select is the system edit mode with bottom-bar actions. Detail and edit screens are a `Form`.",
  "**One custom container:** the feed post (`PostCard`), photo first like Instagram or Hevy: header, the photo at the card's full width (4:5), the show, stars and note, then counts and a trip tag on one row. The whole card is one tap target that scales to 98% when pressed.",
  "**Surfaces.** `Color(.secondarySystemGroupedBackground)` with 16pt continuous corners and a 1pt stroke at 6% of the label colour (`.groupedCard()`). No drop shadows anywhere.",
  "**Type and colour.** Dynamic Type text styles only; system semantic colours for text and backgrounds; coral only on interactive elements. Text on coral is `onTint` (dark), never white.",
  "**Controls.** System button styles: one `.borderedProminent` per screen, otherwise `.bordered` or plain tinted text. Toggles, pickers, date pickers, `.searchable` (people search sits under Home's title, like Spotlight), `ShareLink`, `PhotosPicker`.",
  "**Presentations.** Sheets for self-contained tasks, each with its own `NavigationStack` and Cancel / Save (or Done) in the bar: log a show, edit a trip, Share. Destructive steps confirm with a `.confirmationDialog`.",
  "**Loading.** Grey placeholder rows in the shape of the content (`.redacted`), never a spinner over the screen. Likes update at once and sync in the background.",
  "**Light only for now:** `.preferredColorScheme(.light)` at the root. Semantic colours keep dark mode a one-line change.",
];

/** How each colour token is expressed in SwiftUI. */
export const IOS_TOKENS = [
  { token: "background", swift: "Color(.systemGroupedBackground)", note: "Every screen" },
  { token: "surface", swift: "Color(.secondarySystemGroupedBackground)", note: "List cells, cards (`.groupedCard()`)" },
  { token: "fill", swift: "Color(.tertiarySystemFill)", note: "Placeholders, capsule tags" },
  { token: "label", swift: "`.primary` / `Color(.label)`", note: "Primary text" },
  { token: "label-secondary", swift: "`.secondary`", note: "Venue, date, captions" },
  { token: "separator", swift: "system list separators", note: "Drawn by `List`; cards use a 6% label-colour stroke" },
  { token: "tint", swift: "`Palette.tint`", note: "Accent fills: liked heart, calendar days, avatar badge" },
  { token: "tint-text", swift: "`Palette.tintText`, set as the app `.tint`", note: "Buttons, links, the selected tab, `.borderedProminent` fills" },
  { token: "tint-fill", swift: "`Palette.tintFill`", note: "Initials avatars, icon badges" },
  { token: "on-tint", swift: "`Palette.onTint`", note: "Text and icons on `tint`" },
  { token: "star", swift: "`Palette.star`", note: "Rating stars" },
  { token: "destructive", swift: "`role: .destructive` / `.red`", note: "System red; the system styles destructive buttons" },
];

/** The SwiftUI building blocks, in apps/ios/Stubbed. */
export const IOS_COMPONENTS = [
  { name: "Screen", file: "Design/Screen.swift", notes: "A scrolling screen on the grouped background with a large (or inline) title and room above the tab bar. For screens that aren't lists, like the feed." },
  { name: ".groupedCard()", file: "Design/Theme.swift", notes: "The inset grouped surface: secondary grouped background, 16pt continuous corners, 1pt stroke, no shadow." },
  { name: "PostCard", file: "Screens/Home/PostCard.swift", notes: "A feed post, photo first. One tap target with `CardPressStyle`; the avatar, counts and trip tag push through the router (a `NavigationLink` inside a List row would gain a chevron)." },
  { name: "EntryRow", file: "Screens/Entry/EntryList.swift", notes: "A diary or trip row in a List: 48×64 poster, headline title, `venue · date`, stars or \"Going\", then trips and privacy as caption metadata." },
  { name: "Poster", file: "Design/Components.swift", notes: "The show's photo, or its initials on `tertiarySystemFill`, at 8pt continuous corners." },
  { name: "Avatar", file: "Design/Components.swift", notes: "Circular profile photo, or the first letter in `tintText` on `tintFill`." },
  { name: "RatingStars / RatingInput", file: "Design/Components.swift, Screens/Log/RatingInput.swift", notes: "Five SF Symbol stars in half steps, scaled with Dynamic Type. The input drags or taps, with a haptic, and is an adjustable control for VoiceOver." },
  { name: "PersonRow / FollowButton", file: "Screens/People/", notes: "A person as a List row (avatar, @handle, name) with Follow (`.borderedProminent`), or Following / Requested (`.bordered`)." },
  { name: "ShareScreen / ShareCarousel / ShareRow", file: "Screens/Share/ShareCarousel.swift", notes: "The Share sheet: the card at full width with 16pt margins, swipe between designs, then Stories, More, Download, Copy text and Link. A row with a thumbnail opens it from a detail screen." },
  { name: "CommentComposer", file: "Screens/People/PublicEntryView.swift", notes: "A growing field with an inline send arrow, pinned above the tab bar with `.safeAreaInset(edge: .bottom)`." },
  { name: "PlaceholderRows / EmptyState", file: "Design/Components.swift", notes: "Redacted grey rows for a first load; `ContentUnavailableView` with an SF Symbol for empty and error states." },
  { name: "RemoteImage", file: "Design/Components.swift", notes: "Photos from a URL on a grey placeholder of the final size. Caches and retries, where `AsyncImage` gives up in a scrolling feed." },
  { name: "Wordmark", file: "Design/Components.swift", notes: "Lowercase `stubbed`, heavy, tight tracking, in `label`; VoiceOver reads \"Stubbed\"." },
];

/** Screenshots of the iOS app (iPhone 17 Pro simulator, test data), in public/design-system/ios. */
export const IOS_SCREENSHOTS = [
  { file: "home.jpg", title: "Home", caption: "Large title, people search under it, feed posts on the grouped background.", width: 460, height: 1000 },
  { file: "post-photo.jpg", title: "Feed post with a photo", caption: "Photo first at the card's full width; counts and a trip tag on one row.", width: 735, height: 1000 },
  { file: "people-search.jpg", title: "People search", caption: "While searching, matching people with Follow replace the feed.", width: 964, height: 1000 },
  { file: "profile.jpg", title: "Profile", caption: "An inset grouped List: header, counts as rows, follow requests, Diary and Trips.", width: 460, height: 1000 },
  { file: "diary.jpg", title: "Diary rows", caption: "EntryRow in Upcoming and Seen sections; swipe or long press to edit or delete.", width: 460, height: 1000 },
  { file: "entry.jpg", title: "A show", caption: "A Form: the show first, then Share, then likes, trips and privacy, then Delete.", width: 460, height: 1000 },
  { file: "share.jpg", title: "Share", caption: "The Share sheet: the card at full width, then the ways to send it.", width: 460, height: 1000 },
  { file: "log-form.jpg", title: "Log a show", caption: "A Form in a sheet: date with quick picks, rating, note, a segmented visibility picker.", width: 460, height: 1000 },
  { file: "comments.jpg", title: "Comments", caption: "Comments as List rows (swipe to delete) and the composer pinned above the tab bar.", width: 460, height: 1000 },
  { file: "edit-profile.jpg", title: "Edit profile", caption: "Settings-style Form with section footers for help text and Save in the bar.", width: 460, height: 1000 },
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
