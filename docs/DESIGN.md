# Design system ("Footlight Coral")

The source of truth is the design system artifact: https://claude.ai/artifact/2r1EvQn2286Y29ZJNgPfP6. It is native first: built for the SwiftUI iOS app, with the web app and site mirroring it. Its `ios.md` has the Swift files (`FLColor`, `FLMetrics`, components); `web.md` has the web rules. If you change a token or rule, change it in the artifact first, then mirror it here, in `apps/web/src/app/globals.css`, in `apps/web/src/lib/design-system.ts` (the public `/design-system` page and `/design-system.md`) and in the Swift files.

## Principles

- **Light by default.** Every page and screen is light, whatever the device setting (owner's call). On the web each page sets `data-theme="light"` on its root, which switches the whole document to the light tokens (`globals.css`); a new page must do the same. iOS sets `.preferredColorScheme(.light)`. The dark tokens stay defined and working for when dark mode comes back.
- **One tint.** `tint` is coral in both appearances and fills the one primary action. Where the brand colour is read as text (links, ghost and secondary button labels, the selected tab) use `tint-text`: the same coral on dark, a deeper shade on light. Nothing else.
- **Copy:** terse and confident, sentence case, no emoji, no exclamation marks. Button labels are verbs. Numbers are digits and tabular. Sample handle: `@sillyelphaba`; never a real person's name.
- **Ratings** always show as the five `RatingStars`, never a bare number.
- **Wordmark:** `stubbed`, always lowercase: SF Pro Display (system stack on web), weight 800, letter-spacing -0.045em (Swift `.tracking(-size * 0.045)`), line height 1, no text transform, in `label`, never `tint` or `tint-text`. 20pt in app navigation and headers, 26–32px in the web header (28 on the landing page), 16 minimum. Accessible label "Stubbed". "Stubbed" with a capital S in running text.

## Tokens → Tailwind

Defined in `apps/web/src/app/globals.css`. Names match the iOS semantic colours and `FLColor`.

| Token | Tailwind | Use |
|---|---|---|
| `background` | `bg-background` | Every screen; marketing pages stay on it |
| `surface` | `bg-surface` | Grouped lists, cards, inputs, sheets |
| `fill` | `bg-fill` | Poster placeholders, chips, wells |
| `label`, `label-secondary` | `text-label`, `text-label-secondary` | All text |
| `separator` | `border-separator` | Hairlines between rows, inset to the text |
| `outline` | `border-outline`, `stroke-outline` | Control borders, empty stars, placeholder initials |
| `tint`, `tint-pressed`, `on-tint` | `bg-tint`, `hover:bg-tint-pressed`, `text-on-tint` | Primary button fill and text on it; never text on its own |
| `tint-text` | `text-tint-text` | Links, ghost and secondary button labels, selected tab |
| `tint-fill` | `bg-tint-fill` | Secondary buttons, highlighted rows |
| `star` | `fill-star` | Rating stars and award marks only |
| `destructive` | `text-destructive` | Delete, sign out, error text |
| `focus` | `outline-focus` | 2px focus ring, 2px offset (web only) |
| `glow` | `bg-glow` | Decorative halo behind a hero image or device; never behind text |
| `shadow-sm` | `shadow-sm` | Cards, grouped lists, the email field; with a `separator` border |
| `shadow-lg` | `shadow-lg` | Device mockups and sheets |
| `shadow-btn` | `shadow-btn` | The primary button |

**Type:** the system font: SF Pro on Apple devices, the system sans elsewhere (`font-display`, `font-sans`). No web fonts. The iOS text styles at their default sizes are Tailwind font sizes that carry line height, weight and tracking: `text-large-title` 34, `text-title` 28, `text-title-2` 22 (bold, with `font-display`), and `text-headline` 17/600, `text-body` 17 (default), `text-callout` 16, `text-subheadline` 15, `text-footnote` 13, `text-caption` 12. Never set body text below `footnote`. Web app page headings (`h1`) use `text-title`, not `text-large-title`, so they don't outweigh the header wordmark; iOS keeps native Large Titles. The landing hero headline (`clamp(44px, 7vw, 76px)`, extra bold) and feature card titles (20px) are marketing sizes outside the iOS styles.

**Spacing:** `space-1…space-7` = 4, 8, 12, 16, 20, 24, 32px = Tailwind `1, 2, 3, 4, 5, 6, 8`. Screen gutter and row padding `4`; sections `5` apart; web page gutters `8` from `sm`. Anything tappable is at least 44px (`min-h-11`).

**Radius:** `rounded-sm` 8px (posters), `rounded-md` 12px (cards, grouped lists, inputs), `rounded-lg` 20px (sheets), `rounded-pill` (buttons, chips, avatars).

## Components

React mirrors of the SwiftUI components live in `apps/web/src/components/ui/`:

| Component | SwiftUI | Props | Notes |
|---|---|---|---|
| `Button` | `FLButtonStyle` | `variant` primary \| secondary \| ghost \| neutral, `size` md \| sm | Capsule, 50px tall; one `primary` per screen, with `shadow-btn`; `neutral` (surface, hairline border) for third-party sign-in such as Google |
| `Chip` | `FLChip` | `selected`, `onClick`, children | Capsule; selected inverts, never `tint` |
| `RatingStars` | `FLRatingStars` | `value` 0–5 (halves), `size` px | |
| `ShowRow` | `FLShowRow` | `title`, `venue`, `date`, `rating`, `poster` | Inside a `surface` list with `separator` hairlines |
| `ShowCard` | none (use `FLShowRow`) | same as `ShowRow` | 160px portrait card for web shelves |
| `TabBar` | native `TabView` | `items`, `active`, `onSelect` | Phone-width web app only; sidebar on desktop |
| `Wordmark` | `FLWordmark` | `size` px (min 16) | Lowercase text, `sr-only` "Stubbed" |
| `Poster` | (inside `FLShowRow`) | `title`, `poster` | 2:3, initials in `outline` on `fill` when no image |

## Icons

SF Symbols on iOS (`book`, `plus.circle`, `chart.bar`, `person` for the tabs). On the web, inline line icons drawn to match at 24px with a 1.5px stroke, as in `TabBar`. No icon package.
