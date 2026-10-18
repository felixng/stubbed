"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

// Deletes a comment: the commenter's own, or any comment on the viewer's own
// entry (Postgres decides). Nobody is told. With `onDeleted` (the feed's
// inline comments, which keep their own list) that runs instead of a refresh.
export function DeleteCommentButton({ commentId, mine, onDeleted }: { commentId: string; mine: boolean; onDeleted?: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  return (
    <button
      type="button"
      disabled={saving || refreshing}
      onClick={async () => {
        if (!window.confirm(mine ? "Delete your comment?" : "Delete this comment from your show?")) return;
        setSaving(true);
        const { error } = await createClient().from("entry_comments").delete().eq("id", commentId);
        if (error) {
          setSaving(false);
          window.alert("Couldn’t delete. Try again.");
          return;
        }
        if (onDeleted) {
          setSaving(false);
          onDeleted();
          return;
        }
        startRefresh(() => {
          setSaving(false);
          router.refresh();
        });
      }}
      className="min-h-11 shrink-0 cursor-pointer rounded-pill px-3 text-footnote font-semibold text-label-secondary hover:bg-fill hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
    >
      Delete
    </button>
  );
}
