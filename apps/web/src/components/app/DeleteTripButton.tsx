"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";

// Deletes a trip or label. Its entries stay in the diary.
export function DeleteTripButton({ id }: { id: string }) {
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
          if (!(await confirm({ title: "Delete this trip?", message: "The shows stay in your diary.", action: "Delete trip" }))) return;
          setBusy(true);
          setError(null);
          const { error: del } = await createClient().from("collections").delete().eq("id", id);
          if (del) {
            setBusy(false);
            setError("Couldn’t delete. Try again.");
            return;
          }
          router.push("/app/profile?view=trips");
          router.refresh();
        }}
        className="min-h-11 rounded-pill px-4 text-subheadline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Delete trip"}
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
