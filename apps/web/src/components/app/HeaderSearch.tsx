"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { FollowButton } from "@/components/profile/FollowButton";
import type { FollowStatus } from "@/lib/follows";
import { createClient } from "@/lib/supabase/client";

type Person = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  is_private: boolean;
  status: FollowStatus | null;
};

// Search people from the app header, as in Hevy's sidebar: type a handle or
// name (search_profiles in Postgres) and matches drop down under the header,
// each with a Follow button. Yourself is left out. Opening a profile clears
// the search; tapping elsewhere or Escape closes the list, and a half-typed
// search comes back when you focus the box again.
//
// The header is part of the app shell, which doesn't read the session, so the
// signed-in user's id comes from the browser session on the first search.
//
// In the desktop sidebar (`wide`), the box fills the sidebar and the list opens
// wider than it, over the page, so names and Follow buttons still fit.
export function HeaderSearch({ wide = false }: { wide?: boolean }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ q: string; people: Person[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  // Bumped after a follow or unfollow, to read the statuses again.
  const [round, setRound] = useState(0);
  const query = q.trim().replace(/^@/, "");

  useEffect(() => {
    if (query.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const [{ data, error }, { data: session }] = await Promise.all([
        supabase.rpc("search_profiles", { q: query }),
        supabase.auth.getSession(),
      ]);
      if (stale) return;
      if (error) {
        setFailed(true);
        return;
      }
      const userId = session.session?.user.id ?? null;
      const people = ((data ?? []) as Omit<Person, "status">[]).filter((p) => p.id !== userId);
      const { data: mine } =
        userId && people.length
          ? await supabase.from("follows").select("followee_id, status").eq("follower_id", userId).in("followee_id", people.map((p) => p.id))
          : { data: [] };
      if (stale) return;
      const status = new Map((mine ?? []).map((f) => [f.followee_id as string, f.status as FollowStatus]));
      setFailed(false);
      setResults({ q: query, people: people.map((p) => ({ ...p, status: status.get(p.id) ?? null })) });
      setViewerId(userId);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, round]);

  // Close on a tap or focus outside the box and its list.
  useEffect(() => {
    if (!open) return;
    function away(e: Event) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  function done() {
    setQ("");
    setOpen(false);
  }

  const shown = query.length >= 2 && results?.q === query ? results.people : null;
  const listOpen = open && query.length >= 2;

  return (
    <div
      ref={root}
      className={wide ? "relative w-full" : "min-w-0 flex-1 sm:relative"}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          input.current?.blur();
        }
      }}
    >
      <label htmlFor={`${id}-q`} className="sr-only">
        Search people by handle or name
      </label>
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-label-secondary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          ref={input}
          id={`${id}-q`}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-controls={`${id}-results`}
          className="min-h-10 w-full rounded-pill border border-separator bg-surface pr-2 pl-8 text-subheadline text-label placeholder:text-label-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </div>
      <div
        id={`${id}-results`}
        aria-live="polite"
        className={
          listOpen
            ? `absolute top-full z-30 mt-1 max-h-[70dvh] overflow-y-auto rounded-md border border-separator bg-surface shadow-lg ${
                wide ? "left-0 w-96" : "inset-x-4 sm:inset-x-0"
              }`
            : "sr-only"
        }
      >
        {!listOpen ? null : failed ? (
          <p className="px-4 py-3 text-subheadline text-destructive">Couldn’t search. Try again.</p>
        ) : shown == null ? (
          <p className="px-4 py-3 text-subheadline text-label-secondary">Searching…</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-3 text-subheadline text-label-secondary">No one matches “{query}”.</p>
        ) : (
          <ul>
            {shown.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-separator px-4 py-3 last:border-b-0">
                <Link
                  href={`/@${p.handle}`}
                  onClick={done}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <Avatar name={p.display_name || p.handle} url={p.avatar_url} size={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-subheadline font-semibold text-label">@{p.handle}</span>
                    {(p.display_name || p.is_private) && (
                      <span className="truncate text-footnote text-label-secondary">
                        {[p.display_name, p.is_private ? "Private" : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </Link>
                <FollowButton
                  profileId={p.id}
                  handle={p.handle}
                  isPrivate={p.is_private}
                  viewer={viewerId ? { id: viewerId, isOwner: false, status: p.status } : null}
                  onChanged={() => setRound((r) => r + 1)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
