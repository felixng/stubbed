import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Link-preview images (Open Graph) for the public entry and trip pages,
// drawn on the server with next/og. They follow the phone-drawn share cards
// (lib/share-card.ts): dark ground, coral glow, yellow stars, the `stubbed`
// wordmark and the @handle. next/og can't use the system font the cards use,
// so text is in Geist. Every element with more than one child needs
// display: flex (Satori's rule).

// next/og bundles only Geist Regular, and passing any font replaces it, so
// both weights are read here, once: Regular for the text, ExtraBold (800)
// for the wordmark (docs/DESIGN.md). The files (OFL) are in assets/fonts.
const [geistRegular, geistExtraBold] = await Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Geist-ExtraBold.ttf")),
]);
const FONTS = [
  { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
  { name: "Geist", data: geistExtraBold, weight: 800, style: "normal" },
] as const;

export const OG_SIZE = { width: 1200, height: 630 };

export const INK = "#1C1C1E";
export const CORAL = "#FF6B4A";
export const STAR = "#FFD60A";
export const SECONDARY = "#AEAEB2";

// Edited entries get a new preview URL (`?v=`), so a long CDN cache is safe
// for edits. Making an entry private can't recall an image already cached,
// so the shared cache is kept to an hour.
const CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export function ogImage(element: React.ReactElement) {
  return new ImageResponse(element, { ...OG_SIZE, fonts: [...FONTS], headers: { "Cache-Control": CACHE } });
}

// Nothing to show: a plain 404 that isn't cached for long, so a page made
// public again gets its preview back soon.
export function ogNotFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } });
}

// The photo as a data URL, so a slow or failed fetch drops the photo instead
// of the whole image. Photos are JPEGs re-encoded on the phone (no EXIF).
export async function photoData(url: string | null | undefined, timeoutMs = 4000) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d={STAR_PATH} fill={fill} />
    </svg>
  );
}

// Five stars, half steps drawn as a clipped yellow star over a grey one.
export function Stars({ value, size = 40, gap = 6, empty = "#48484A" }: { value: number; size?: number; gap?: number; empty?: string }) {
  return (
    <div style={{ display: "flex", gap }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <div key={i} style={{ display: "flex", position: "relative", width: size, height: size }}>
            <Star size={size} fill={empty} />
            {fill > 0 && (
              <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: size * fill, height: size, overflow: "hidden" }}>
                <Star size={size} fill={STAR} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The footer every preview shares: wordmark on the left, @handle on the right.
export function Footer({ handle }: { handle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, color: "#FFFFFF" }}>stubbed</div>
      <div style={{ fontSize: 30, color: SECONDARY }}>{`@${handle}`}</div>
    </div>
  );
}

// Long titles step down so they fit in about two lines.
export function titleSize(title: string, sizes: [number, number, number] = [84, 68, 54]) {
  return title.length <= 16 ? sizes[0] : title.length <= 30 ? sizes[1] : sizes[2];
}

// The dark ground with the coral glow from the no-photo share card.
export function Ground({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: INK, color: "#FFFFFF" }}>
      <div
        style={{
          position: "absolute",
          right: -220,
          top: -260,
          width: 720,
          height: 720,
          borderRadius: 9999,
          background: "radial-gradient(circle, rgba(255, 107, 74, 0.35) 0%, rgba(255, 107, 74, 0) 45%)",
        }}
      />
      {children}
    </div>
  );
}
