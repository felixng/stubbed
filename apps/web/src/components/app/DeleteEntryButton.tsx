"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { PHOTO_BUCKET } from "@/lib/entries";
import { createClient } from "@/lib/supabase/client";

// Deletes an entry after a confirmation, along with its photo.
export function DeleteEntryButton({ id, photoPath }: { id: string; photoPath: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!(await confirm({ title: "Delete this entry?", message: "This can’t be undone.", action: "Delete entry" }))) return;
          setBusy(true);
          const supabase = createClient();
          const { error: del } = await supabase.from("entries").delete().eq("id", id);
          if (del) {
            setError("Couldn’t delete. Try again.");
            setBusy(false);
            return;
          }
          if (photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
          router.push("/app/profile");
          router.refresh();
        }}
        className="min-h-11 rounded-pill px-4 text-subheadline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Delete entry"}
      </button>
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
      {dialog}
    </div>
  );
}
