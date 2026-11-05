// Synthetic marketing data, as of 5 November 2026. No database reads/writes.
// 57 visits by early November puts this diary on pace for ~67 per year.
import { renderCard, CARD_DESIGNS, type CardData } from "../src/lib/share-card";
import { renderInsightCard, INSIGHT_CARD_DESIGNS, type InsightCardData } from "../src/lib/share-card-insights";

export const demoEntry: CardData = {
  title: "Wicked", venue: "Emerald Theatre", where: "", date: "4 Nov 2026",
  year: 2026, rating: 4.5, showOfYear: 57, venueVisit: 9, timesSeen: 7,
  handle: "sillyelphaba",
};
export const demoInsights: InsightCardData = {
  year: 2026, handle: "sillyelphaba",
  stats: {
    total: 57, unique_shows: 34,
    streaks: { current_weekly: 8, current_daily: 1, longest_weekly: 12, longest_daily: 3 },
    years: [{ year: 2026, count: 57 }],
    months: [5, 5, 6, 4, 6, 5, 7, 5, 6, 6, 2, 0].map((count, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, count })),
    types: [{ type: "musical", count: 44 }, { type: "play", count: 8 }, { type: "comedy", count: 3 }, { type: "standup", count: 2 }],
  },
};

export async function renderLandingDemoCards(photo: HTMLImageElement) {
  const cards = [];
  for (const design of [...CARD_DESIGNS, ...INSIGHT_CARD_DESIGNS]) {
    const blob = CARD_DESIGNS.some(d => d.id === design.id)
      ? await renderCard(design.id, demoEntry, photo, { background: "gradient" })
      : await renderInsightCard(design.id, demoInsights, { background: "gradient" });
    cards.push({ id: design.id, blob });
  }
  return cards;
}
