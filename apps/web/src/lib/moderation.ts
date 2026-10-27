import type { SupabaseClient } from "@supabase/supabase-js";

// Report and block (#176, #144; App Review guideline 1.2). Postgres holds the
// rules (supabase/migrations/…_blocks.sql, …_reports.sql); these are the
// web's calls into them, matching the iOS app's Data/Moderation.swift.

export type ReportTarget = { type: "entry" | "comment" | "profile"; id: string };

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

// What the report is about, in the dialog's title: "Report this show".
export function targetNoun(type: ReportTarget["type"]): string {
  return type === "entry" ? "show" : type;
}

// A note is optional, trimmed, and at most 500 characters (the column's check).
export function cleanNote(note: string): string | null {
  const trimmed = note.trim().slice(0, 500).trim();
  return trimmed || null;
}

export async function sendReport(
  supabase: SupabaseClient,
  target: ReportTarget,
  reason: ReportReason,
  note: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("reports")
    .insert({ target_type: target.type, target_id: target.id, reason, note: cleanNote(note) });
  return { error: error ? reportError(error.code) : null };
}

// 23505: they've already reported it and it's still open, which is fine.
export function reportError(code: string | undefined): string | null {
  if (!code || code === "23505") return null;
  if (code === "P0002") return "That’s no longer there.";
  if (code === "22023") return "You can’t report your own posts.";
  return "Couldn’t send your report. Try again.";
}

// Blocking ends follows both ways and hides each person from the other
// (Postgres does both). Unblocking doesn't restore the follows.
export async function setBlocked(supabase: SupabaseClient, profileId: string, blocked: boolean) {
  const { error } = blocked
    ? await supabase.from("blocks").insert({ blocked_id: profileId })
    : await supabase.from("blocks").delete().eq("blocked_id", profileId);
  // A double tap can race into a duplicate: the block exists, as asked.
  return { ok: !error || error.code === "23505" };
}
