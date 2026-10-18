// Product events, stored in the `events` table (schema and rules:
// supabase/migrations/20261013160000_events.sql, queries: docs/ANALYTICS.md).
// Signed-in users only. Page views, including public profiles, go to Vercel
// Web Analytics and Google Analytics instead (SiteAnalytics).
import type { SupabaseClient } from "@supabase/supabase-js";

// Keep in step with the check constraint on events.name.
export type EventName = "entry_logged" | "card_shared";

// Small, non-personal details only: no emails, notes or free text.
export type EventProps = Record<string, string | number | boolean | null>;

// Fire and forget: analytics must never block or break the action it
// describes, so failures are logged and swallowed.
export async function track(supabase: SupabaseClient, name: EventName, props: EventProps = {}) {
  try {
    const { error } = await supabase.from("events").insert({ name, props });
    if (error) console.warn(`Recording "${name}" failed`, error);
  } catch (err) {
    console.warn(`Recording "${name}" failed`, err);
  }
}
