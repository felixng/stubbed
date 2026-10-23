"use client";

import { useEffect, useRef, useState } from "react";

import { loadFeedPage } from "@/app/app/feed-actions";
import type { FeedCursor, FeedItem } from "@/lib/supabase/data";
import { FeedCard } from "./FeedCard";

// Older pages of the home feed, after the server-rendered first page. The
// next page loads as you near the end (a little before the button scrolls
// into view), or when "Load more" is pressed: the button is the keyboard and
// screen-reader way, and the fallback if loading fails.
//
// The pages stay when you tap away and back (cacheComponents keeps the page),
// so the feed comes back where you left it. The Home page keys this on the
// first page's top show, so a new show starts the older pages over.
export function FeedMore({ start }: { start: FeedCursor }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<FeedCursor | null>(start);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  async function more() {
    if (!next || busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const page = await loadFeedPage(next);
      // A show can't appear twice: the cursor is strict. Guarding anyway keeps
      // React keys unique if a page is ever answered twice.
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.entry.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.entry.id))];
      });
      setNext(page.next);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  // Load ahead when the end comes near; not again after a failure, so a bad
  // connection doesn't loop (the button retries).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || failed) return;
    const observer = new IntersectionObserver((seen) => seen.some((s) => s.isIntersecting) && void more(), {
      rootMargin: "800px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe per page, not per render
  }, [next, failed]);

  return (
    <>
      {items.map((item) => (
        <FeedCard key={item.entry.id} item={item} />
      ))}
      <div ref={sentinel} className="flex min-h-11 flex-col items-center gap-2">
        {next ? (
          <>
            {failed && (
              <p role="alert" className="text-footnote text-destructive">
                Couldn’t load more shows.
              </p>
            )}
            <button
              type="button"
              onClick={() => void more()}
              disabled={loading}
              className="inline-flex min-h-11 items-center rounded-pill bg-tint-fill px-5 text-subheadline font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Loading…" : failed ? "Try again" : "Load more"}
            </button>
          </>
        ) : (
          <p className="text-footnote text-label-secondary">You’re all caught up.</p>
        )}
        <p role="status" className="sr-only">
          {loading ? "Loading more shows" : ""}
        </p>
      </div>
    </>
  );
}
