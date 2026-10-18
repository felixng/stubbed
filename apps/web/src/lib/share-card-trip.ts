// Trip recap share cards (#16), drawn on the device with Canvas 2D like the
// entry cards in share-card.ts. Designs: the "Share cards" canvas,
// https://claude.ai/artifact/JBrH9jzd4ke4YtpRLQWhPC, "Trip wrap" rows: list,
// photo grid, photo collage and the square trip wrap. All four are drawn
// square (1080 × 1080) with the square wrap's header and footer, so they
// match each other and the entry cards. Coordinates are in the designs'
// 540px units, scaled up to 1080.
import {
  CORAL,
  type Ctx,
  DISPLAY,
  drawStars,
  fit,
  SECONDARY,
  setFont,
  TEXT,
  wrap,
} from "@/lib/share-card";

export type TripCardShow = {
  title: string;
  venue: string | null;
  day: string; // "Sun 4 Oct"
  rating: number | null;
};

export type TripCardData = {
  name: string;
  dates: string; // "4–8 Oct 2026"
  place: string | null; // "New York", "3 cities", or null with no venues
  cities: number;
  handle: string | null;
  shows: TripCardShow[]; // logged shows, in date order
  venues: number;
  nights: number; // distinct dates with a logged show
  average: number | null;
};

export type TripCardDesign = { id: string; name: string };

export const TRIP_CARD_DESIGNS: TripCardDesign[] = [
  { id: "trip-list", name: "List" },
  { id: "trip-grid", name: "Photo grid" },
  { id: "trip-collage", name: "Collage" },
  { id: "trip-square", name: "Photos" },
];

// Every trip card is square, like the entry cards, so the carousel keeps
// one size as you swipe.
const W = 540;
const SCALE = 1080 / W;
const PAD = 28;
const INNER = W - PAD * 2;
const RADIUS = 20;
// The footer (wordmark and handle) is centred on this line on every card;
// content sits between the header and FOOTER_TOP - GAP.
const FOOTER_MID = W - PAD - 9;
const FOOTER_TOP = FOOTER_MID - 9;
const GAP = 16;

const DARK = {
  ground: "#000000",
  surface: "#1C1C1E",
  fill: "#2C2C2E",
  label: "#FFFFFF",
  secondary: SECONDARY,
  separator: "#38383A",
  outline: "#7C7C82",
  accent: CORAL,
};
const LIGHT = {
  ground: "#FFF9F6",
  surface: "#FFFFFF",
  fill: "#FFEBE3",
  label: "#1F1210",
  secondary: "#5E4039",
  separator: "#F9E0D6",
  outline: "#98695B",
  accent: "#B33A19", // tint-text: coral as text on light
};
type Palette = typeof DARK;

// `photos[i]` belongs to `data.shows[i]`; null where a show has none.
// `square`: square corners, for Instagram Stories, which turns transparent
// corners black.
export async function renderTripCard(
  design: TripCardDesign["id"],
  data: TripCardData,
  photos: (HTMLImageElement | null)[],
  { square = false } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = W * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn’t available");
  ctx.scale(SCALE, SCALE);
  const shows = data.shows.map((s, i) => ({ ...s, photo: photos[i] ?? null }));
  const p = design === "trip-collage" || design === "trip-square" ? LIGHT : DARK;

  const radius = square ? 0 : RADIUS;
  roundRect(ctx, 0, 0, W, W, radius);
  ctx.fillStyle = p.ground;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (design === "trip-grid") drawGrid(ctx, p, data, shows);
  else if (design === "trip-collage") drawCollage(ctx, p, data, shows);
  else if (design === "trip-square") drawSquare(ctx, p, data, shows);
  else drawList(ctx, p, data, shows);
  drawFooter(ctx, p, data.handle);
  ctx.restore();
  strokeRound(ctx, 0, 0, W, W, radius, p.separator);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t make the image"))), "image/png"),
  );
}

type Show = TripCardShow & { photo: HTMLImageElement | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Trip name, then "New York · 4–8 Oct 2026 · 4 shows" with the place in the
// accent colour. Returns the header's bottom edge.
//
// With `stats`, the counts stand out on the right of the header, large in the
// accent colour with a small label under each, and the subtitle drops its
// "· N shows" since the stats already say it. The header keeps its height.
type HeaderStat = { value: number; label: string };

function drawHeader(ctx: Ctx, p: Palette, d: TripCardData, count: number, top = PAD, stats?: HeaderStat[]) {
  ctx.textBaseline = "middle";
  const subY = top + 34 + 2 + 9.5;

  // Stats, right aligned, each column centred on its number and label.
  let textW = INNER;
  if (stats?.length) {
    const colGap = 20;
    let right = PAD + INNER;
    ctx.textAlign = "center";
    for (let i = stats.length - 1; i >= 0; i--) {
      const s = stats[i];
      const value = String(s.value);
      setFont(ctx, 800, 34, DISPLAY, -1);
      const vw = ctx.measureText(value).width;
      setFont(ctx, 400, 12, TEXT, 0.06);
      const w = Math.max(vw, ctx.measureText(s.label).width);
      const cx = right - w / 2;
      setFont(ctx, 800, 34, DISPLAY, -1);
      ctx.fillStyle = p.accent;
      ctx.fillText(value, cx, top + 17);
      setFont(ctx, 400, 12, TEXT, 0.06);
      ctx.fillStyle = p.secondary;
      ctx.fillText(s.label, cx, subY);
      right -= w + colGap;
    }
    ctx.textAlign = "left";
    textW = right + colGap - PAD - 16;
  }

  setFont(ctx, 700, 30, DISPLAY, 0.36);
  ctx.fillStyle = p.label;
  ctx.fillText(fit(ctx, d.name, textW), PAD, top + 17);
  let x = PAD;
  if (d.place) {
    setFont(ctx, 600, 14, TEXT, -0.17);
    ctx.fillStyle = p.accent;
    const place = fit(ctx, d.place, textW / 2);
    ctx.fillText(place, x, subY);
    x += ctx.measureText(place).width + 4;
  }
  setFont(ctx, 400, 14, TEXT, -0.17);
  ctx.fillStyle = p.secondary;
  const rest = `${d.place ? "· " : ""}${d.dates}${stats ? "" : ` · ${plural(count, "show")}`}`;
  ctx.fillText(fit(ctx, rest, PAD + textW - x), x, subY);
  return top + 34 + 2 + 19;
}

// "Trip wrap · list", squared: the trip's shows as rows. Up to 4 shows get
// photo rows; 5–6 compact rows; past 6, five rows and "+ N more shows".
function drawList(ctx: Ctx, p: Palette, d: TripCardData, shows: Show[]) {
  const top = drawHeader(ctx, p, d, shows.length) + GAP;
  const bottom = FOOTER_TOP - GAP;

  const compact = shows.length > 4;
  const rows = shows.length > 6 ? shows.slice(0, 5) : shows;
  const more = shows.length - rows.length;
  const rowH = compact ? 56 : 72;
  const moreH = more ? 40 : 0;
  const panelH = rows.length * rowH + (rows.length - 1) + (more ? 1 + moreH : 0);
  const y0 = top + (bottom - top - panelH) / 2;

  ctx.save();
  roundRect(ctx, PAD, y0, INNER, panelH, 12);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.clip();
  const starsW = 5 * 13 + 4 * 2;
  rows.forEach((s, i) => {
    const rowTop = y0 + i * (rowH + 1);
    if (i > 0) {
      ctx.fillStyle = p.separator;
      ctx.fillRect(PAD + (compact ? 14 : 70), rowTop - 1, INNER, 1);
    }
    const textX = compact ? PAD + 14 : PAD + 14 + 42 + 14;
    const rightEdge = PAD + INNER - 14;
    const textW = rightEdge - textX - (s.rating != null ? starsW + 12 : 0);
    if (!compact) drawThumb(ctx, p, s, PAD + 14, rowTop + 8, 42, 56);
    const blockH = 20 + 2 + 18;
    const ty = rowTop + (rowH - blockH) / 2;
    ctx.textBaseline = "middle";
    setFont(ctx, 600, 16, TEXT, -0.32);
    ctx.fillStyle = p.label;
    ctx.fillText(fit(ctx, s.title, textW), textX, ty + 10);
    setFont(ctx, 400, 13, TEXT, -0.08);
    ctx.fillStyle = p.secondary;
    ctx.fillText(fit(ctx, [s.venue, s.day].filter(Boolean).join(" · "), textW), textX, ty + 22 + 9);
    if (s.rating != null) drawStars(ctx, s.rating, rightEdge - starsW, rowTop + (rowH - 13) / 2, 13, 2, p.outline);
  });
  if (more) {
    const moreTop = y0 + rows.length * (rowH + 1);
    ctx.fillStyle = p.separator;
    ctx.fillRect(PAD, moreTop - 1, INNER, 1);
    setFont(ctx, 400, 14, TEXT, -0.17);
    ctx.fillStyle = p.secondary;
    ctx.fillText(`+ ${plural(more, "more show")}`, PAD + 14, moreTop + moreH / 2);
  }
  ctx.restore();
  strokeRound(ctx, PAD, y0, INNER, panelH, 12, p.separator);
}

// "Trip wrap · photo grid", squared: a big coral count with the trip's
// stats beside it, then the photos.
function drawGrid(ctx: Ctx, p: Palette, d: TripCardData, shows: Show[]) {
  // Stats column, right aligned: place, theatres, average rating.
  const stats: { value: string | number; label: string }[] = [];
  if (d.place) stats.push({ value: d.place, label: d.cities > 1 ? "visited" : "city" });
  if (d.venues) stats.push({ value: plural(d.venues, "theatre"), label: "visited" });
  if (d.average != null) stats.push({ value: d.average, label: "average rating" });
  let sy = PAD;
  let statsW = 0;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const s of stats) {
    if (typeof s.value === "number") {
      drawStars(ctx, s.value, PAD + INNER - 73, sy + 3.5, 13, 2, p.outline);
      statsW = Math.max(statsW, 73);
    } else {
      setFont(ctx, 600, 15, TEXT, -0.24);
      ctx.fillStyle = p.label;
      const v = fit(ctx, s.value, 160);
      statsW = Math.max(statsW, ctx.measureText(v).width);
      ctx.fillText(v, PAD + INNER, sy + 10);
    }
    setFont(ctx, 400, 11, TEXT, 0.06);
    ctx.fillStyle = p.secondary;
    ctx.fillText(s.label, PAD + INNER, sy + 20 + 7);
    sy += 20 + 14 + 4;
  }
  ctx.textAlign = "left";

  // Count, top left.
  const leftW = INNER - statsW - 16;
  setFont(ctx, 400, 13, TEXT, -0.08);
  ctx.fillStyle = p.secondary;
  ctx.fillText(fit(ctx, `${d.name} · ${d.dates}`, leftW), PAD, PAD + 9);
  setFont(ctx, 800, 72, DISPLAY, -2.16);
  ctx.fillStyle = CORAL;
  ctx.textBaseline = "alphabetic";
  const count = String(shows.length);
  const baseline = PAD + 18 + 62;
  ctx.fillText(count, PAD, baseline);
  const countW = ctx.measureText(count).width;
  setFont(ctx, 400, 16, TEXT, -0.32);
  ctx.fillStyle = p.secondary;
  ctx.fillText(shows.length === 1 ? "show" : "shows", PAD + countW + 8, baseline);

  const top = Math.max(PAD + 18 + 72, sy - 4) + GAP;
  drawPhotoGrid(ctx, p, shows, PAD, top, INNER, FOOTER_TOP - GAP - top, false);
}

// Polaroid layouts from the canvas's "Trip collage" row, one per number of
// shows (2 to 8): each frame's top left within the photo area (484 wide,
// below the header), size and tilt. One show gets a single large polaroid.
type Polaroid = { left: number; top: number; rotate: number };
const LARGE = { w: 200, h: 267, pad: 4 };
const MEDIUM = { w: 168, h: 224, pad: 4 };
const SMALL_4 = { w: 152, h: 202, pad: 4 };
// 7 and 8 shows: two brick rows of 144 × 192 polaroids (was 110 × 146 in
// three rows), overlapping sideways a little so four fit across the 484.
const SMALL = { w: 144, h: 192, pad: 4 };
const COLLAGES: Record<number, { size: typeof LARGE; at: Polaroid[] }> = {
  1: { size: { w: 240, h: 320, pad: 5 }, at: [{ left: 122, top: 25, rotate: -3 }] },
  2: {
    size: LARGE,
    at: [
      { left: 30, top: 0, rotate: -4 },
      { left: 254, top: 100, rotate: 3 },
    ],
  },
  3: {
    size: MEDIUM,
    at: [
      { left: 8, top: 10, rotate: -4 },
      { left: 304, top: 0, rotate: 3 },
      { left: 150, top: 140, rotate: -2 },
    ],
  },
  4: {
    size: SMALL_4,
    at: [
      { left: 60, top: 0, rotate: -4 },
      { left: 272, top: 8, rotate: 3 },
      { left: 60, top: 170, rotate: -2 },
      { left: 272, top: 168, rotate: 4 },
    ],
  },
  5: {
    size: SMALL_4,
    at: [
      { left: 48, top: 0, rotate: -4 },
      { left: 260, top: 8, rotate: 3 },
      { left: 7, top: 170, rotate: -2 },
      { left: 166, top: 168, rotate: 4 },
      { left: 325, top: 170, rotate: -3 },
    ],
  },
  6: {
    size: SMALL_4,
    at: [
      { left: 7, top: 0, rotate: -4 },
      { left: 166, top: 8, rotate: 3 },
      { left: 325, top: 0, rotate: -2 },
      { left: 7, top: 170, rotate: 4 },
      { left: 166, top: 168, rotate: -3 },
      { left: 325, top: 170, rotate: 2 },
    ],
  },
  7: {
    size: SMALL,
    at: [
      { left: 0, top: 0, rotate: -4 },
      { left: 113, top: 8, rotate: 3 },
      { left: 227, top: 0, rotate: -2 },
      { left: 340, top: 6, rotate: 4 },
      { left: 57, top: 178, rotate: -3 },
      { left: 170, top: 184, rotate: 2 },
      { left: 283, top: 178, rotate: -5 },
    ],
  },
  8: {
    size: SMALL,
    at: [
      { left: 0, top: 0, rotate: -4 },
      { left: 113, top: 8, rotate: 3 },
      { left: 227, top: 0, rotate: -2 },
      { left: 340, top: 6, rotate: 4 },
      { left: 0, top: 180, rotate: 2 },
      { left: 113, top: 176, rotate: -5 },
      { left: 227, top: 184, rotate: 3 },
      { left: 340, top: 178, rotate: -3 },
    ],
  },
};

// "Trip collage": a layout per number of shows, in date order. Past 8
// shows, the 8-show layout prefers shows with photos and the last
// polaroid reads "+N".
function drawCollage(ctx: Ctx, p: Palette, d: TripCardData, shows: Show[]) {
  const top =
    drawHeader(ctx, p, d, shows.length, PAD, [
      { value: shows.length, label: shows.length === 1 ? "show" : "shows" },
      { value: d.venues, label: d.venues === 1 ? "venue" : "venues" },
      { value: d.nights, label: d.nights === 1 ? "night" : "nights" },
    ]) + GAP;
  const bottom = FOOTER_TOP - 12;
  let picks = shows;
  if (shows.length > 8) {
    const keep = new Set([...shows].sort((a, b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo))).slice(0, 8));
    picks = shows.filter((s) => keep.has(s));
  }
  const more = shows.length - picks.length;
  const { size, at } = COLLAGES[picks.length];
  // Centre the layout in the space between header and footer.
  const layoutH = Math.max(...at.map((a) => a.top + size.h));
  const y0 = top + Math.max(0, (bottom - top - layoutH) / 2);
  picks.forEach((s, i) => {
    const { left, top: y, rotate } = at[i];
    ctx.save();
    ctx.translate(PAD + left + size.w / 2, y0 + y + size.h / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-size.w / 2, -size.h / 2);
    softShadow(ctx);
    roundRect(ctx, 0, 0, size.w, size.h, 4);
    ctx.fillStyle = p.surface;
    ctx.fill();
    noShadow(ctx);
    strokeRound(ctx, 0, 0, size.w, size.h, 4, p.separator);
    const inset = size.pad;
    const last = i === picks.length - 1;
    drawTile(ctx, p, s, inset, inset, size.w - inset * 2, size.h - inset * 2, 2, last ? more : 0, true);
    ctx.restore();
  });
}

// "Square · trip wrap": the trip's photos in a grid.
function drawSquare(ctx: Ctx, p: Palette, d: TripCardData, shows: Show[]) {
  const top = drawHeader(ctx, p, d, shows.length) + GAP;
  drawPhotoGrid(ctx, p, shows, PAD, top, INNER, FOOTER_TOP - GAP - top, true);
}

// --- shared pieces ---------------------------------------------------------

// Rows of tiles: 1, 2, 1+2, 2+2, 2+3, 3+3; past 6 the last tile reads "+N".
const ROWS: Record<number, number[]> = { 1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3] };

function drawPhotoGrid(ctx: Ctx, p: Palette, all: Show[], x: number, y: number, w: number, h: number, shadow: boolean) {
  const gap = 8;
  const shows = all.slice(0, 6);
  const more = all.length - shows.length;
  const rows = ROWS[shows.length] ?? [];
  const rowH = (h - gap * (rows.length - 1)) / rows.length;
  let i = 0;
  rows.forEach((count, r) => {
    const tileW = (w - gap * (count - 1)) / count;
    for (let c = 0; c < count; c++, i++) {
      const tx = x + c * (tileW + gap);
      const ty = y + r * (rowH + gap);
      if (shadow) {
        ctx.save();
        softShadow(ctx);
        roundRect(ctx, tx, ty, tileW, rowH, 8);
        ctx.fillStyle = p.surface;
        ctx.fill();
        ctx.restore();
      }
      drawTile(ctx, p, shows[i], tx, ty, tileW, rowH, 8, i === shows.length - 1 ? more : 0);
      strokeRound(ctx, tx, ty, tileW, rowH, 8, p.separator);
    }
  });
}

// A show's photo, or its title set large on `fill` when it has none: at the
// bottom left, or at the top (`titleTop`) where the next polaroid in a
// collage overlaps the bottom.
function drawTile(
  ctx: Ctx,
  p: Palette,
  s: Show,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  more: number,
  titleTop = false,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  if (s.photo) cover(ctx, s.photo, x, y, w, h);
  else {
    ctx.fillStyle = p.fill;
    ctx.fillRect(x, y, w, h);
    // Smaller tiles (the 7- and 8-show collages) get tighter type.
    const inset = w < 140 ? 8 : 16;
    const size = Math.max(w < 140 ? 13 : 17, Math.min(28, w / 8));
    setFont(ctx, 700, size, DISPLAY, size * -0.01);
    const lh = size * 1.1;
    const tw = w - inset * 2;
    let lines = wrap(ctx, s.title, tw);
    if (lines.length > 3) lines = [lines[0], lines[1], fit(ctx, lines.slice(2).join(" "), tw)];
    ctx.fillStyle = p.label;
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      const lineY = titleTop ? y + inset + lh * i + lh / 2 : y + h - inset - lh * (lines.length - i) + lh / 2;
      ctx.fillText(fit(ctx, line, tw), x + inset, lineY);
    });
  }
  if (more) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(x, y, w, h);
    setFont(ctx, 800, 34, DISPLAY, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${more}`, x + w / 2, y + h / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

// The list's 56×74 thumbnail; the show's initials in `outline` without a
// photo, like Poster.
function drawThumb(ctx: Ctx, p: Palette, s: Show, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  if (s.photo) cover(ctx, s.photo, x, y, w, h);
  else {
    ctx.fillStyle = p.fill;
    ctx.fillRect(x, y, w, h);
    const words = s.title.split(/\s+/).filter(Boolean);
    setFont(ctx, 700, 20, DISPLAY, 0);
    ctx.fillStyle = p.outline;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((words[0]?.[0] ?? "") + (words[1]?.[0] ?? ""), x + w / 2, y + h / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

// Wordmark left, handle right, at the same place on every card.
function drawFooter(ctx: Ctx, p: Palette, handle: string | null) {
  ctx.textBaseline = "middle";
  setFont(ctx, 800, 18, DISPLAY, -0.81);
  ctx.fillStyle = p.label;
  ctx.fillText("stubbed", PAD, FOOTER_MID);
  if (handle) {
    setFont(ctx, 400, 13, TEXT, -0.08);
    ctx.fillStyle = p.secondary;
    ctx.textAlign = "right";
    ctx.fillText(`@${handle}`, W - PAD, FOOTER_MID);
    ctx.textAlign = "left";
  }
}

// object-fit: cover, centred.
function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function strokeRound(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Footlight's warm card shadow. Offsets and blur are in canvas pixels.
function softShadow(ctx: Ctx) {
  ctx.shadowColor = "rgba(120, 50, 30, 0.28)";
  ctx.shadowBlur = 22 * SCALE;
  ctx.shadowOffsetY = 10 * SCALE;
}

function noShadow(ctx: Ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
