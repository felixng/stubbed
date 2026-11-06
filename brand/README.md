# Brand

The Stubbed logo: two admission tickets, drawn in code so every size and
platform comes from one source.

| Variant | File | Use |
|---|---|---|
| App icon (E1) | `svg/stubbed-icon.svg` | iOS app icon, Apple touch icon, PWA icons |
| Share ticket | `svg/stubbed-share-ticket.svg` | Single-ticket outline for story overlays, using the logo geometry |
| Mark (A2) | `svg/stubbed-mark.svg` | Beside the wordmark on light backgrounds; squared up as `svg/favicon.svg`, the browser tab icon |
| Outline mark (E2) | `svg/stubbed-mark-outline.svg` | Large or decorative uses on white; base of the iOS dark and tinted icons |

Rules and downloads: the Logo section of `/design-system`.

To change the logo, edit `make_logo.py` (geometry, gradient), then:

```sh
python3 brand/make_logo.py   # brand/svg/*.svg
python3 brand/render.py      # every web and iOS asset
```

`render.py` writes `apps/web/public/brand/*`, `apps/web/src/app/{icon.svg,apple-icon.png,favicon.ico}`,
the iOS `AppIcon.appiconset` (with dark and tinted versions, no alpha channel) and
`BrandMark.imageset`. It draws with a headless Chromium (Playwright's, or set
`STUBBED_CHROME`), which keeps transparency. Standard-library Python only.
