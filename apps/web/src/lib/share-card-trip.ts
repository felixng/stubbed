// Trip recap share cards (#16), drawn on the device with Canvas 2D like the
// entry cards in share-card.ts. Designs: the "Share cards" canvas,
// https://claude.ai/artifact/JBrH9jzd4ke4YtpRLQWhPC, "Trip wrap" rows: list,
// photo grid, photo collage and the square trip wrap. All four are drawn
// square (1080 × 1080) with the square wrap's header and footer, so they
// match each other and the entry cards. Coordinates are in the designs'
// 540px units, scaled up to 1080.
import {
  drawShareFooter,
  drawTopTitle,
  renderSquare,
  CORAL,
  type Ctx,
  DISPLAY,
  drawStars,
  fit,
  halfStep,
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
  nights: number; // the trip's length, end date minus start date (0 for one day)
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
const RADIUS = 32;
// Reserve the same 40pt icon/wordmark/handle footer as entry cards.
const FOOTER_TOP = 472;
const GAP = 24;

const DARK = {
  ground: "#1C1C1E",
  surface: "#2C2C2E",
  fill: "#38383A",
  label: "#FFFFFF",
  secondary: SECONDARY,
  separator: "#38383A",
  outline: "#7C7C82",
  accent: CORAL,
};
const LIGHT = {
  ground: "#FFFFFF",
  surface: "#FFFFFF",
  fill: "#E9E9EE",
  label: "#1C1C1E",
  secondary: "#6C6C70",
  separator: "#E0E0E5",
  outline: "#8E8E93",
  accent: "#C4234A", // tint-text: coral as text on light
};
type Palette = typeof DARK;

// The collage and photo designs are drawn on the light ground, the others
// on the dark one. The share sheet's placeholder uses the same ground.
export const isLightTripCard = (design: TripCardDesign["id"]) => design === "trip-collage" || design === "trip-square";

// `photos[i]` belongs to `data.shows[i]`; null where a show has none.
// `square`: square corners, for Instagram Stories, which turns transparent
// corners black.
export async function renderTripCard(
  design: TripCardDesign["id"],
  data: TripCardData,
  photos: (HTMLImageElement | null)[],
  { square = false } = {},
) {
  return renderSquare((ctx, mark) => {
    const shows = data.shows.map((s, i) => ({ ...s, photo: photos[i] ?? null }));
    const p = isLightTripCard(design) ? LIGHT : DARK;
    roundRect(ctx, 0, 0, W, W, square ? 0 : RADIUS);
    ctx.fillStyle = p.ground; ctx.fill();
    ctx.save(); ctx.clip();
    if (design === "trip-grid") drawGrid(ctx, p, data, shows);
    else if (design === "trip-collage") drawCollage(ctx, p, data, shows);
    else if (design === "trip-square") drawSquare(ctx, p, data, shows);
    else drawList(ctx, p, data, shows);
    drawShareFooter(ctx, data.handle, p.label, mark);
    ctx.restore();
  });
}

type Show = TripCardShow & { photo: HTMLImageElement | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Same 38pt title, 18pt metadata and 28pt margins as single-show cards.
function drawHeader(ctx: Ctx, p: Palette, d: TripCardData, count: number) {
  const titleHeight = drawTopTitle(ctx, d.name, PAD, p.label);
  setFont(ctx, 500, 18, TEXT, 0);
  const subtitle = [d.place, d.dates, plural(count, "show")].filter(Boolean).join(" · ");
  let lines = wrap(ctx, subtitle, INNER);
  if (lines.length > 2) lines = [lines[0], fit(ctx, lines.slice(1).join(" "), INNER)];
  ctx.fillStyle = p.secondary; ctx.textBaseline = "top"; ctx.textAlign = "left";
  lines.forEach((line, i) => ctx.fillText(fit(ctx, line, INNER), PAD, PAD + titleHeight + 8 + i * 22));
  return PAD + titleHeight + 8 + lines.length * 22;
}

// "Trip wrap · list", squared: the trip's shows as rows. Up to 4 shows get
// photo rows when they fit, otherwise larger compact rows and an overflow count.
function drawList(ctx: Ctx, p: Palette, d: TripCardData, shows: Show[]) {
  const top = drawHeader(ctx, p, d, shows.length) + GAP;
  const bottom = FOOTER_TOP - GAP;

  if (!shows.length) {
    setFont(ctx, 500, 22, TEXT, 0); ctx.fillStyle = p.label;
    ctx.fillText("No shows logged yet", PAD, top + 60);
    return;
  }
  const available = bottom - top;
  const compact = shows.length > 4 || shows.length * 80 + shows.length - 1 > available;
  const rowH = compact ? 60 : 80;
  let visible = Math.min(shows.length, shows.length > 6 ? 5 : 6, Math.floor((available + 1) / (rowH + 1)));
  if (visible < shows.length) visible = Math.min(visible, Math.floor((available - 40) / (rowH + 1)));
  const rows = shows.slice(0, Math.max(1, visible));
  const more = shows.length - rows.length;
  const moreH = more ? 40 : 0;
  const panelH = rows.length * rowH + Math.max(0, rows.length - 1) + (more ? 1 + moreH : 0);
  const y0 = top + (available - panelH) / 2;

  ctx.save();
  roundRect(ctx, PAD, y0, INNER, panelH, 12);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.clip();
  const starsW = 5 * 16 + 4 * 2;
  rows.forEach((s, i) => {
    const rowTop = y0 + i * (rowH + 1);
    if (i > 0) {
      ctx.fillStyle = p.separator;
      ctx.fillRect(PAD + (compact ? 16 : 80), rowTop - 1, INNER, 1);
    }
    const textX = compact ? PAD + 16 : PAD + 16 + 48 + 16;
    const rightEdge = PAD + INNER - 16;
    const textW = rightEdge - textX - (s.rating != null ? starsW + 12 : 0);
    if (!compact) drawThumb(ctx, p, s, PAD + 16, rowTop + 8, 48, 64);
    const blockH = 27 + 3 + 20;
    const ty = rowTop + (rowH - blockH) / 2;
    ctx.textBaseline = "middle";
    setFont(ctx, 600, 22, DISPLAY, -0.3);
    ctx.fillStyle = p.label;
    ctx.fillText(fit(ctx, s.title, textW), textX, ty + 13.5);
    setFont(ctx, 500, 16, TEXT, 0);
    ctx.fillStyle = p.secondary;
    ctx.fillText(fit(ctx, [s.venue, s.day].filter(Boolean).join(" · "), textW), textX, ty + 30 + 10);
    if (s.rating != null) drawStars(ctx, s.rating, rightEdge - starsW, rowTop + (rowH - 16) / 2, 16, 2, p.outline);
  });
  if (more) {
    const moreTop = y0 + rows.length * (rowH + 1);
    ctx.fillStyle = p.separator;
    ctx.fillRect(PAD, moreTop - 1, INNER, 1);
    setFont(ctx, 500, 18, TEXT, 0);
    ctx.fillStyle = p.secondary;
    ctx.fillText(`+ ${plural(more, "more show")}`, PAD + 16, moreTop + moreH / 2);
  }
  ctx.restore();
  strokeRound(ctx, PAD, y0, INNER, panelH, 12, p.separator);
}

// "Trip wrap · photo grid", squared: a big coral count with the trip's
// stats beside it, then the photos.
function drawGrid(ctx: Ctx, p: Palette, d: TripCardData, shows: Show[]) {
  const top = drawHeader(ctx, p, d, shows.length) + GAP;
  const columns = 1 + Number(d.venues > 0) + Number(d.average != null);
  const col = INNER / columns;
  ctx.fillStyle = p.label; ctx.textAlign = "left"; ctx.textBaseline = "top";
  setFont(ctx, 500, 18, TEXT, 0); ctx.fillText("Shows", PAD, top);
  setFont(ctx, 800, 64, DISPLAY, -1); ctx.fillStyle = p.accent;
  ctx.fillText(String(shows.length), PAD, top + 26, col - 16);
  let index = 1;
  if (d.venues > 0) {
    const x = PAD + col * index++;
    ctx.fillStyle = p.label; setFont(ctx, 500, 18, TEXT, 0); ctx.fillText("Theatres", x, top);
    setFont(ctx, 700, 42, DISPLAY, 0); ctx.fillText(String(d.venues), x, top + 26, col - 16);
  }
  if (d.average != null) {
    const x = PAD + col * index;
    ctx.fillStyle = p.label; setFont(ctx, 500, 18, TEXT, 0); ctx.fillText("Average", x, top);
    drawStars(ctx, halfStep(d.average), x, top + 40, 18, 2, p.outline);
  }
  const photosTop = top + 100 + GAP;
  drawPhotoGrid(ctx, p, shows, PAD, photosTop, INNER, FOOTER_TOP - GAP - photosTop, false);
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
  const top = drawHeader(ctx, p, d, shows.length) + GAP;
  const bottom = FOOTER_TOP - GAP;
  let picks = shows;
  if (shows.length > 8) {
    const keep = new Set([...shows].sort((a, b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo))).slice(0, 8));
    picks = shows.filter((s) => keep.has(s));
  }
  const more = shows.length - picks.length;
  if (!picks.length) return;
  const { size, at } = COLLAGES[picks.length];
  const corners = at.flatMap(spot => {
    const angle = spot.rotate * Math.PI / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const dx = sx * size.w / 2, dy = sy * size.h / 2;
      return [spot.left + size.w / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy,
        spot.top + size.h / 2 + Math.sin(angle) * dx + Math.cos(angle) * dy];
    });
  });
  const minX = Math.min(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1]));
  const width = Math.max(...corners.map(p => p[0])) - minX;
  const height = Math.max(...corners.map(p => p[1])) - minY;
  const scale = Math.min(1, INNER / width, (bottom - top) / height);
  ctx.save();
  ctx.translate(PAD + (INNER - width * scale) / 2 - minX * scale, top + (bottom - top - height * scale) / 2 - minY * scale);
  ctx.scale(scale, scale);
  picks.forEach((s, i) => {
    const { left, top: y, rotate } = at[i];
    ctx.save();
    ctx.translate(left + size.w / 2, y + size.h / 2);
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
  ctx.restore();
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
  const gap = 12;
  const shows = all.slice(0, 6);
  const more = all.length - shows.length;
  const rows = ROWS[shows.length] ?? [];
  const rowH = (h - gap * Math.max(0, rows.length - 1)) / Math.max(1, rows.length);
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
    let size = Math.max(w < 140 ? 16 : 20, Math.min(30, w / 7));
    const tw = w - inset * 2;
    let lines: string[] = [];
    for (; size >= 14; size -= 1) {
      setFont(ctx, 700, size, DISPLAY, size * -0.01);
      lines = wrap(ctx, s.title, tw);
      if (lines.length <= 3 && lines.every(line => ctx.measureText(line).width <= tw) && lines.length * size * 1.1 <= h - inset * 2) break;
    }
    size = Math.max(14, size);
    setFont(ctx, 700, size, DISPLAY, size * -0.01);
    const lh = size * 1.1;
    const maxLines = Math.max(1, Math.min(3, Math.floor((h - inset * 2) / lh)));
    if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), fit(ctx, lines.slice(maxLines - 1).join(" "), tw)];
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

// The cards' soft neutral shadow. Offsets and blur are in canvas pixels.
function softShadow(ctx: Ctx) {
  ctx.shadowColor = "rgba(20, 20, 30, 0.28)";
  ctx.shadowBlur = 22 * SCALE;
  ctx.shadowOffsetY = 10 * SCALE;
}

function noShadow(ctx: Ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
