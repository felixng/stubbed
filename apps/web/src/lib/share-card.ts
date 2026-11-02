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

export type CardDesign = { id: string; name: string; photo?: boolean; background?: boolean };

export type ShareBackground = "solid" | "gradient" | "transparent";
export type ShareInk = "light" | "dark";
export const CARD_DESIGNS: CardDesign[] = [
  { id: "stats", name: "Data + Photo", photo: true },
  { id: "name", name: "Rating + Photo", photo: true },
  { id: "data", name: "Data", background: true },
  { id: "encore", name: "Encore", background: true },
  { id: "show-number", name: "Show number", background: true },
];
export function availableEntryDesigns(data: CardData, photo: boolean) {
  return CARD_DESIGNS.filter(d => (!d.photo || photo) && (d.id !== "name" || data.rating != null)).map(d => d.id === "encore" && data.timesSeen === 1 ? { ...d, name: "First visit" } : d);
}
export function cardBackground(design: CardDesign, chosen: ShareBackground) {
  return design.background ? chosen : "photo";
}
export function entryMetrics(data: CardData) {
  return [
    { label: `Show of ${data.year}`, value: ordinal(data.showOfYear) },
    ...(data.venue ? [{ label: data.venue, value: `${ordinal(data.venueVisit)} visit` }] : []),
    { label: "Times seen", value: String(data.timesSeen) },
  ];
}

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

export async function renderSquare(draw: (ctx: Ctx, mark: HTMLImageElement | null) => void): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn’t draw the card");
  const mark = await loadMark();
  ctx.scale(SCALE, SCALE);
  draw(ctx, mark);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Couldn’t make the image")), "image/png"));
}
export function drawShareSurface(ctx: Ctx, background: ShareBackground) {
  if (background === "transparent") return;
  if (background === "solid") ctx.fillStyle = "#1C1C1E";
  else {
    const gradient = ctx.createLinearGradient(0, 0, 540, 540);
    gradient.addColorStop(0, "rgb(99,10,59)");
    gradient.addColorStop(0.5, "rgb(122,23,41)");
    gradient.addColorStop(1, "#1C1C1E");
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, 540, 540);
}
export function shareForeground(background: ShareBackground, ink: ShareInk) {
  return background === "transparent" && ink === "dark" ? "#141414" : "#FFFFFF";
}
export function drawShareFooter(ctx: Ctx, handle: string | null, ink: string, mark: HTMLImageElement | null) {
  if (mark) ctx.drawImage(mark, 28, 477, 30 * MARK_RATIO, 30);
  setFont(ctx, 800, 30, DISPLAY, -1.35);
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("stubbed", 28 + 30 * MARK_RATIO + 8, 492);
  if (handle) {
    ctx.textAlign = "right";
    setFont(ctx, 500, 20, TEXT, -0.2);
    ctx.fillText(fit(ctx, `@${handle}`, 240), 512, 492);
    ctx.textAlign = "left";
  }
}
export function drawTopTitle(ctx: Ctx, title: string, y: number, ink: string, size = 38) {
  let lines: string[] = [], font = size;
  for (; font >= size * 0.7; font -= 2) {
    setFont(ctx, 700, font, DISPLAY, font * 0.01);
    lines = wrap(ctx, title, 484);
    if (lines.length <= 2) break;
  }
  if (lines.length > 2) lines = [lines[0], fit(ctx, lines.slice(1).join(" "), 484)];
  const lineHeight = font * 1.12;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  lines.forEach((line, i) => ctx.fillText(fit(ctx, line, 484), 28, y + i * lineHeight));
  return lines.length * lineHeight;
}
function drawBadge(ctx: Ctx, value: string, cy: number) {
  ctx.save();
  for (const sign of [-1, 1]) {
    ctx.save();
    ctx.translate(270 + sign * 39, cy + 76);
    ctx.rotate(sign * -12 * Math.PI / 180);
    ctx.fillStyle = CORAL;
    ctx.fillRect(-18, -30, 36, 60);
    ctx.restore();
  }
  ctx.beginPath();
  for (let i = 0; i < 128; i++) {
    const angle = i * Math.PI / 64 - Math.PI / 2, radius = 85 + 6 * Math.cos(8 * angle);
    const x = 270 + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = STAR; ctx.fill();
  ctx.beginPath(); ctx.arc(270, cy, 66, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 2; ctx.stroke();
  setFont(ctx, 800, 48, DISPLAY, -1.5);
  ctx.fillStyle = "#1F1F1F"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, value, 132), 270, cy);
  ctx.restore();
}
export async function renderCard(
  designId: string, data: CardData, photo: HTMLImageElement | null,
  { background = "solid", ink = "light" }: { background?: ShareBackground; ink?: ShareInk; square?: boolean } = {},
) {
  const design = CARD_DESIGNS.find(d => d.id === designId);
  if (!design || !availableEntryDesigns(data, photo != null).some(d => d.id === designId)) throw new Error("This card needs a photo or rating");
  return renderSquare((ctx, mark) => {
    const color = design.photo ? "#FFFFFF" : shareForeground(background, ink);
    const metrics = entryMetrics(data);
    if (design.photo) {
      drawPhoto(ctx, photo, 0.4);
      if (designId === "stats") verticalGradient(ctx, 0, 150, [[0, "rgba(0,0,0,0.6)"], [1, "rgba(0,0,0,0)"]]);
      verticalGradient(ctx, 360, 540, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.8)"]]);
      textShadow(ctx);
      if (designId === "stats") {
        const col = 484 / metrics.length;
        metrics.forEach((m, i) => {
          ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = color;
          setFont(ctx, 500, 17, TEXT, -0.2);
          const labels = wrap(ctx, m.label, col - 12).slice(0, 2);
          labels.forEach((line, j) => ctx.fillText(fit(ctx, line, col - 12), 28 + col * (i + 0.5), 28 + j * 21));
          setFont(ctx, 700, 28, DISPLAY, 0);
          ctx.fillText(fit(ctx, m.value, col - 12), 28 + col * (i + 0.5), 76);
        });
        drawTitle(ctx, data.title, 28, 460, 484, 28, 40, 2);
      } else {
        drawTitle(ctx, data.title, 28, 414, 484, 36, 40, 2);
        drawStars(ctx, data.rating!, 28, 426, 30, 4, "rgba(255,255,255,0.75)");
      }
    } else {
      drawShareSurface(ctx, background);
      if (designId === "data") {
        const titleH = drawTopTitle(ctx, data.title, 28, color);
        const start = Math.max(138, 28 + titleH + 20);
        metrics.forEach((m, i) => {
          const y = start + i * ((452 - start) / metrics.length);
          ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "top";
          setFont(ctx, 500, 18, TEXT, 0); ctx.fillText(fit(ctx, m.label, 484), 28, y);
          setFont(ctx, 700, 42, DISPLAY, 0); ctx.fillText(fit(ctx, m.value, 484), 28, y + 26);
        });
      } else {
        ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.textAlign = "left";
        setFont(ctx, 500, 22, TEXT, 0); ctx.fillText(designId === "encore" ? (data.timesSeen === 1 ? "First visit" : "Encore") : "My theatre year", 28, 28);
        drawBadge(ctx, designId === "encore" ? `${data.timesSeen}x` : ordinal(data.showOfYear), 196);
        ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.textAlign = "left";
        setFont(ctx, 500, 20, TEXT, 0);
        ctx.fillText(fit(ctx, designId === "encore" ? `${ordinal(data.timesSeen)} time seeing this show` : `Show of ${data.year}`, 484), 28, 310);
        drawTopTitle(ctx, data.title, 386, color, 30);
      }
    }
    drawShareFooter(ctx, data.handle, color, mark);
  });
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
  ink = "#FFFFFF",
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
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  lines.forEach((line, i) => {
    ctx.fillText(fit(ctx, line, maxWidth), x, bottom - lh * (lines.length - i) + lh / 2);
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
