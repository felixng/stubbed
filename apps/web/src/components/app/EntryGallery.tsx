"use client";

import { useRouter } from "next/navigation";
import { reorderEntryGallery, type GalleryItem } from "@/lib/entry-media";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export function EntryGallery({ items, editableEntryId }: { items: GalleryItem[]; editableEntryId?: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const current = Math.min(index, items.length - 1);
  const item = items[current];
  if (!item) return null;
  async function makeCover() {
    if (!editableEntryId || !item || working) return;
    setWorking(true);
    setError("");
    try {
      await reorderEntryGallery(createClient(), editableEntryId,
        [item.id, ...items.filter((other) => other.id !== item.id).map((other) => other.id)]);
      setIndex(0);
      router.refresh();
    } catch {
      setError("Couldn’t change the cover. Try again.");
    } finally {
      setWorking(false);
    }
  }

  async function removeItem() {
    if (!editableEntryId || !item || working) return;
    setWorking(true);
    setError("");
    try {
      const { error: removeError } = await createClient().rpc("delete_entry_media", {
        p_entry_id: editableEntryId, p_media_id: item.id,
      });
      if (removeError) throw removeError;
      setIndex(Math.max(0, current - 1));
      router.refresh();
    } catch {
      setError("Couldn’t remove this item. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section aria-label="Entry media" className="grid gap-2">
      <div className="aspect-square overflow-hidden rounded-md bg-black">
        {item.kind === "video" ? (
          <video key={item.id} src={item.url} poster={item.poster ?? undefined} controls playsInline
            className="size-full object-contain" />
        ) : (
          // Signed images are short-lived and already sized for display.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={`Entry photo ${current + 1}`} className="size-full object-cover" />
        )}
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={current === 0} className="min-h-11 px-3 disabled:opacity-50"
            onClick={() => setIndex(current - 1)}>Previous</button>
          <span aria-live="polite">{current + 1} / {items.length}</span>
          <button type="button" disabled={current === items.length - 1} className="min-h-11 px-3 disabled:opacity-50"
            onClick={() => setIndex(current + 1)}>Next</button>
        </div>
      )}
      {editableEntryId && current > 0 && (
        <button type="button" disabled={working} className="min-h-11 justify-self-center px-3 text-tint-text"
          onClick={() => void makeCover()}>Make cover</button>
      )}
      {editableEntryId && items.length > 1 && (
        <button type="button" disabled={working} className="min-h-11 justify-self-center px-3 text-destructive"
          onClick={() => void removeItem()}>Remove {item.kind}</button>
      )}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>
  );
}
