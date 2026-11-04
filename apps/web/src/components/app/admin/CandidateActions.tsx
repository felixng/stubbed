"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type Found = { id: string; title: string; type: string; first_performed: number | null };
type Props = { id: string; matchId: string | null; matchTitle: string | null; matchSame: boolean };

// Add, Same as, or Not a show for one candidate on /app/admin/shows/candidates,
// through admin functions. Same as offers the closest existing show first, and
// a search for any other.
export function CandidateActions({ id, matchId, matchTitle, matchSame }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;
  const sb = () => createClient();

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await call();
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    startRefresh(() => {
      setBusy(false);
      router.refresh();
    });
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!find.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb().rpc("search_shows", { q: find });
    setBusy(false);
    if (error) return setError(error.message);
    setFound((data ?? []) as unknown as Found[]);
  }

  const same = (show: string) => run(() => sb().rpc("admin_candidate_same_as", { candidate_id: id, as_show: show }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {matchId && (
          <Button size="sm" variant={matchSame ? "primary" : "secondary"} disabled={working} onClick={() => same(matchId)}>
            Same as “{matchTitle}”
          </Button>
        )}
        <Button size="sm" variant={matchSame ? "secondary" : "primary"} disabled={working} onClick={() => run(() => sb().rpc("admin_add_candidate", { candidate_id: id }))}>
          Add
        </Button>
        <Button size="sm" variant="ghost" disabled={working} onClick={() => run(() => sb().rpc("admin_reject_candidate", { candidate_id: id }))}>
          Not a show
        </Button>
      </div>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Same as another show…"
          aria-label="Find the show this is the same as"
          className="min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-subheadline text-label focus-visible:outline-2 focus-visible:outline-focus"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={working || !find.trim()}>
          Find
        </Button>
      </form>
      {found && found.length === 0 && <p className="text-footnote text-label-secondary">No show found.</p>}
      {found && found.length > 0 && (
        <ul className="flex flex-col">
          {found.slice(0, 5).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 border-t border-separator py-1">
              <span className="text-subheadline text-label">
                {s.title}{" "}
                <span className="text-footnote text-label-secondary">
                  {s.type}
                  {s.first_performed ? ` · ${s.first_performed}` : ""}
                </span>
              </span>
              <Button size="sm" variant="ghost" disabled={working} onClick={() => same(s.id)}>
                Same as this
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
