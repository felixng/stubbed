// The typographic poster ("House Lights") drawn for a show with no photo.
// Everything here is pure and deterministic, so the same title always gets
// the same cover, on the server, in the browser and (by porting the same
// steps) on iOS. Poster.tsx turns the result into markup.
import type { ShowType } from "@/lib/entries";

// FNV-1a, 32-bit, over the UTF-8 bytes of the trimmed, lowercased, NFC title.
// Swift can run the same loop over `title.utf8`.
export function posterHash(title: string): number {
  const bytes = new TextEncoder().encode(title.trim().toLowerCase().normalize("NFC"));
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const ARTICLE = /^(the|a|an|la|le|les|il|el|der|die|das)\s+/i;
const MINOR = /^(of|the|a|an|and|in|on|at|to|for|that)$/i;

// Up to two initials: a leading article is skipped, then the first two words
// with a letter in them that aren't minor words. "The Curious Incident of the
// Dog…" is "CI", "Six" is "S", "La Bohème" is "B".
export function posterMonogram(title: string): string {
  const rest = title.trim().replace(ARTICLE, "");
  const words = rest.split(/[\s-]+/).filter((w) => /\p{L}/u.test(w) && !MINOR.test(w));
  const first = (w?: string) => (w ? Array.from(w)[0] : "");
  return (first(words[0]) + first(words[1])).toUpperCase();
}

// The title's size as a share of the poster's width (cqi): big enough to read,
// small enough that the longest word fits one line (~0.6em a glyph across ~78%
// of the width) and the whole title fits the space.
export function posterFitSize(text: string, max = 28): number {
  const words = text.trim().split(/\s+/);
  const longest = Math.max(1, ...words.map((w) => Array.from(w).length));
  const byWord = 122 / longest;
  const byArea = Math.sqrt(7600 / Math.max(1, Array.from(text.trim()).length));
  return Math.round(Math.min(max, byWord, byArea) * 100) / 100;
}

// Three wells, all existing tokens: Grey Well, Coral Wash, Footlight Glow.
export const POSTER_GROUNDS = ["fill", "wash", "glow"] as const;
export type PosterGround = (typeof POSTER_GROUNDS)[number];

// The small caps line naming the form. "other" reads as "Show" on a poster.
export const POSTER_KIND: Record<ShowType, string> = {
  musical: "Musical",
  play: "Play",
  opera: "Opera",
  dance: "Dance",
  comedy: "Comedy",
  standup: "Stand-up",
  other: "Show",
};

export type PosterDesign = {
  ground: PosterGround;
  // Where the title block sits: at the foot (kind at the top), or at the top
  // (kind at the foot).
  position: "top" | "bottom";
  monogram: string;
  // Title size in cqi.
  size: number;
};

export function posterDesign(title: string): PosterDesign {
  const h = posterHash(title);
  return {
    ground: POSTER_GROUNDS[h % 3],
    position: (h >>> 4) % 2 ? "top" : "bottom",
    monogram: posterMonogram(title),
    size: posterFitSize(title),
  };
}
