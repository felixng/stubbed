# Building iOS UI that feels native

How to make a SwiftUI app feel like it belongs next to Settings, Health and Fitness rather than like a website in an app shell. This guide is deliberately independent of any one app's current code: it describes the target, not the state of `apps/ios`.

The reference point is apps like **Personal Best**, which feel like Apple shipped them. They get there not through a clever visual style but by doing very little custom work: system containers, system controls, system type and colour, and system behaviour, with the app's personality concentrated in a few places (data, charts, a tint colour).

---

## 1. The core principle

**Native feel comes from behaviour, not looks.** A screen can be pixel-close to Settings and still feel like a web view if scrolling, navigation, text sizing, haptics or gestures behave differently. Users feel the behaviour long before they notice the visuals.

So the default answer to "how should this look?" is: **use the system component and leave it alone.** Every customisation needs a reason. When you inherit system components you also inherit, for free:

- the current OS design language (materials, bar styles, corner radii, glass effects) and its future updates
- Dynamic Type, Dark Mode, Increase Contrast, Reduce Motion, Reduce Transparency
- VoiceOver labels, traits and rotor behaviour
- correct gestures (swipe back, pull to refresh, scroll-to-top on status bar tap, long press menus)
- correct keyboard, focus and safe-area handling

A custom component has to rebuild all of that, and usually doesn't.

## 2. Why apps feel web-like

These are the usual tells. If you see one, it's a bug.

| Web habit | What it feels like on iOS | Native replacement |
|---|---|---|
| Cards with drop shadows on a white/grey page | A Bootstrap dashboard | `List` / `Form` with `.insetGrouped` style on the grouped background |
| Fixed pixel font sizes, custom fonts everywhere | Text that ignores the user's size setting | Text styles (`.body`, `.headline`, `.footnote`) and Dynamic Type |
| A custom header bar with a back arrow | Broken swipe-back, wrong title behaviour | `NavigationStack` with the system navigation bar and large titles |
| Hamburger menu or custom bottom nav | Unfamiliar, non-standard | `TabView` (system tab bar) |
| Big full-width coloured "primary" buttons for every action | A landing page | Toolbar buttons, rows, `Menu`, and one prominent button only where there's a single obvious action |
| Modals that slide/fade in from the middle | A JavaScript lightbox | `.sheet` (with detents), `.fullScreenCover`, `.confirmationDialog`, `.alert` |
| Spinners while everything loads | A page refresh | Show cached/optimistic data instantly; `.redacted(reason: .placeholder)` for first load |
| Hover-style states, underlined links | Desktop UI | Row highlight on press, `NavigationLink` chevrons, tinted text buttons |
| Toasts / snackbars | Android or web | Inline state change, haptic, or a short-lived system-style banner only when nothing else fits |
| Custom checkboxes, radio buttons, dropdowns | Form-on-a-website | `Toggle`, `Picker` (inline, menu or navigation-link style), checkmark rows |
| Everything centred, wide margins, max-width containers | A responsive web page | Leading-aligned content with system margins (`.listRowInsets` left alone) |
| Icon fonts or PNG icons | Slightly wrong weights and alignment | SF Symbols, matched to the text style they sit next to |
| Bespoke colour for every element | Busy, branded | Semantic system colours plus one app tint |

## 3. Structure and navigation

**Tabs for top-level areas, stacks within them.**

- Use `TabView` with 3 to 5 tabs. Each tab owns its own `NavigationStack` so it keeps its place when you switch away and back.
- Tapping the active tab again should pop to root, then scroll to top. The system does this when you use standard containers; don't break it.
- Use **large titles** (`.navigationBarTitleDisplayMode(.large)`) on root screens of each tab and on screens that are destinations in their own right. Use `.inline` for deeper detail and editing screens. Large titles must collapse into the bar on scroll: that only happens when the scrolling content is the screen's primary `List`/`ScrollView`, so don't wrap it in extra containers.
- Never hide the system back button to draw your own. You lose the swipe-back gesture, the long-press back history menu and the correct back title.

**Pick the right presentation:**

| Situation | Use |
|---|---|
| Drilling into more detail of the thing you're looking at | Push (`NavigationLink` / `navigationDestination`) |
| A self-contained task: create, edit, compose, pick | `.sheet`, with its own `NavigationStack` so it has a title bar with Cancel / Done (or Add / Save) |
| A quick choice or short form | `.sheet` with `.presentationDetents([.medium, .large])` |
| Immersive content (camera, full-screen media) | `.fullScreenCover` |
| Confirm a destructive or irreversible action | `.confirmationDialog` (action-sheet style), destructive button with `role: .destructive` |
| A blocking error or a yes/no question that needs an answer | `.alert` |
| Extra actions on an item | `.contextMenu` (long press) and/or a `Menu` in the toolbar (`ellipsis.circle`) |

**Sheet conventions** (these are what Settings, Health and Calendar do):

- Cancel on the leading side, the confirming action (Done / Save / Add) on the trailing side, bold. Disable the confirming action until the input is valid.
- If the user has unsaved changes, `interactiveDismissDisabled(hasChanges)` and ask before discarding.
- Don't push a sheet's content onto the main stack, and don't stack sheets three deep.

**Toolbar placement:** primary actions go in the navigation bar (`.topBarTrailing`), not floating over content. Use `.bottomBar` only for screen-level tools (like Mail or Notes). A floating action button is an Android pattern.

## 4. Lists and forms: the Settings / Health look

The single biggest lever. Most screens in a native app are lists.

```swift
List {
    Section {
        NavigationLink { ProfileView() } label: {
            LabeledContent("Name", value: profile.name)
        }
        Toggle("Private account", isOn: $isPrivate)
    } header: {
        Text("Account")
    } footer: {
        Text("Only people you approve can see your activity.")
    }
}
.listStyle(.insetGrouped)
```

- **`List`/`Form` with `.insetGrouped`** for settings, detail and edit screens. This gives you the grouped background (`systemGroupedBackground`), rounded section cells (`secondarySystemGroupedBackground`), inset separators and correct margins on every device.
- **Section headers** are short labels in the system header style; don't restyle them. **Section footers** explain consequences ("Only people you approve…") and are the right place for help text, not inline paragraphs.
- **Rows** follow a fixed grammar: optional icon, title, optional trailing value in secondary colour, optional chevron. `LabeledContent` produces exactly this. Don't invent row layouts.
- **Chevrons come from `NavigationLink`.** Never draw a chevron yourself, and never put a chevron on something that doesn't push.
- **Selection** (choose one of a few options) is a list of rows with a checkmark on the selected one, or a `Picker` with `.inline`/`.navigationLink`/`.menu` style, not radio buttons.
- **Destructive actions** ("Delete account", "Sign out") are their own section at the bottom, a plain `Button(role: .destructive)` row, centred or leading text in red. Confirm with a dialog.
- Row height comes from content and Dynamic Type; don't set fixed heights. Tap targets must be at least 44×44 pt.
- Use **swipe actions** (`.swipeActions`) for the one or two most common per-row actions (delete, archive, pin), with a context menu as the discoverable equivalent.
- Use `.searchable` for search, `.refreshable` for pull-to-refresh, and `EditButton` / `editMode` for reordering and bulk delete.

**Custom content inside lists is fine** (a chart, a summary tile, a poster image) as long as it sits *inside* a section cell and respects the cell's insets. That is how Health puts charts on a grouped list and still looks native.

## 5. Typography

- Use **text styles only**: `.largeTitle`, `.title`–`.title3`, `.headline`, `.body`, `.callout`, `.subheadline`, `.footnote`, `.caption`, `.caption2`. Never `.font(.system(size: 17))`.
- If a design needs a custom font, wrap it with `Font.custom(_:size:relativeTo:)` so it still scales. Keep custom fonts to display moments (a big number, a title), and use SF for UI text.
- **Hierarchy through weight and colour, not size.** Health and Settings mostly use `.body` and `.subheadline`; emphasis is `.headline` or `.fontWeight(.semibold)`, de-emphasis is `.foregroundStyle(.secondary)`.
- Big numbers (stats, totals) look native with `.font(.largeTitle).fontWeight(.bold)` or `.system(.largeTitle, design: .rounded)`, and `.monospacedDigit()` when they change so they don't jitter.
- Test at the largest accessibility size. Layouts that put things side by side should switch to vertical with `ViewThatFits` or `@Environment(\.dynamicTypeSize)` when text gets large. Don't truncate primary content; let it wrap.
- Format with the system: `Text(date, style: .relative)`, `.formatted(date: .abbreviated, time: .omitted)`, `Measurement`, `.formatted(.number)`. Never hand-build date or number strings.

## 6. Colour, backgrounds and depth

- Use **semantic colours**: `Color(.systemGroupedBackground)`, `Color(.secondarySystemGroupedBackground)`, `.primary`, `.secondary`, `Color(.tertiaryLabel)`, `Color(.separator)`. They adapt to Dark Mode and Increase Contrast automatically. Even if the app pins one appearance today, semantic colours keep that decision reversible.
- Pick **one tint** (the brand colour) via `.tint()` at the root. It colours interactive elements: buttons, toggles, links, selection. Don't use it for decoration or large backgrounds.
- Additional colour is for **meaning**: category colours (as Health does per data type), status (red/green/orange), chart series. Use system colours (`.red`, `.orange`, `.teal`…) so they're tuned for both appearances.
- **No drop shadows** on content. Depth on iOS comes from grouping (cells on a grouped background), materials on system chrome, and layering via sheets. A card that "floats" with a shadow reads as web.
- **Materials** (`.regularMaterial`, `.thinMaterial`) belong on things that float over content: bars, overlays, controls on top of imagery. Don't use them as a general background colour. Let system bars draw their own material; don't paint over them with a solid colour.
- Corner radii: let containers supply them. When you must draw a rounded shape, use `RoundedRectangle(cornerRadius:style: .continuous)` (the squircle), never the default circular corners.

## 7. Icons and imagery

- **SF Symbols for every UI icon.** They align to text baselines, scale with Dynamic Type and match weight automatically when placed in a `Label` or next to text.
- Use `Label("Title", systemImage: "…")` rather than an `HStack` of image and text; lists, menus and toolbars lay labels out correctly in each context.
- Rendering modes: `.monochrome` by default (inherits tint/foreground), `.hierarchical` for a touch of depth, `.multicolor`/`.palette` only where the colour carries meaning.
- Use the symbol's semantic variant: `.fill` in tab bars and selected states, outline elsewhere. Tab bars apply this for you.
- **Settings-style icon tiles** (white glyph on a small coloured rounded square at the start of a row) are a strong native signal, but reserve them for settings-type lists. Size them relative to the row with `@ScaledMetric`.
- Images: `AsyncImage` or a cached loader with a neutral placeholder of the final size, so rows don't jump when images arrive. Clip with continuous corners.

## 8. Controls

Use the system control for every input. If it exists in Settings, it exists in SwiftUI.

| Need | Control |
|---|---|
| On/off | `Toggle` |
| One of 2–4 short options, shown together | `Picker` with `.segmented` |
| One of many | `Picker` with `.menu` or `.navigationLink`, or checkmark rows |
| Date / time | `DatePicker` (`.compact` in rows, `.graphical` in a sheet) |
| Small number | `Stepper`; continuous value `Slider` |
| Actions on a thing | `Menu`, `.contextMenu`, swipe actions |
| Share | `ShareLink` |
| Photos | `PhotosPicker` |
| Destructive confirm | `.confirmationDialog` |
| Empty state | `ContentUnavailableView` |
| Search | `.searchable` (with `.searchSuggestions` / `.searchScopes`) |

Buttons:

- Most buttons are **plain tinted text** (in rows, bars and footers). That's the iOS default and it looks native.
- Use `.buttonStyle(.borderedProminent)` for **one** primary action on a screen where it's the obvious next step (onboarding, an empty state). Use `.bordered` for secondary actions in content. Use `.controlSize(.large)` rather than custom padding.
- Give destructive buttons `role: .destructive` and cancel buttons `role: .cancel`; the system styles and orders them.

## 9. Motion, feedback and loading

- **Use the default animations.** `withAnimation { }` with no arguments, or `.animation(.default, value:)`, gets you the system spring. Custom durations and easing curves are the fastest way to feel off.
- Animate state, not views: insertions/removals in a `List` animate automatically when the data changes inside `withAnimation`.
- `.contentTransition(.numericText())` for changing numbers, `.symbolEffect` for symbol state changes. `matchedGeometryEffect` and zoom transitions (`.navigationTransition(.zoom)`) only where a thumbnail clearly becomes a detail.
- Respect **Reduce Motion** (`@Environment(\.accessibilityReduceMotion)`): swap movement for fades.
- **Haptics** via `.sensoryFeedback(...)`: `.success` on completing a task, `.selection` when scrubbing a picker or chart, `.impact` sparingly. No haptic on every tap.
- **Loading should be invisible.** Show cached or optimistic data immediately and update in place. For a genuinely empty first load, render the real layout with `.redacted(reason: .placeholder)`, not a centred spinner. A `ProgressView` belongs inside the thing that's loading (a row, a button), not over the whole screen.
- **Optimistic writes:** apply the change locally, sync in the background, roll back with a clear message if it fails. Native apps don't make you wait for a server round trip to toggle a like.
- Errors: inline in the affected section or a `ContentUnavailableView` with a retry button. Use `.alert` only when the user must acknowledge.

## 10. Data screens: the Health / Fitness pattern

Personal Best and Health present data the same way, and it's worth copying exactly:

1. **Summary first.** A section with the headline number (big, bold, rounded), its unit in secondary text, and the date range in `.footnote` secondary. One idea per tile.
2. **Chart under the summary**, built with **Swift Charts**: minimal axes, no gridline clutter, the category colour, `.chartXSelection` to scrub with a `.selection` haptic and the selected value replacing the summary while scrubbing.
3. **Time range** as a segmented `Picker` (D / W / M / 6M / Y) above the chart.
4. **Detail rows** below in normal grouped sections ("Show All Data", "Add Data", options), using the standard row grammar.
5. **Highlights / insights** as short sentences in a section, not as banners or badges.

Keep each tile tappable as a whole (it pushes to the detail), not with a separate "View more" button.

## 11. Text input and keyboard

- Put form inputs in a `Form`, one field per row, with the label as the field's placeholder or a `LabeledContent` title.
- Set `.keyboardType`, `.textContentType` (enables AutoFill for names, emails, passwords, one-time codes), `.textInputAutocapitalization` and `.autocorrectionDisabled()` correctly for each field.
- Use `@FocusState` to move between fields and `.submitLabel(.next / .done / .search)` so Return does the right thing.
- `.scrollDismissesKeyboard(.interactively)` on scrollable forms.
- Composers (comments, messages) pin to the bottom with `.safeAreaInset(edge: .bottom)` so they ride the keyboard, rather than being positioned manually.

## 12. Accessibility is part of "native"

Apple's own apps are fully accessible, so an inaccessible app feels non-native to anyone who uses these settings.

- Every icon-only button has a label (`Label` or `.accessibilityLabel`).
- Group compound rows with `.accessibilityElement(children: .combine)` so VoiceOver reads them as one item.
- Charts get an `AXChartDescriptor` or at least a meaningful summary label.
- Colour is never the only signal; pair it with a symbol or text.
- Support all Dynamic Type sizes, Bold Text, Increase Contrast, Reduce Transparency and Reduce Motion. System components do most of this already; custom ones must opt in.

## 13. Platform integration (the extra 10%)

Not required for a screen to feel native, but they make the *app* feel native:

- Context menus with previews on key items.
- `ShareLink` with proper `Transferable` content and a preview.
- Widgets and Live Activities for glanceable data.
- App Intents / Shortcuts for the two or three most common actions.
- Correct handling of universal links into the right screen.
- State restoration: reopen where the user left off (`@SceneStorage`).
- App icon variants for dark and tinted Home Screen modes.

## 14. Working rules

1. **Start from the system screen it resembles.** Before designing, name the Apple app screen that does the same job (Settings for preferences, Health for data, Contacts for a profile, Mail for a feed, Calendar for creating an event) and match its structure.
2. **No custom component where a system one exists.** If you need one, write down why in `docs/DECISIONS.md`.
3. **No hard-coded sizes, fonts, colours or spacing.** Text styles, semantic colours, `@ScaledMetric` and system padding only.
4. **Don't port web layouts.** Web and iOS share features, data and rules; they don't share layouts. Design each screen fresh for iOS.
5. **Prefer less.** Fewer sections, fewer colours, fewer buttons. Native apps feel calm because they're restrained.

## 15. Review checklist

Run this before merging any iOS UI change:

- [ ] Uses `NavigationStack`, system back button, swipe-back works
- [ ] Root screens have large titles that collapse on scroll
- [ ] Lists/forms use `.insetGrouped` on the grouped background; no shadows, no custom cards on plain backgrounds
- [ ] Only text styles; checked at the largest accessibility Dynamic Type size with nothing clipped or overlapping
- [ ] Only semantic colours and the app tint; checked in Dark Mode and Increase Contrast
- [ ] SF Symbols only; icon-only buttons have accessibility labels
- [ ] Presentations follow the table in section 3 (push vs sheet vs dialog)
- [ ] Sheets have Cancel / confirm in the bar and guard unsaved changes
- [ ] No full-screen spinners; first load uses placeholders; writes are optimistic
- [ ] Default animations only; Reduce Motion respected; haptics used sparingly and meaningfully
- [ ] Keyboard types, content types and submit labels set on every field
- [ ] VoiceOver reads each row sensibly
- [ ] Side by side with the comparable Apple app screen, nothing looks out of place

## Further reading

- Apple Human Interface Guidelines: <https://developer.apple.com/design/human-interface-guidelines>
- SF Symbols app (for browsing symbols and variants): <https://developer.apple.com/sf-symbols/>
- Swift Charts: <https://developer.apple.com/documentation/charts>
- WWDC sessions on SwiftUI lists, navigation and accessibility, refreshed each year
