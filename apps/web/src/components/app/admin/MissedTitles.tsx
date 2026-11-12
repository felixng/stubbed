"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Missed = { id: string; title: string; note: string | null };

// Titles a theatre has on that the run missed, on /app/backstage/crawl/runs/[id]:
// added and removed through admin functions, counted in the run's score.
export function MissedTitles({ runId, venueId, missed }: { runId: string; venueId: string | null; missed: Missed[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const { error } = await call();
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    after?.();
    startRefresh(() => {
      setBusy(false);
      router.refresh();
    });
  }

  const sb = () => createClient();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-footnote font-semibold text-label">Add a show it missed</p>
      {missed.length > 0 && (
        <ul className="flex flex-col">
          {missed.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 border-t border-separator py-1">
              <span className="text-subheadline text-label">{m.title}</span>
              <Button size="sm" variant="ghost" disabled={working} onClick={() => run(() => sb().rpc("admin_delete_missed_title", { missed_id: m.id }))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) run(() => sb().rpc("admin_add_missed_title", { for_run: runId, for_venue: venueId, missed_title: title }), () => setTitle(""));
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A title on the site that we missed"
          aria-label="A title we missed"
          maxLength={300}
          className="min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={working || !title.trim()}>
          Add
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
