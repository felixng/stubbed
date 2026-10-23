"use client";

import Link from "next/link";
import { useRef } from "react";

// The "…" beside Edit profile on the Profile tab: the owner's less frequent
// profile actions. <details> gives keyboard and screen-reader support; the
// menu closes when an item is chosen, so it isn't still open when the
// (kept-alive) Profile page is shown again.
export function OwnerProfileMenu({ handle }: { handle: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  return (
    <details ref={menu} className="relative">
      <summary
        aria-label="More profile actions"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-pill text-label hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false" fill="currentColor">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </summary>
      <div className="absolute right-0 z-10 mt-1 min-w-52 overflow-hidden rounded-md border border-separator bg-surface shadow-lg">
        <Link
          href={`/@${handle}`}
          onClick={close}
          className="flex min-h-11 w-full items-center px-4 text-body text-label hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          View public profile
        </Link>
        <Link
          href="/app/import"
          onClick={close}
          className="flex min-h-11 w-full items-center border-t border-separator px-4 text-body text-label hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          Import shows
        </Link>
      </div>
    </details>
  );
}
