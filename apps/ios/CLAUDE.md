# iOS app: working notes for Claude Code

Native SwiftUI app, iOS 17+, iPhone only. Scope and backend rules are in [`README.md`](README.md); the root `CLAUDE.md` still applies.

## Design direction: native iOS, not the web

The app no longer mirrors the web app's UI. Data, features and rules stay the same as the web (and live in Postgres), but every screen should feel like a modern, premium native iOS app, in the spirit of Apple Fitness or Personal Best. Don't port web layout patterns: no custom card drop shadows, no floating action buttons, no hand-sized fonts. When the web and iOS disagree on presentation, iOS follows these rules (logged in `docs/DECISIONS.md`, 2026-10-16). Share cards are the exception: they're images people post, so they keep matching the web's designs.

1. **Navigation.** Each tab is a `NavigationStack` with a standard `.navigationTitle` in `.large` display mode. Screen actions (find people, add, edit, settings) go in the navigation bar with `.toolbar { ToolbarItem … }`, not as buttons in the content.
2. **Backgrounds and grouping.** Screens use `Color(.systemGroupedBackground)`. Grouped content sits in inset containers on `Color(.secondarySystemGroupedBackground)`, clipped with `RoundedRectangle(cornerRadius: 16, style: .continuous)`, with at most a hairline border. No drop shadows. Use `Design/Theme.swift` (`.groupedCard()`, `Screen`), not one-off backgrounds.
3. **Tab bar and logging.** A native `TabView` (Home, Log, Profile). Log is a tab item that opens the log sheet rather than a screen; there is no floating button over the tab bar.
4. **Type and icons.** Dynamic Type text styles only (`.largeTitle`, `.title2.bold()`, `.title3`, `.headline`, `.body`, `.subheadline`, `.footnote`, `.caption`); no fixed point sizes in screens. Icons are SF Symbols (`heart.fill`, `bubble.left`, `plus`, `chevron.right`…), not drawn shapes.
5. **Colour.** Text uses the system semantic colours (`.primary`, `.secondary`, `.tertiary`); the coral `Palette.tint` is the accent for interactive elements and highlights only. Everything must read in dark mode too.
6. **Interactivity cues.** Tappable rows and cards end in a `chevron.right` (`.footnote`, `.tertiary`) and use a `Button` or `NavigationLink` with a pressed state (`.pressableRow()` highlights on press; icon buttons use `.borderless`). Destructive and confirmation steps use system dialogs.
7. **System components first.** `ContentUnavailableView` for empty and error states, `ProgressView` for loading, `List`/`Form` where a screen is a list or settings, `.searchable`, `.refreshable`, `.confirmationDialog`, `ShareLink`/the share sheet, `PhotosPicker`.

## The dev loop (no Xcode UI needed)

Run from `apps/ios`. Every command is headless, so it works from a remote session on the Mac.

| Command | What it does |
|---|---|
| `scripts/dev build` | Build for the Simulator. Prints errors, our warnings and the verdict; full log in `build/logs/build.log`. |
| `scripts/dev test` | Run the unit tests (Swift Testing, `StubbedTests/`). |
| `scripts/dev ui [Class[/test]]` | Run the UI tests (`StubbedUITests/`, XCUITest) against local Supabase. Builds once, then resets the test data (`scripts/test-seed.sql`) before each test class, so classes can't affect each other. Screenshots saved with `snapshot("name")` land in `build/ui/`. Run it in the background: a full run takes about 15 minutes. |
| `scripts/dev test-users` | Create or reset the local test users: `ios-test@stubbed.local` (handle `ios_test`) and `ios-new@stubbed.local` (no handle, recreated each run), password `stubbed-ios`. |
| `scripts/dev run` | Build, install and launch on the Simulator, wait 3s (`WAIT=…`), save `build/screenshot.png`. **Read the PNG to check UI work.** |
| `scripts/dev screenshot [path]` | Screenshot whatever is on the Simulator now. |
| `scripts/dev logs [secs]` | The app's recent log lines. Log with `os.Logger(subsystem: "com.felixng.stubbed", …)` so they show up. |
| `scripts/dev archive` | Archive a Release build and upload it to TestFlight. Needs the owner's Apple account in Xcode; leave it to the owner unless asked. |
| `scripts/dev types` | Regenerate `Stubbed/Generated/Database.swift` from local Supabase after a migration. Never edit that file by hand. |

`SIM="iPhone SE (3rd generation)" scripts/dev run` checks a small screen. Before calling UI work done, check the screenshot on both a small and a large phone, and in dark mode (`xcrun simctl ui booted appearance dark`).

You can't tap the Simulator yourself. To check a screen deeper in the app, write a UI test that signs in (`signIn(app)` in `UITestSupport.swift`), navigates there and calls `snapshot(...)`. Don't leave debug shortcuts in the app. Test data: `scripts/test-seed.sql` gives `ios_test` a small diary (two NYC shows in a trip, a private one, an upcoming one), `ios_friend` to follow (24 public shows, a like and a comment), and `ios_fan` with a pending follow request. UI test notes: text fields use the `tap(_:)` helper (padded SwiftUI fields report "not hittable"); buttons use `.tap()`, which scrolls them into view; swipe up first if the keyboard covers a button; `signIn` dismisses iOS's "Save Password?" prompt.

## Backend

- **Debug builds talk to local Supabase** at `127.0.0.1:54321`. Start it from the repo root with `supabase start` (needs Docker Desktop running). `supabase status` shows whether it's up.
- Release builds use the hosted project. URLs and keys are in `Config/*.xcconfig`; `Config/Secrets.xcconfig` (git-ignored, see `Secrets.example.xcconfig`) overrides Debug.
- Schema changes go in `supabase/migrations` (shared with the web) and are applied with `supabase db reset` locally. Then run `scripts/dev types`.
- Local auth emails (one-time codes) land in Mailpit at http://127.0.0.1:54324.

## Project conventions

- **Files are picked up automatically.** `Stubbed/` and `StubbedTests/` are synchronized folders: create, move or delete `.swift` files on disk and the next build sees them. Don't edit `project.pbxproj` for that. Do edit it (carefully, then `scripts/dev build`) only for new targets, packages or build phases.
- Target build settings live in `Config/Shared.xcconfig`, not in the project file.
- New Swift packages are dependencies: ask the owner first (root `CLAUDE.md`). `supabase-swift` is the only one so far.
- Swift 6 language mode with strict concurrency. Two-space indentation.
- Layout: `Stubbed/App` (entry point, tabs), `Design` (tokens in `Theme.swift`, shared views in `Components.swift`, `Screen`), `Data` (Supabase client, config, logging), `Screens` (one folder or file per area).
- Spacing comes from `Space`; the accent is `Palette.tint` (with `tintText`, `tintFill`, `onTint` for text on the tint, and `star`). Backgrounds and text use system colours (see Design direction); the web's other tokens are gone. Settings-like screens are a `Form`; their actions (Save, Create) go in the navigation bar.
- Keep logic that the web also needs in Postgres (see README). The Swift side renders and calls RPCs.

## Signing

Simulator builds need no signing. Team `AAW3XNQ6D3`, bundle ID `com.felixng.stubbed`, automatic signing. Device or TestFlight builds need `-allowProvisioningUpdates` and the owner's Apple account in Xcode; leave those to the owner unless asked.
