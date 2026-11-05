# Landing gallery demo cards

Ten 1080×1080 exports from the production web Canvas renderer, generated on 5 November 2026. Data lives in `apps/web/scripts/landing-card-demo.ts`; it is synthetic, local-only and never seeded into an account. The 57 visits across Jan–early Nov comprise 44 musicals, 8 plays, 3 comedy and 2 stand-up visits, with 34 unique shows, an 8-week current streak, and a 7th visit to Operation Mincemeat at the Fortune Theatre. Monthly counts total 57. The repeat-visit entry is Operation Mincemeat at the Fortune Theatre in the West End. The programme-only Mincemeat photo names Golden Theatre and is used for a rating layout, which does not print venue or visit counts. The Lost Boys is a 56th visit, seen twice, at Palace Theatre.

Four owner-supplied photographs replace the generated photo. Sources 1–4 are re-encoded to WebP with orientation applied and metadata stripped. Photo 1: Operation Mincemeat programme at Golden Theatre (rating layout). Photo 2: Operation Mincemeat curtain call at Fortune Theatre (data layout, repeated-visit entry). Photo 3: The Lost Boys programme at Palace Theatre (data layout). Photo 4: The Lost Boys stage (rating layout). Stats remain illustrative. The two photo layouts each have two variants; the other six layouts are unchanged in structure. No AI-generated image remains in these assets.

All text, badges, charts and branding come from the existing app renderer.

To regenerate, call `renderLandingDemoCards(photo)` in a local client-only scratch page using the four source photos in numerical order, download each returned Blob as PNG, then encode to WebP at quality 92 using the installed Sharp package. Do not commit or deploy the scratch page. Keep exports 1080×1080 and inspect all ten before replacing assets. Next Image serves responsive versions; the renderer is not shipped to landing visitors.

Card files: `stats`, `name`, `data`, `encore`, `show-number`, `weekly-streak`, `year-in-theatre`, `show-mix`, `stats-lost-boys`, `name-lost-boys`. Real alt descriptions and the demo disclosure are editable in the `sharingLanding` CMS section. Hero, diary and stats section placeholders are intentionally unchanged.

## Native stats exports and hero (5 November 2026)

Seven additional 1080px exports use the iOS SwiftUI views: `activity` (daily calendar grid), `most-seen-shows`, `around-the-world`, `year-by-year`, `daily-streak`, `best-weekly-streak`, `best-daily-streak`. The gallery now has 17 images, including photo variants. The hero reuses the supplied-photo Mincemeat and Lost Boys cards plus `activity`.

Reproduce on macOS with Xcode:

```sh
python3 apps/ios/scripts/render-landing-demo-cards.py /tmp/stubbed-native-cards
swiftc -parse-as-library -module-cache-path /tmp/stubbed-native-cards/cache /tmp/stubbed-native-cards/Export.swift -o /tmp/stubbed-native-cards/export
/tmp/stubbed-native-cards/export
```

The helper extracts the production SwiftUI views into a local AppKit ImageRenderer harness, supplies synthetic data without Supabase, loads the actual ticket-mark and country-boundary resources, and exports at 2× scale. Mac-specific colour fallbacks and explicit map/section sizing reproduce the native layout in a headless macOS export; app source files are never modified. Convert the resulting PNG files to quality-92 WebP as above. Inspect the resulting images, including the footer and map, before replacing assets.

The generated `data.json` records the demo day distribution, repeated shows, countries and years. Current-year activity totals 57 and matches the existing monthly bars. Travel counts are 49 UK + 8 US. Earlier years have 61 (2024) and 66 (2025); the history card shows those alongside 2026 so far. Calendar days include matinee doubles and reproduce a 12-week best streak, an 8-week current run and a best daily run of 3. The data is illustrative, not a real user's attendance record.
