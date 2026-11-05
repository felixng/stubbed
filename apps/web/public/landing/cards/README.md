# Landing gallery demo cards

Eight 1080×1080 exports from the production web Canvas renderer, generated on 5 November 2026. Data lives in `apps/web/scripts/landing-card-demo.ts`; it is synthetic, local-only and never seeded into an account. The 57 visits across Jan–early Nov comprise 44 musicals, 8 plays, 3 comedy and 2 stand-up visits, with 34 unique shows, an 8-week current streak, and a 7th visit to Wicked. Monthly counts total 57. The venue, Emerald Theatre, is fictional.

`demo-theatre-photo.webp` is an AI-generated fictional emerald-curtain photo. It is not an actual Wicked performance photograph or official show artwork. Photo cards use this as their background. All typography, badges, charts and branding are drawn by the existing app renderer, unchanged. This is illustrative marketing content, labelled as demo in the gallery.

To regenerate, call `renderLandingDemoCards(photo)` in a local client-only scratch page using the source photo, download each returned Blob as PNG, then encode to WebP at quality 92 using the installed Sharp package. Do not commit or deploy the scratch page. Keep exports 1080×1080 and inspect all eight before replacing assets. Next Image serves responsive versions; the renderer is not shipped to landing visitors.

Card files: `stats`, `name`, `data`, `encore`, `show-number`, `weekly-streak`, `year-in-theatre`, `show-mix`. Real alt descriptions and the demo disclosure are editable in the `sharingLanding` CMS section. Hero, diary and stats section placeholders are intentionally unchanged.
