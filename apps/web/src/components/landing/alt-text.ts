// Image descriptions for the landing page. Kept in code rather than the CMS:
// they describe the artwork, so they change when the artwork does.
export const heroGroupLabel = "Theatre photo and stats sharing cards";

export const cardAlt = {
  "stats-mincemeat": "Demo card for @sillyelphaba: Operation Mincemeat with a curtain-call photo, 57th show of 2026, 9th visit to Fortune Theatre and 7 times seen.",
  "name-mincemeat": "Demo card for @sillyelphaba: Operation Mincemeat with a programme photo and four and a half out of five stars.",
  "stats-lost-boys": "Demo card for @sillyelphaba: The Lost Boys programme photo, 56th show of 2026, 3rd Palace Theatre visit and 2 times seen.",
  "name-lost-boys": "Demo card for @sillyelphaba: The Lost Boys stage photo with four and a half out of five stars.",
  "data-mincemeat": "Demo data card for @sillyelphaba: Operation Mincemeat, 57th show of 2026, 9th visit to Fortune Theatre and 7 times seen.",
  "encore-mincemeat": "Demo Encore card for @sillyelphaba: 7th time seeing Operation Mincemeat, with a gold 7x badge.",
  "show-number-mincemeat": "Demo show-number card for @sillyelphaba: Operation Mincemeat is the 57th show visit of 2026.",
  "weekly-streak": "Demo weekly-streak card for @sillyelphaba: a show every week for 8 weeks.",
  "year-in-theatre": "Demo 2026 Year in theatre card for @sillyelphaba: 57 visits to 34 unique shows, with a monthly bar chart through early November.",
  "show-mix": "Demo show-mix card for @sillyelphaba: 57 visits, comprising 44 musicals, 8 plays, 3 comedy and 2 stand-up visits.",
  "activity": "Demo theatre calendar for @sillyelphaba: 57 visits in 2026, shown in a daily activity grid and monthly bar chart.",
  "most-seen-shows": "Demo most-seen shows for @sillyelphaba: Operation Mincemeat 7 visits, Hadestown 5, Cabaret 4, Wicked 3 and The Lost Boys 2.",
  "around-the-world": "Demo theatre travels for @sillyelphaba: 49 visits in the United Kingdom and 8 in the United States, highlighted on a world map.",
  "year-by-year": "Demo theatre years for @sillyelphaba: 61 visits in 2024, 66 in 2025 and 57 so far in 2026.",
  "daily-streak": "Demo current daily streak for @sillyelphaba: 1 day.",
  "best-weekly-streak": "Demo best weekly streak for @sillyelphaba: 12 weeks in 2026.",
  "best-daily-streak": "Demo best daily streak for @sillyelphaba: 3 consecutive days in 2026.",
} as const;

export type CardId = keyof typeof cardAlt;

export const tripImageAlt = "Demo trip summary for @sillyelphaba: An encore getaway, 2–4 November 2026, with photos from The Lost Boys at Palace Theatre and Operation Mincemeat at Fortune Theatre.";

export const statsImageAlt = "Native Insights demo showing 57 visits to 34 unique shows in 2026, 66 shows in 2025, a daily activity grid and monthly attendance chart.";
