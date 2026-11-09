import {
  availableEntryDesigns, type CardData, type CardDesign, type Ctx, type ShareBackground, type ShareInk,
  DISPLAY, TEXT, drawShareFooter, drawShareSurface, fit, renderSquare, setFont, shareForeground,
} from "@/lib/share-card";

export type InsightStats = {
  total: number;
  unique_shows: number;
  streaks: { current_weekly: number; current_daily: number; longest_weekly: number; longest_daily: number };
  years: { year: number; count: number }[];
  months: { month: string; count: number }[];
  types: { type: string; count: number }[];
  access?: { tier: "free" | "pro"; period: "current" | "past" | "all"; locked: string[] };
};
export type InsightCardData = { stats: InsightStats; year: number | null; handle: string | null };
export const SHOW_TYPES = [
  { id: "musical", name: "Musical" }, { id: "play", name: "Play" }, { id: "opera", name: "Opera" },
  { id: "dance", name: "Dance" }, { id: "comedy", name: "Comedy" }, { id: "standup", name: "Stand-up" },
  { id: "concert", name: "Concert" }, { id: "circus", name: "Circus" }, { id: "other", name: "Other" },
];
export const INSIGHT_CARD_DESIGNS: CardDesign[] = [
  { id: "weekly-streak", name: "Weekly streak", background: true },
  { id: "year-in-theatre", name: "Year in theatre", background: true },
  { id: "show-mix", name: "Show mix", background: true },
];
export function availableInsightDesigns(data: InsightCardData, currentYear = new Date().getFullYear(), includingEmpty = false) {
  return INSIGHT_CARD_DESIGNS.filter(design => design.id === "weekly-streak"
    ? (data.year == null || data.year === currentYear) && (data.stats.streaks.current_weekly > 0 || includingEmpty)
    : (data.stats.total > 0 || includingEmpty) && (design.id !== "year-in-theatre" || data.year != null));
}
export function availableShowDesigns(data: CardData, photo: boolean, insights: InsightCardData) {
  const entries = availableEntryDesigns(data, photo);
  const venue = entries.find(design => design.id === "venue-visits");
  const designs = [...entries.filter(design => design.id !== "venue-visits"), ...availableInsightDesigns(insights, new Date().getFullYear(), true)];
  if (venue) {
    const year = designs.findIndex(design => design.id === "year-in-theatre");
    designs.splice(year < 0 ? designs.length : year, 0, venue);
  }
  return designs;
}
export function isInsightDesign(id: string) {
  return INSIGHT_CARD_DESIGNS.some(design => design.id === id);
}
export function monthlyShareCounts(data: InsightCardData) {
  return Array.from({ length: 12 }, (_, i) => data.stats.months.find(m => m.month === `${data.year}-${String(i + 1).padStart(2, "0")}`)?.count ?? 0);
}
export function radarShareValues(data: InsightCardData) {
  return SHOW_TYPES.map(type => data.stats.types.find(t => t.type === type.id)?.count ?? 0);
}
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function text(ctx: Ctx, value: string, x: number, y: number, size: number, weight = 500, max = 484) {
  setFont(ctx, weight, size, weight >= 700 ? DISPLAY : TEXT, 0);
  ctx.fillText(fit(ctx, value, max), x, y);
}
function radar(ctx: Ctx, data: InsightCardData, ink: string, highContrast: boolean, accent: string) {
  const values = radarShareValues(data), max = Math.max(1, ...values), cx = 270, cy = 282, radius = 104;
  const point = (i: number, fraction: number, r = radius) => {
    const a = i * 2 * Math.PI / 7 - Math.PI / 2;
    return [cx + Math.cos(a) * r * fraction, cy + Math.sin(a) * r * fraction];
  };
  const polygon = (fractions: number[]) => {
    ctx.beginPath();
    fractions.forEach((f, i) => { const [x, y] = point(i, f); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
  };
  ctx.save(); ctx.strokeStyle = ink; ctx.globalAlpha = highContrast ? 0.65 : 0.15; ctx.lineWidth = highContrast ? 1.6 : 1;
  for (let l = 1; l <= 4; l++) { polygon(Array(7).fill(l / 4)); ctx.stroke(); }
  for (let i = 0; i < 7; i++) { const [x, y] = point(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
  polygon(values.map(v => v / max)); ctx.globalAlpha = highContrast ? 0.32 : 0.22; ctx.fillStyle = accent; ctx.fill();
  ctx.globalAlpha = 1; ctx.lineWidth = highContrast ? 3 : 2; ctx.strokeStyle = accent; ctx.stroke();
  if (highContrast) for (let i = 0; i < 7; i++) {
    const [x, y] = point(i, values[i] / max);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "top";
  SHOW_TYPES.forEach((type, i) => {
    const [x, y] = point(i, 1, radius + 30);
    text(ctx, type.name, x, y - 15, 15, 500, 126);
    text(ctx, `${values[i]} · ${data.stats.total > 0 ? Math.round(values[i] / data.stats.total * 100) : 0}%`, x, y + 7, 13, 400, 126);
  });
  ctx.textAlign = "left";
}
export async function renderInsightCard(id: string, data: InsightCardData,
  { background = "solid", ink = "light", includingEmpty = false }: { background?: ShareBackground; ink?: ShareInk; includingEmpty?: boolean } = {}) {
  if (!availableInsightDesigns(data, new Date().getFullYear(), includingEmpty).some(d => d.id === id)) throw new Error("There are no shows to share for this card");
  return renderSquare((ctx, mark) => {
    drawShareSurface(ctx, background);
    const color = shareForeground(background, ink);
    ctx.fillStyle = color; ctx.textBaseline = "top"; ctx.textAlign = "left";
    if (id === "weekly-streak") {
      const streak = data.stats.streaks.current_weekly;
      text(ctx, "Current weekly streak", 28, 28, 24);
      text(ctx, String(streak), 28, 116, 112, 800);
      text(ctx, streak === 1 ? "Week" : "Weeks", 28, 245, 32, 700);
      text(ctx, streak === 0 ? "No current streak" : "A show every week", 28, 296, 22);
      for (let i = 0; i < Math.min(12, streak); i++) ctx.fillRect(28 + i * 36, 352, 28, 10);
      if (streak > 12) text(ctx, "Most recent 12 weeks", 28, 380, 15, 400);
    } else if (id === "year-in-theatre") {
      text(ctx, `My ${data.year} in theatre`, 28, 28, 32, 700);
      if (data.year === new Date().getFullYear()) text(ctx, "So far", 28, 72, 18, 400);
      [data.stats.total, data.stats.unique_shows].forEach((count, i) => {
        text(ctx, String(count), 28 + i * 260, 116, 64, 800, 224);
        text(ctx, i ? "Unique shows" : "Show visits", 28 + i * 260, 192, 19, 500, 224);
      });
      const counts = monthlyShareCounts(data), max = Math.max(1, ...counts), col = 484 / 12;
      counts.forEach((count, i) => {
        const h = 130 * count / max, x = 28 + i * col;
        ctx.fillRect(x + 3, 406 - h, col - 6, h);
        ctx.textAlign = "center";
        text(ctx, String(count), x + col / 2, 386 - h, 12, 500, col - 4);
        text(ctx, monthNames[i], x + col / 2, 416, 11, 500, col - 4);
      });
      ctx.textAlign = "left";
    } else {
      text(ctx, "My show mix", 28, 28, 32, 700);
      const period = data.year == null ? "All time" : `${data.year}${data.year === new Date().getFullYear() ? " so far" : ""}`;
      text(ctx, `${period} · ${data.stats.total} visits`, 28, 72, 18, 400);
      radar(ctx, data, color, background === "transparent", background === "transparent" && ink === "dark" ? "#DC2F4F" : "#FF5A5A");
    }
    drawShareFooter(ctx, data.handle, color, mark);
  });
}

// What a locked card shows instead of the person's data: fixed sample content, never their numbers
// (docs/PAYWALL.md section 2, "Share cards").
export function sampleInsightData(year: number): InsightCardData {
  return {
    year, handle: null,
    stats: {
      total: 24, unique_shows: 19,
      streaks: { current_weekly: 3, current_daily: 1, longest_weekly: 5, longest_daily: 2 },
      years: [{ year, count: 24 }],
      months: [3, 1, 2, 0, 2, 4, 1, 3, 2, 2, 3, 1].map((count, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, count })),
      types: [{ type: "musical", count: 10 }, { type: "play", count: 7 }, { type: "opera", count: 3 }, { type: "dance", count: 2 }, { type: "comedy", count: 2 }],
    },
  };
}
