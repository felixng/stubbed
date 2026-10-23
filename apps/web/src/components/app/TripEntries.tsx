"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EntryRow } from "@/lib/entries";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "./EmptyState";
import { EntryList } from "./EntryList";

// The trip's shows, with a select mode to take some out in place, like the
// diary's. Adding lists the shows not in the trip yet (only those dated within
// it can join), all ticked to start with.
export function TripEntries({
  tripId,
  inTrip,
  others,
  photos,
}: {
  tripId: string;
  inTrip: EntryRow[];
  others: EntryRow[];
  photos: Record<string, string>;
}) {
  const router = useRouter();
  const photoMap = useMemo(() => new Map(Object.entries(photos)), [photos]);
  const [mode, setMode] = useState<"idle" | "add" | "remove">("idle");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPicked([]);
    setMode("idle");
    setError(null);
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function apply() {
    if (!picked.length) return reset();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: write } =
      mode === "add"
        ? await supabase
            .from("entry_collections")
            .insert(picked.map((entry_id) => ({ entry_id, collection_id: tripId })))
        : await supabase.from("entry_collections").delete().eq("collection_id", tripId).in("entry_id", picked);
    setBusy(false);
    if (write) return setError("Couldn’t update the trip. Try again.");
    reset();
    router.refresh();
  }

  const selection = { picked, onToggle: toggle };
  const n = picked.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Keeps its height in every mode, so the list never jumps. */}
      {inTrip.length > 0 && (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="text-subheadline text-label-secondary" aria-live="polite">
            {mode === "remove" && (n ? `${n} selected` : "Pick shows to take out of this trip")}
          </p>
          {mode !== "add" && (
            <Button variant="ghost" size="sm" onClick={mode === "remove" ? reset : () => setMode("remove")}>
              {mode === "remove" ? "Cancel" : "Select"}
            </Button>
          )}
        </div>
      )}

      {inTrip.length ? (
        <EntryList
          entries={inTrip}
          photos={photoMap}
          selection={mode === "remove" ? selection : undefined}
          from={`trip-${tripId}`}
        />
      ) : (
        <EmptyState title="No shows in this trip yet">
          Add shows dated within the trip, or plan one: it’s offered this trip when its date falls inside.
        </EmptyState>
      )}

      {mode === "idle" && others.length > 0 && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPicked(others.map((e) => e.id));
              setMode("add");
            }}
          >
            Add shows
          </Button>
        </div>
      )}

      {mode === "add" && (
        <section className="flex flex-col gap-3" aria-labelledby={`${tripId}-add`}>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <h2 id={`${tripId}-add`} className="text-headline text-label">
              Shows within the trip’s dates
            </h2>
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
          <EntryList entries={others} photos={photoMap} selection={selection} />
        </section>
      )}

      {/* Sits on the tab bar (49px), or the bottom edge from md where the sidebar replaces it, like the diary's select bar. */}
      {mode !== "idle" && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+49px)] z-10 md:bottom-0 -mx-4 flex flex-col gap-3 bg-background/90 px-4 pt-3 pb-4 backdrop-blur">
          {error && (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          )}
          {mode === "add" ? (
            <Button className="w-full" disabled={!n || busy} onClick={() => void apply()}>
              {n ? `Add ${n} to this trip` : "Pick shows"}
            </Button>
          ) : (
            <button
              type="button"
              disabled={!n || busy}
              onClick={() => void apply()}
              className="min-h-[50px] w-full cursor-pointer rounded-pill border border-separator bg-surface px-5 text-headline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
            >
              {n ? `Remove ${n} from this trip` : "Pick shows"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
