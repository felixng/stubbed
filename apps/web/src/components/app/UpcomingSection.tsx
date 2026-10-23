"use client";

import Link from "next/link";
import { useId, useState } from "react";

// Planned shows at the top of the diary, soonest first. Collapsible, with a
// shortcut to start a trip in its header ("New trip", as on the Trips view). A <details> can't hold the link in
// its summary, so the toggle is a button.
export function UpcomingSection({ count, children }: { count: number; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(true);
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-title-2 font-display text-label">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            onClick={() => setOpen((o) => !o)}
            className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-label-secondary transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            Upcoming
            <span className="text-subheadline font-sans font-normal tabular-nums text-label-secondary">{count}</span>
          </button>
        </h2>
        <Link
          href="/app/trips/new"
          className="text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline"
        >
          + New trip
        </Link>
      </div>
      <div id={`${id}-list`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
