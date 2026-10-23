"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatTripDates, PHOTO_BUCKET, tripCovers, type Collection, type EntryRow } from "@/lib/entries";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { EntryList } from "./EntryList";

// The diary's tracked shows, with a select mode for grouping several into a
// trip (an existing trip that covers all their dates, or a new one with its
// dates prefilled to fit) or deleting them together. Hidden until "Select" is
// tapped, so the diary stays plain for the many visits that aren't part of a
// trip.
//
// Once the selection has gone to a trip, the diary is back out of select mode
// the next time it's shown (see useFreshOnReturn). A selection left for a
// stray tab tap is kept.
type Props = { entries: EntryRow[]; photos: Record<string, string>; trips: Collection[] };

export function DiaryEntries(props: Props) {
  const [round, setRound] = useState(0);
  const done = useFreshOnReturn(() => setRound((r) => r + 1));
  return <Selectable key={round} {...props} onDone={done} />;
}

function Selectable({ entries, photos, trips, onDone }: Props & { onDone: () => void }) {
  const router = useRouter();
  const photoMap = useMemo(() => new Map(Object.entries(photos)), [photos]);
  const [selecting, setSelecting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();

  const chosen = entries.filter((e) => picked.includes(e.id));
  const dates = chosen.map((e) => e.date).sort();
  const covering = trips.filter((t) => dates.every((d) => tripCovers(t, d)));
  const others = trips.filter((t) => !covering.includes(t));

  function reset() {
    setSelecting(false);
    setPicking(false);
    setPicked([]);
    setError(null);
  }

  async function addTo(trip: Collection) {
    setBusy(true);
    setError(null);
    const { error: write } = await createClient()
      .from("entry_collections")
      .upsert(
        picked.map((entry_id) => ({ entry_id, collection_id: trip.id })),
        { ignoreDuplicates: true },
      );
    setBusy(false);
    if (write) return setError("Couldn’t add them to the trip. Try again.");
    onDone();
    router.push(`/app/trips/${trip.id}`);
  }

  // Deletes the picked entries after a confirmation, with their photos, like
  // the entry page's Delete. Their trip links go with them (cascade).
  async function deletePicked() {
    const n = picked.length;
    const ok = await confirm({
      title: `Delete ${n === 1 ? "this show" : `these ${n} shows`}?`,
      message: "This can’t be undone.",
      action: n === 1 ? "Delete show" : `Delete ${n} shows`,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setPicking(false);
    const supabase = createClient();
    const { error: del } = await supabase.from("entries").delete().in("id", picked);
    if (del) {
      setBusy(false);
      return setError("Couldn’t delete them. Try again.");
    }
    const paths = chosen.map((e) => e.photo_path).filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    setBusy(false);
    reset();
    router.refresh();
  }

  const newTripHref = `/app/trips/new?${new URLSearchParams({
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
    entries: picked.join(","),
  })}`;

  function toggle(id: string) {
    setPicking(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  // The list stays put in select mode: the rows gain a check circle and the
  // header and action bar change around them.
  return (
    <div className="flex flex-col gap-3">
      {/* "Seen" matches the Upcoming heading above it. The live line stays
          mounted (empty outside select mode) so screen readers announce it. */}
      <div>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 className="inline-flex items-baseline gap-1.5 text-title-2 font-display text-label">
            Seen
            <span className="text-subheadline font-sans font-normal tabular-nums text-label-secondary">{entries.length}</span>
          </h2>
          <Button variant="ghost" size="sm" onClick={selecting ? reset : () => setSelecting(true)}>
            {selecting ? "Cancel" : "Select"}
          </Button>
        </div>
        <p className="text-subheadline text-label-secondary" aria-live="polite">
          {selecting && (picked.length ? `${picked.length} selected` : "Pick shows to group into a trip")}
        </p>
      </div>
      <EntryList entries={entries} photos={photoMap} selection={selecting ? { picked, onToggle: toggle } : undefined} />

      {/* Sits on the tab bar (49px), or the bottom edge from md where the sidebar replaces it, like the log form's Save. */}
      {selecting && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+49px)] z-10 md:bottom-0 -mx-4 flex flex-col gap-3 bg-background/90 px-4 pt-3 pb-4 backdrop-blur">
          {picking && picked.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-separator bg-surface p-3 shadow-sm">
              <p className="text-subheadline font-medium text-label">Add to</p>
              <ul className="flex flex-col gap-1">
                {covering.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void addTo(t)}
                      className="flex min-h-11 w-full cursor-pointer flex-col items-start justify-center rounded-sm px-2 text-left hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40"
                    >
                      <span className="text-body text-label">{t.name}</span>
                      <span className="text-footnote text-label-secondary">{formatTripDates(t)}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <Link
                    href={newTripHref}
                    onClick={onDone}
                    className="flex min-h-11 items-center rounded-sm px-2 text-body font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    + New trip ({formatTripDates({ start_date: dates[0], end_date: dates[dates.length - 1] })})
                  </Link>
                </li>
              </ul>
              {others.length > 0 && (
                <p className="text-footnote text-label-secondary">
                  {others.length === 1 ? `“${others[0].name}” doesn’t` : `${others.length} other trips don’t`} cover all
                  these dates. A trip only holds shows within its dates.
                </p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!picked.length || busy} onClick={() => setPicking((p) => !p)}>
              {picked.length ? `Add ${picked.length} to a trip` : "Pick shows"}
            </Button>
            <button
              type="button"
              disabled={!picked.length || busy}
              onClick={() => void deletePicked()}
              className="min-h-[50px] cursor-pointer rounded-pill border border-separator bg-surface px-5 text-headline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
