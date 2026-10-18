// Turns an AI provider's raw error (as the API routes pass it on, e.g.
// `400 {"type":"error",...}` or `Gemini 503: ...`) into a short line for the
// import screen. Pure, so it's unit tested.

// Usage limits, rate limits, overload, outages and bad keys: nothing the user
// can fix, and trying later may work.
const UNAVAILABLE =
  /usage limit|quota|billing|credit balance|rate.?limit|too many requests|overloaded|unavailable|api.?key|authenticat|permission|\b(401|403|429|5\d\d)\b/i;

export function importErrorText(what: "photo" | "email", detail: string | null | undefined): string {
  const action = what === "photo" ? "work out the show" : "read this email";
  if (detail && UNAVAILABLE.test(detail)) return `Couldn’t ${action}: reading is unavailable right now. Try again later.`;
  return `Couldn’t ${action}.`;
}
