# Landing gallery demo cards

Ten 1080×1080 exports from the production web Canvas renderer, generated on 5 November 2026. Data lives in `apps/web/scripts/landing-card-demo.ts`; it is synthetic, local-only and never seeded into an account. The 57 visits across Jan–early Nov comprise 44 musicals, 8 plays, 3 comedy and 2 stand-up visits, with 34 unique shows, an 8-week current streak, and a 7th visit to Operation Mincemeat at the Fortune Theatre. Monthly counts total 57. The repeat-visit entry is Operation Mincemeat at the Fortune Theatre in the West End. The programme-only Mincemeat photo names Golden Theatre and is used for a rating layout, which does not print venue or visit counts. The Lost Boys is a 56th visit, seen twice, at Palace Theatre.

Four owner-supplied photographs replace the generated photo. Sources 1–4 are re-encoded to WebP with orientation applied and metadata stripped. Photo 1: Operation Mincemeat programme at Golden Theatre (rating layout). Photo 2: Operation Mincemeat curtain call at Fortune Theatre (data layout, repeated-visit entry). Photo 3: The Lost Boys programme at Palace Theatre (data layout). Photo 4: The Lost Boys stage (rating layout). Stats remain illustrative. The two photo layouts each have two variants; the other six layouts are unchanged in structure. No AI-generated image remains in these assets.

All text, badges, charts and branding come from the existing app renderer.

To regenerate, call `renderLandingDemoCards(photo)` in a local client-only scratch page using the four source photos in numerical order, download each returned Blob as PNG, then encode to WebP at quality 92 using the installed Sharp package. Do not commit or deploy the scratch page. Keep exports 1080×1080 and inspect all ten before replacing assets. Next Image serves responsive versions; the renderer is not shipped to landing visitors.

Card files: `stats`, `name`, `data`, `encore`, `show-number`, `weekly-streak`, `year-in-theatre`, `show-mix`, `stats-lost-boys`, `name-lost-boys`. Real alt descriptions and the demo disclosure are editable in the `sharingLanding` CMS section. Hero, diary and stats section placeholders are intentionally unchanged.
