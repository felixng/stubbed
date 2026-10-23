"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TRIP_SELECT, type Collection } from "@/lib/entries";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { DateField } from "./DateField";
import { fieldClass } from "./log/Typeahead";

const label = "text-subheadline font-medium text-label";

// Create or edit a trip: a name and its dates. A trip has no privacy setting:
// it's public when it holds a public show. A new trip can start with shows
// already in it (picked in the diary), with the dates prefilled to fit them.
// Once a new trip is created, the form starts over the next time it's shown
// (see useFreshOnReturn) instead of coming back filled in and still saving.
type Props = {
  initial?: Collection;
  prefill?: { start?: string; end?: string; entryIds?: string[] };
};

export function TripForm(props: Props) {
  const [round, setRound] = useState(0);
  const created = useFreshOnReturn(() => setRound((r) => r + 1));
  return <Fields key={round} {...props} onCreated={created} />;
}

function Fields({ initial, prefill, onCreated }: Props & { onCreated: () => void }) {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(initial?.start_date ?? prefill?.start ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? prefill?.end ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryIds = prefill?.entryIds ?? [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the trip a name.");
    if (!start || !end) return setError("Add the trip’s start and end dates.");
    if (end < start) return setError("The end date is before the start date.");
    setSaving(true);
    const supabase = createClient();
    const fields = { name: name.trim(), kind: "trip" as const, start_date: start, end_date: end };
    const { data, error: write } = initial
      ? await supabase.from("collections").update(fields).eq("id", initial.id).select(TRIP_SELECT).single()
      : await supabase.from("collections").insert(fields).select(TRIP_SELECT).single();
    if (write || !data) {
      setSaving(false);
      // The database keeps a trip's shows within its dates.
      return setError(
        write?.code === "23514"
          ? "Some shows in this trip fall outside these dates. Remove them from the trip first."
          : "Couldn’t save the trip. Try again.",
      );
    }
    if (!initial) onCreated();
    if (!initial && entryIds.length) {
      const { error: link } = await supabase
        .from("entry_collections")
        .insert(entryIds.map((entry_id) => ({ entry_id, collection_id: data.id })));
      if (link) {
        // The trip exists; its page lets the user add the shows again.
        router.push(`/app/trips/${data.id}?added=failed`);
        return;
      }
    }
    if (initial) {
      setSaving(false);
      router.refresh();
    } else {
      router.push(`/app/trips/${data.id}`);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className={label}>
          Name
        </label>
        <input
          id={`${id}-name`}
          className={fieldClass}
          value={name}
          maxLength={100}
          placeholder="NYC Oct 2026"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-start`} className={label}>
            From
          </label>
          <DateField id={`${id}-start`} compact placeholder="Start" value={start} onChange={setStart} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-end`} className={label}>
            To
          </label>
          <DateField id={`${id}-end`} compact placeholder="End" value={end} min={start || undefined} onChange={setEnd} />
        </div>
      </div>
      <p className="text-footnote text-label-secondary">
        {entryIds.length
          ? `The ${entryIds.length} show${entryIds.length === 1 ? "" : "s"} you picked will be added. `
          : ""}
        A trip holds shows dated within it, and is public when one of them is.
      </p>
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : initial ? "Save changes" : "Create trip"}
      </Button>
    </form>
  );
}
