# Landing page stories (placeholders)

`placeholder-1.webp` and `placeholder-2.webp` are **third-party screenshots of another app's Instagram Stories**, used only so the owner can see the layout of the "Seen on Stories" band (`src/components/landing/Stories.tsx`). They must be replaced before this ships: do not publish them.

`placeholder-1` is cropped to 9:16 to leave out Instagram's own interface (the top icon row and the caption bar). `placeholder-2` is already 9:16.

Real examples (demo data is fine, per the owner):

- Portrait 9:16, around 1080×1920, WebP.
- A real-looking story with a Stubbed card or stats text on top of a photo. No Instagram interface in the frame (no close button, text tools, caption bar or sticker tray).
- Update `storyAlt1`, `storyAlt2` (and add more) in `src/lib/cms/definitions.ts`, and drop the "placeholder" wording from `storiesCaption`.
