// Identify a show from a photo (#14), or from several photos of one visit
// (#18's batch import).
//
// The model gets downscaled, re-encoded copies of the photos (no EXIF), the
// theatres near where it was taken, and the date and time, with web search
// on. The photo often settles it (show curtain, Playbill, marquee); venue and
// date plus a search cover generic stage shots and shows newer than the
// model's training data. The result is only a suggestion: the log form shows
// it for the user to confirm, and low confidence never fills a field.
import { aiConfigured, generateJson, type Generated, type ModelRef } from "@/lib/ai";

export type IdentifyInput = {
  // One or more photos from the same visit (up to MAX_IDENTIFY_PHOTOS in
  // lib/import/drafts.ts).
  photos: { base64: string; mediaType: "image/jpeg" }[];
  date: string | null; // "2026-10-10"
  time: string | null; // "19:42", local to where the photo was taken
  city: string | null;
  country: string | null; // ISO 3166-1 alpha-2 when known
  // Rounded to ~100 m. Lets the model search the area when OpenStreetMap
  // finds no theatre (or is down). Sent for this call only, never stored.
  point: { lat: number; lng: number } | null;
  candidates: { osm_id: string; name: string; distance_m: number }[];
};

export const SHOW_TYPES = ["musical", "play", "opera", "dance", "comedy", "standup", "other"] as const;

export type Identification = {
  show_title: string | null;
  show_type: (typeof SHOW_TYPES)[number] | null;
  venue_osm_id: string | null;
  venue_name: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

// Structured output. No nullable fields: Anthropic's API rejects a "string or null"
// type combined with an enum, so "unknown" is an empty string instead.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["show_title", "show_type", "venue_osm_id", "venue_name", "confidence", "reason"],
  properties: {
    show_title: {
      type: "string",
      description: 'The show\'s usual title, e.g. "Hadestown". Empty string if you can\'t tell.',
    },
    show_type: { type: "string", enum: [...SHOW_TYPES] },
    venue_osm_id: {
      type: "string",
      description: "osm_id of the listed nearby theatre where this was taken, copied exactly. Empty string if none fits or none were listed.",
    },
    venue_name: {
      type: "string",
      description: "The theatre's name, e.g. \"Belasco Theatre\". Fill it whenever you know the venue, even with no osm_id. Empty string if unknown.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reason: {
      type: "string",
      description:
        'One short line on what settled it, e.g. "Set backdrop reads Maybe Happy Ending; playing at the Belasco, 60 m away".',
    },
  },
} as const;

const SYSTEM = `You help a theatregoer log a show they saw. You get one or more photos they took at the theatre on one visit (often the set before curtain-up, a curtain call, a marquee, a programme, a Playbill or a ticket), plus when and roughly where they were taken, and the theatres near that spot. Work out which show it was and at which theatre.

Work through it in this order:
1. Venue and date. Start from the nearby theatres listed and the date the photo was taken. GPS can be 20–50 m off and theatres can be under 100 m apart, so treat the closest few as candidates, not just the nearest. If none are listed but a location is given, search for theatres near that point.
2. What was on. Search what was playing at those theatres on that date. Shows open and close, so check each run covers the date; times after about 17:00 are usually evening performances, earlier ones matinees. This gives a short list of possible shows.
3. Match the photo. Describe the set to yourself (distinctive scenery and props, e.g. a pile of suitcases under a "Baggage Claim" sign, a band on a platform, a turntable; the size and style of the house) and compare it with the possible shows. Search for a production's set or production photos when that helps tell the candidates apart. Pick the show, and the theatre, that the photo matches.
4. A title in the photo wins. Read every bit of text in the photos: a title or logo on the set or show curtain, a marquee, a programme or Playbill cover, a ticket. Text in any language counts. If the photos name the show, that is the show, whatever the search suggested; use steps 1–2 only to pick the theatre it was playing at. If the photos name the show and only one theatre is listed, don't search at all.

Be quick: the user may be waiting. Stop searching as soon as you're sure. Give venue_name whenever you know the theatre, and venue_osm_id only when it's one of the listed theatres. Start the reason with what settled it ("Programme reads…", "Only show at the Belasco that day…", "Set matches…").

Rules:
- Never identify performers by their face. Who is on stage doesn't matter here.
- "high": the photos name the show, or the venue, date and set together leave no reasonable doubt. "medium": the most likely of the shows on at that venue and date, with a gap. "low": a guess; prefer this, or empty strings, over overclaiming.`;

function describe(input: IdentifyInput) {
  const when = input.date ? `${input.date}${input.time ? ` at ${input.time} local time` : ""}` : "unknown";
  const area = [input.city, input.country].filter(Boolean).join(", ") || "unknown";
  const point = input.point ? `${input.point.lat.toFixed(3)}, ${input.point.lng.toFixed(3)}` : "unknown";
  const nearby = input.candidates.length
    ? input.candidates.map((c) => `- ${c.name} (osm_id ${c.osm_id}, ${c.distance_m} m away)`).join("\n")
    : input.point
      ? "none found (the map lookup may have failed; search near the location instead)"
      : "none (the photo has no location)";
  return `Photo taken: ${when}\nArea: ${area}\nLocation (approx.): ${point}\nNearby theatres:\n${nearby}`;
}

// `models`: a chain picked by the caller (the import tool's model picker);
// otherwise the configured chain for "identify".
export function identifyConfigured(models?: ModelRef[]) {
  return aiConfigured("identify", { images: true }, models);
}

export async function identifyShow(input: IdentifyInput, models?: ModelRef[]): Promise<Generated<Identification> | null> {
  const answer = await generateJson(
    {
      system: SYSTEM,
      content: [
        ...input.photos.map((photo) => ({ type: "image" as const, base64: photo.base64, mediaType: photo.mediaType })),
        { type: "text", text: describe(input) },
      ],
      schema: { name: "identification", schema: SCHEMA },
      webSearch: {
        // Each search adds seconds; three covers what was on + a set check + one more.
        maxUses: 3,
        ...(input.country && /^[A-Z]{2}$/.test(input.country)
          ? { location: { country: input.country, ...(input.city ? { city: input.city } : {}) } }
          : {}),
      },
      // Low effort: this runs while the user waits on the log form.
      effort: "low",
    },
    {
      task: "identify",
      models,
      parse: (raw) => clean(raw as Identification, input),
      // A model that can't name the show, or only guesses, hands over to the
      // next one (by default Opus, then Haiku, both with web search).
      accept: (result) => result.show_title !== null && result.confidence !== "low",
      budgetMs: 80_000,
    },
  );
  if (!answer) return null;
  const { result, model } = answer;
  console.info("Identify", model.provider, result.confidence, result.show_title, "|", result.reason);
  return answer;
}

// Keep only what the form can trust: empty strings become null, and an
// osm_id must come from the candidate list.
function clean(result: Identification, input: IdentifyInput): Identification {
  const known = input.candidates.some((c) => c.osm_id === result.venue_osm_id);
  return {
    show_title: result.show_title?.trim() || null,
    show_type: SHOW_TYPES.includes(result.show_type as never) ? result.show_type : null,
    venue_osm_id: known ? result.venue_osm_id : null,
    venue_name: result.venue_name?.trim() || null,
    confidence: ["high", "medium", "low"].includes(result.confidence) ? result.confidence : "low",
    reason: String(result.reason ?? "").slice(0, 300),
  };
}
