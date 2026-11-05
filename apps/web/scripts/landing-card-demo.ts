// Synthetic marketing data, as of 5 November 2026. No database reads/writes.
// 57 visits by early November puts this diary on pace for ~67 per year.
import { renderCard, CARD_DESIGNS, type CardData } from "../src/lib/share-card";
import { renderInsightCard, INSIGHT_CARD_DESIGNS, type InsightCardData } from "../src/lib/share-card-insights";

export const demoEntry: CardData = {
  title: "Operation Mincemeat", venue: "Fortune Theatre", where: "", date: "4 Nov 2026",
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

export async function renderLandingDemoCards(photos: HTMLImageElement[]) {
  const cards = [];
  const lostBoys: CardData = { ...demoEntry, title: "The Lost Boys", venue: "Palace Theatre", rating: 4.5, showOfYear: 56, venueVisit: 3, timesSeen: 2 };
  const photoVariants = [
    { id: "stats-mincemeat", design: "stats", photo: photos[1], entry: demoEntry },
    { id: "name-mincemeat", design: "name", photo: photos[0], entry: { ...demoEntry, venue: "Golden Theatre", venueVisit: 2 } },
    { id: "stats-lost-boys", design: "stats", photo: photos[2], entry: lostBoys },
    { id: "name-lost-boys", design: "name", photo: photos[3], entry: lostBoys },
  ];
  for (const card of photoVariants) cards.push({ id: card.id, blob: await renderCard(card.design, card.entry, card.photo) });
  for (const design of [...CARD_DESIGNS.filter(d => !d.photo), ...INSIGHT_CARD_DESIGNS]) {
    const blob = CARD_DESIGNS.some(d => d.id === design.id)
      ? await renderCard(design.id, demoEntry, null, { background: "gradient" })
      : await renderInsightCard(design.id, demoInsights, { background: "gradient" });
    cards.push({ id: CARD_DESIGNS.some(d => d.id === design.id) ? `${design.id}-mincemeat` : design.id, blob });
  }
  return cards;
}

// Photo-led trip recap used by section 02; uses owner photos 4 and 2.
export const demoTrip = {
  name: "An encore getaway", dates: "2–4 Nov 2026", place: null,
  cities: 0, handle: "sillyelphaba", venues: 2, nights: 2, average: 4.5,
  shows: [
    { title: "The Lost Boys", venue: "Palace Theatre", day: "Mon 2 Nov", rating: 4.5 },
    { title: "Operation Mincemeat", venue: "Fortune Theatre", day: "Wed 4 Nov", rating: 4.5 },
  ],
};
