// Share cards for one entry, drawn on the device with Canvas 2D. Drawing in
// the browser uses the system font (SF Pro on iPhone, as in Footlight), keeps
// the photo private (it never goes to a server) and needs no image library.
// Designs: the "Share cards" canvas,
// https://claude.ai/artifact/JBrH9jzd4ke4YtpRLQWhPC (square 1:1 row).
// Coordinates are in the designs' 540px units, scaled up to SIZE.

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

export const CARD_DESIGNS: CardDesign[] = [
  { id: "square", name: "Photo" },
  { id: "hevy-venue", name: "Photo with stats" },
  { id: "hevy-seen", name: "Photo, times seen" },
];

export const CARD_SIZE = 1080;
const U = 540; // design units
const SCALE = CARD_SIZE / U;

export const DISPLAY = "-apple-system, 'SF Pro Display', BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif";
export const TEXT = "-apple-system, 'SF Pro Text', BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif";
export const CORAL = "#FF6B4A";
const STAR = "#FFD60A";
export const SECONDARY = "#AEAEB2";
// Shown small under the wordmark on every card, so a shared image leads back.
export const CARD_DOMAIN = "@getstubbed.app";
const SOFT_WHITE = "rgba(255, 255, 255, 0.85)";
// Same star as the designs (24px viewBox).
const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

export type Ctx = CanvasRenderingContext2D;

export function ordinal(n: number) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

// `transparent`: no photo and no shading, just the text, like Hevy's
// "Background" toggle. It goes on top of the person's own story photo, so
// every line gets a shadow to stay readable on any picture.
// `square`: square corners, for Instagram Stories, which turns transparent
// corners black.
export async function renderCard(
  design: CardDesign["id"],
  data: CardData,
  photo: HTMLImageElement | null,
  { transparent = false, square = false } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn’t available");
  ctx.scale(SCALE, SCALE);
  const bg: Background = transparent ? null : { photo, round: !square };
  if (transparent) textShadow(ctx);
  if (design === "square") drawSquare(ctx, data, bg);
  else drawHevy(ctx, data, bg, design === "hevy-seen" ? "seen" : "venue");
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t make the image"))), "image/png"),
  );
}

// "Square · single, full photo"
function drawSquare(ctx: Ctx, d: CardData, bg: Background) {
  const pad = 28;
  if (bg) {
    clipRounded(ctx, bg.round ? 20 : 0);
    drawPhoto(ctx, bg.photo, 0.5);
    verticalGradient(ctx, 150, U, [
      [0, "rgba(0, 0, 0, 0)"],
      [0.5, "rgba(0, 0, 0, 0.78)"],
      [1, "#000000"],
    ]);
  }

  // Laid out bottom up, as the design is bottom aligned.
  const footerTop = U - pad - 18;
  setFont(ctx, 800, 18, DISPLAY, -0.81);
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText("stubbed", pad, footerTop + 4);
  setFont(ctx, 500, 10, TEXT, 0);
  ctx.fillStyle = SECONDARY;
  ctx.fillText(CARD_DOMAIN, pad, footerTop + 19);
  if (d.handle) {
    setFont(ctx, 400, 13, TEXT, -0.08);
    ctx.fillStyle = SECONDARY;
    ctx.textAlign = "right";
    ctx.fillText(`@${d.handle}`, U - pad, footerTop + 4);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = "#38383A";
  ctx.fillRect(pad, footerTop - 14 - 1, U - pad * 2, 1);

  const rowTop = footerTop - 15 - 16 - 22;
  const statX = d.rating != null ? U - pad : null;
  if (d.rating != null) drawStars(ctx, d.rating, pad, rowTop, 22, 3, "#7C7C82");
  // "14th show of 2026": right aligned beside the stars, or alone on the left.
  setFont(ctx, 400, 13, TEXT, 0);
  const ofYear = `show of ${d.year}`;
  const ofWidth = ctx.measureText(ofYear).width;
  setFont(ctx, 600, 17, TEXT, -0.4);
  const nth = ordinal(d.showOfYear);
  const nthWidth = ctx.measureText(nth).width;
  const startX = statX != null ? statX - ofWidth - 8 - nthWidth : pad;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CORAL;
  ctx.fillText(nth, startX, rowTop + 17);
  setFont(ctx, 400, 13, TEXT, 0);
  ctx.fillStyle = SECONDARY;
  ctx.fillText(ofYear, startX + nthWidth + 8, rowTop + 17);

  const metaBottom = rowTop - 10;
  setFont(ctx, 400, 14, TEXT, -0.17);
  ctx.fillStyle = SECONDARY;
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, [d.where, d.date].filter(Boolean).join(" · "), U - pad * 2), pad, metaBottom - 9.5);

  drawTitle(ctx, d.title, pad, metaBottom - 19 - 4, U - pad * 2, 36, 40);
}

// "Hevy-style · photo" (venue visits) and "· photo, seen before" (times seen)
function drawHevy(ctx: Ctx, d: CardData, bg: Background, middle: "venue" | "seen") {
  const side = 24;
  if (bg) {
    clipRounded(ctx, bg.round ? 32 : 0);
    drawPhoto(ctx, bg.photo, middle === "seen" ? 0.4 : 0.35);
    verticalGradient(ctx, 0, 170, [
      [0, "rgba(0, 0, 0, 0.6)"],
      [1, "rgba(0, 0, 0, 0)"],
    ]);
    verticalGradient(ctx, 270, U, [
      [0, "rgba(0, 0, 0, 0)"],
      [1, "rgba(0, 0, 0, 0.82)"],
    ]);
  }
  textShadow(ctx);

  // Stats row: two or three equal columns (no rating, no rating column).
  const stats: { label: string; value: string | number; color?: string }[] = [
    { label: `Show of ${d.year}`, value: ordinal(d.showOfYear), color: CORAL },
    middle === "venue" && d.venue
      ? { label: d.venue, value: `${ordinal(d.venueVisit)} visit` }
      : { label: "Time seen", value: ordinal(d.timesSeen) },
  ];
  if (d.rating != null) stats.push({ label: "Rating", value: d.rating });
  const colWidth = (U - side * 2) / stats.length;
  stats.forEach((s, i) => {
    const cx = side + colWidth * i + colWidth / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, 400, 15, TEXT, -0.15);
    ctx.fillStyle = SOFT_WHITE;
    ctx.fillText(fit(ctx, s.label, colWidth - 12), cx, 28 + 10);
    if (typeof s.value === "number") {
      const w = 5 * 20 + 4 * 2;
      drawStars(ctx, s.value, cx - w / 2, 28 + 20 + 4, 20, 2, "rgba(255, 255, 255, 0.75)");
    } else {
      setFont(ctx, 700, 24, DISPLAY, 0.24);
      ctx.fillStyle = s.color ?? "#FFFFFF";
      ctx.fillText(fit(ctx, s.value, colWidth - 12), cx, 28 + 20 + 14);
    }
  });
  ctx.textAlign = "left";

  // Bottom block, laid out bottom up.
  const x = side + 4;
  const footerMid = U - 24 - 14;
  ctx.textBaseline = "middle";
  setFont(ctx, 800, 28, DISPLAY, -1.26);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("stubbed", x, footerMid - 10);
  setFont(ctx, 500, 12, TEXT, 0);
  ctx.fillStyle = SOFT_WHITE;
  ctx.fillText(CARD_DOMAIN, x, footerMid + 11);
  if (d.handle) {
    setFont(ctx, 400, 20, TEXT, -0.32);
    ctx.fillStyle = SOFT_WHITE;
    ctx.textAlign = "right";
    ctx.fillText(`@${d.handle}`, U - x, footerMid - 10);
    ctx.textAlign = "left";
  }
  const metaBottom = footerMid - 14 - 16;
  setFont(ctx, 400, 15, TEXT, -0.18);
  ctx.fillStyle = SOFT_WHITE;
  ctx.fillText(fit(ctx, [d.where, d.date].filter(Boolean).join(" · "), U - x * 2), x, metaBottom - 10);
  drawTitle(ctx, d.title, x, metaBottom - 20 - 2, U - x * 2, 34, 38);
}

// --- helpers ---------------------------------------------------------------

type Background = { photo: HTMLImageElement | null; round: boolean } | null;

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
    glow.addColorStop(0, "rgba(255, 107, 74, 0.35)");
    glow.addColorStop(1, "rgba(255, 107, 74, 0)");
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

// Title above `bottom`: up to two lines, shrinking for very long titles,
// then an ellipsis as a last resort.
function drawTitle(ctx: Ctx, title: string, x: number, bottom: number, maxWidth: number, size: number, lineHeight: number) {
  let lines: string[] = [];
  let s = size;
  let lh = lineHeight;
  for (; s >= size * 0.7; s -= 2, lh = (lineHeight / size) * s) {
    setFont(ctx, 700, s, DISPLAY, s * 0.01);
    lines = wrap(ctx, title, maxWidth);
    if (lines.length <= 2) break;
  }
  if (lines.length > 2) lines = [lines[0], fit(ctx, lines.slice(1).join(" "), maxWidth)];
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
