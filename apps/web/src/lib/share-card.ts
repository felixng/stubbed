// Share cards for one entry, drawn on the device with Canvas 2D. Drawing in
// the browser uses the system font (SF Pro on iPhone, as in Footlight), keeps
// the photo private (it never goes to a server) and needs no image library.
// The iOS app draws the same cards in SwiftUI (Screens/Share/EntryCard.swift);
// change both together. Coordinates are in 540px design units, scaled up to
// CARD_SIZE.

export type CardData = {
  title: string;
  venue: string | null; // venue name, for the "Nth visit" stat; null if none
  where: string; // "Belasco Theatre, New York", or "" with no venue
  date: string; // "3 Oct 2026"
  year: number;
  rating: number | null;
  showOfYear: number; // this entry's place in its year
  venueVisit: number; // Nth visit to this venue
  timesSeen: number; // Nth time seeing this show
  handle: string | null;
};

export type CardDesign = { id: string; name: string };

// Two designs (owner, 2026-10-29): stats across the top, or the name alone.
// Both keep the middle of the photo clear, Hevy-style, and either can hide
// the rating (`showRating`), for a low score or a card that tags the cast.
export const CARD_DESIGNS: CardDesign[] = [
  { id: "stats", name: "Stats" },
  { id: "name", name: "Name only" },
];

// Off by default for 2 stars or below, and when there's no rating.
export const showsRatingByDefault = (rating: number | null) => rating != null && rating > 2;

export const CARD_SIZE = 1080;
const U = 540; // design units
const SCALE = CARD_SIZE / U;

export const DISPLAY = "-apple-system, 'SF Pro Display', BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif";
export const TEXT = "-apple-system, 'SF Pro Text', BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif";
export const CORAL = "#FF5A5A";
// The icon's amber, which reads on the cards' dark ground.
export const STAR = "#FFA040";
export const SECONDARY = "#AEAEB2";
// Stubbed's Instagram handle: the share screen asks you to tag it, and trip
// cards show it under the wordmark. Entry cards leave it off (owner,
// 2026-10-29).
export const CARD_DOMAIN = "@getstubbed.app";
const SOFT_WHITE = "rgba(255, 255, 255, 0.9)";
const SIDE = 28;
// The ticket mark beside the wordmark (public/brand/stubbed-mark.svg).
const MARK_SRC = "/brand/stubbed-mark.svg";
const MARK_RATIO = 770 / 627;

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

export type Ctx = CanvasRenderingContext2D;

export function ordinal(n: number) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

let markImage: Promise<HTMLImageElement | null> | null = null;
function loadMark() {
  markImage ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = MARK_SRC;
  });
  return markImage;
}

export async function renderCard(
  design: CardDesign["id"],
  data: CardData,
  photo: HTMLImageElement | null,
  { transparent = false, square = false, showRating = true } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn’t available");
  ctx.scale(SCALE, SCALE);
  const mark = await loadMark();
  const d = showRating ? data : { ...data, rating: null };
  if (!transparent) drawBackground(ctx, photo, !square, design === "stats");
  textShadow(ctx);
  if (design === "stats") drawStats(ctx, d);
  const footerTop = drawFooter(ctx, d, mark);
  if (design === "stats") {
    drawTitle(ctx, d.title, SIDE, footerTop - 10, U - SIDE * 2, 26, 30, 1);
  } else {
    let bottom = footerTop - 12;
    if (d.rating != null) {
      drawStars(ctx, d.rating, SIDE, bottom - 24, 24, 3, "rgba(255, 255, 255, 0.75)");
      bottom -= 24 + 12;
    }
    drawTitle(ctx, d.title, SIDE, bottom, U - SIDE * 2, 36, 40, 2);
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t make the image"))), "image/png"),
  );
}

// The photo, with shade only at the edges that carry text: a band at the
// top behind the stats, and the bottom quarter behind the name and logo.
function drawBackground(ctx: Ctx, photo: HTMLImageElement | null, round: boolean, top: boolean) {
  clipRounded(ctx, round ? 32 : 0);
  drawPhoto(ctx, photo, 0.4);
  if (top) {
    verticalGradient(ctx, 0, 150, [
      [0, "rgba(0, 0, 0, 0.55)"],
      [1, "rgba(0, 0, 0, 0)"],
    ]);
  }
  verticalGradient(ctx, 360, U, [
    [0, "rgba(0, 0, 0, 0)"],
    [1, "rgba(0, 0, 0, 0.75)"],
  ]);
}

// Up to three columns: show of the year, the venue visit (or times seen
// with no venue), then the rating, or times seen when it's hidden.
function drawStats(ctx: Ctx, d: CardData) {
  const stats: { label: string; value: string | number; color?: string }[] = [
    { label: `Show of ${d.year}`, value: ordinal(d.showOfYear), color: CORAL },
    d.venue ? { label: d.venue, value: `${ordinal(d.venueVisit)} visit` } : { label: "Seen", value: `${ordinal(d.timesSeen)} time` },
  ];
  if (d.rating != null) stats.push({ label: "Rating", value: d.rating });
  else if (d.venue) stats.push({ label: "Seen", value: `${ordinal(d.timesSeen)} time` });
  const side = 20;
  const colWidth = (U - side * 2) / stats.length;
  stats.forEach((s, i) => {
    const cx = side + colWidth * i + colWidth / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, 500, 20, TEXT, -0.2);
    ctx.fillStyle = SOFT_WHITE;
    ctx.fillText(fit(ctx, s.label, colWidth - 12), cx, 30 + 13);
    if (typeof s.value === "number") {
      const w = 5 * 24 + 4 * 3;
      drawStars(ctx, s.value, cx - w / 2, 30 + 26 + 8, 24, 3, "rgba(255, 255, 255, 0.75)");
    } else {
      setFont(ctx, 700, 30, DISPLAY, 0.2);
      ctx.fillStyle = s.color ?? "#FFFFFF";
      ctx.fillText(fit(ctx, s.value, colWidth - 12), cx, 30 + 26 + 4 + 18);
    }
  });
  ctx.textAlign = "left";
}

// The logo (ticket mark and wordmark), and the @handle on the right.
// Returns the footer's top edge.
function drawFooter(ctx: Ctx, d: CardData, mark: HTMLImageElement | null) {
  const logoMid = U - 26 - 22;
  const size = 36;
  let x = SIDE;
  if (mark) {
    const h = size * 1.05;
    ctx.drawImage(mark, x, logoMid - h / 2, h * MARK_RATIO, h);
    x += h * MARK_RATIO + size * 0.28;
  }
  ctx.textBaseline = "middle";
  setFont(ctx, 800, size, DISPLAY, -0.045 * size);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("stubbed", x, logoMid);
  if (d.handle) {
    setFont(ctx, 500, 24, TEXT, -0.3);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "right";
    ctx.fillText(fit(ctx, `@${d.handle}`, 200), U - SIDE, logoMid);
    ctx.textAlign = "left";
  }
  return logoMid - 22;
}

// --- helpers ---------------------------------------------------------------

// Shadow offsets and blur are in canvas pixels, not the scaled units.
function textShadow(ctx: Ctx) {
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 8 * SCALE;
  ctx.shadowOffsetY = 1 * SCALE;
}

export function setFont(ctx: Ctx, weight: number, size: number, family: string, tracking: number) {
  ctx.font = `${weight} ${size}px ${family}`;
  // Safari 17+, Chrome 99+; older browsers just skip the tracking.
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
}

function clipRounded(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(U, 0, U, U, r);
  ctx.arcTo(U, U, 0, U, r);
  ctx.arcTo(0, U, 0, 0, r);
  ctx.arcTo(0, 0, U, 0, r);
  ctx.closePath();
  ctx.clip();
}

// object-fit: cover, with object-position x centred and y at `focusY`.
// No photo: a dark ground with a faint coral glow, so the text still reads.
function drawPhoto(ctx: Ctx, photo: HTMLImageElement | null, focusY: number) {
  ctx.fillStyle = "#1C1C1E";
  ctx.fillRect(0, 0, U, U);
  if (!photo) {
    const glow = ctx.createRadialGradient(U * 0.7, U * 0.25, 0, U * 0.7, U * 0.25, U * 0.8);
    glow.addColorStop(0, "rgba(255, 90, 90, 0.35)");
    glow.addColorStop(1, "rgba(255, 90, 90, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, U, U);
    return;
  }
  const iw = photo.naturalWidth;
  const ih = photo.naturalHeight;
  const scale = Math.max(U / iw, U / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(photo, (U - w) / 2, (U - h) * focusY, w, h);
}

function verticalGradient(ctx: Ctx, top: number, bottom: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, U, bottom - top);
}

// An average (4.83) as the nearest half star (5), since ratings are given
// and shown in half steps.
export const halfStep = (n: number) => Math.round(n * 2) / 2;

// Half-star rating: outline stars, then filled ones clipped to the value.
export function drawStars(ctx: Ctx, value: number, x: number, y: number, size: number, gap: number, outline: string) {
  const path = new Path2D(STAR_PATH);
  const k = size / 24;
  for (let i = 0; i < 5; i++) {
    const fill = Math.min(Math.max(value - i, 0), 1);
    ctx.save();
    ctx.translate(x + i * (size + gap), y);
    ctx.scale(k, k);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = outline;
    ctx.stroke(path);
    if (fill > 0) {
      ctx.beginPath();
      ctx.rect(-2, -2, 24 * fill + 2, 28);
      ctx.clip();
      ctx.fillStyle = STAR;
      ctx.strokeStyle = STAR;
      ctx.fill(path);
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

// Title above `bottom`: up to `maxLines`, shrinking for very long titles,
// then an ellipsis as a last resort.
function drawTitle(
  ctx: Ctx,
  title: string,
  x: number,
  bottom: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  maxLines: 1 | 2,
) {
  let lines: string[] = [];
  let s = size;
  let lh = lineHeight;
  for (; s >= size * 0.7; s -= 2, lh = (lineHeight / size) * s) {
    setFont(ctx, 700, s, DISPLAY, s * 0.01);
    lines = wrap(ctx, title, maxWidth);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = maxLines === 1 ? [fit(ctx, title, maxWidth)] : [lines[0], fit(ctx, lines.slice(1).join(" "), maxWidth)];
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  lines.forEach((line, i) => {
    ctx.fillText(line, x, bottom - lh * (lines.length - i) + lh / 2);
  });
}

export function wrap(ctx: Ctx, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function fit(ctx: Ctx, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
