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
  "**Native first.** Built for the SwiftUI iOS app; the web mirrors it. Token names match the iOS semantic colours (`FLColor` in Swift).",
  "**Follows the system appearance.** Light and dark are equals; the web follows `prefers-color-scheme` and never picks for the visitor. Exception for now: the landing page, sign-in, the signed-in app and public profiles are always light.",
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
];

export const TYPE_RULES = [
  "The system font only: SF Pro on Apple devices, the system sans elsewhere. No web fonts.",
  "Titles (Large Title, Title, Title 2) use SF Pro Display, bold.",
  "Never set body text below Footnote (13px).",
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
  { name: "Button", swift: "FLButtonStyle", props: "variant primary | secondary | ghost | neutral; size md | sm", notes: "Capsule, 50px tall (sm 44px), headline weight. One `primary` per screen (`tint` fill, `on-tint` text, `shadow-btn`). `secondary` is `tint-fill` with `tint-text`; `ghost` is transparent with `tint-text`; `neutral` (surface, hairline border) is for third-party sign-in such as Google." },
  { name: "Chip", swift: "FLChip", props: "selected, onClick, children", notes: "Capsule, 28px tall, footnote medium, on `fill`. Selected inverts (`label` background, `background` text), never `tint`. With onClick it is a toggle button (aria-pressed)." },
  { name: "RatingStars", swift: "FLRatingStars", props: "value 0–5 in halves, size px", notes: "Five stars; filled in `star`, empty as a 1.5px `outline` stroke. Read-only; labelled \"Rated N out of 5\"." },
  { name: "Poster", swift: "(inside FLShowRow)", props: "title, poster", notes: "2:3 at `rounded-sm`. With no image, the show's initials in `outline` on `fill`." },
  { name: "ShowRow", swift: "FLShowRow", props: "title, venue, date, rating, poster", notes: "56px poster, headline title, subheadline `venue · date` in `label-secondary`, then stars (or a \"Want to see\" chip). Lives in a `surface` list with `separator` hairlines." },
  { name: "ShowCard", swift: "none (iOS uses FLShowRow)", props: "same as ShowRow", notes: "160px portrait card for web shelves and carousels." },
  { name: "TabBar", swift: "native TabView", props: "items, active, onSelect", notes: "Phone-width web app only (sidebar on desktop). At most four tabs; 24px line icons; selected tab in `tint-text`, others `label-secondary`." },
  { name: "Wordmark", swift: "FLWordmark", props: "size px (min 16)", notes: "Lowercase text, screen readers hear \"Stubbed\"." },
];

export const ICON_RULES = [
  "iOS: SF Symbols (`book`, `plus.circle`, `chart.bar`, `person` for the tabs).",
  "Web: inline line icons drawn to match SF Symbols at 24px with a 1.5px stroke, round caps and joins. No icon package.",
];

export const IOS_RULES = [
  "The iOS UI is native, not a copy of the web: same features, data and rules, designed as a premium native app.",
  "System grouped backgrounds, `List(.insetGrouped)`, no drop shadows, the native tab bar, Dynamic Type and SF Symbols.",
  "System button styles (`.borderedProminent`, `.bordered`) tinted coral; sheets for self-contained tasks.",
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
    "Semantic tokens, each with a light and a dark value. Use the token, never the raw hex. On the web they are CSS custom properties (`var(--tint)`) and Tailwind colours.",
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
    "## CSS variables",
    "",
    "```css",
    ":root {",
    ...COLORS.map((c) => `  --${c.name}: ${c.light};`),
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    ...COLORS.map((c) => `    --${c.name}: ${c.dark};`),
    "  }",
    "}",
    "```",
    "",
  ].join("\n");
}
