import Link from "next/link";

import { Avatar } from "./Avatar";

// The shared card at the top of a public entry or trip page: the same image
// as the link preview (/api/og/entry|trip/[id]), so someone who taps a shared
// link lands on what they saw in the message. The card is the page's h1: its
// alt text carries the facts drawn on it (show or trip, where, when, stars),
// and the page doesn't repeat them as visible text. The preview only renders
// for public entries and trips, so pages that only a signed-in viewer can see
// (a private profile's shows) leave it out. The image is dark like the share
// cards; `bg-label` holds its place while it loads.
export function CardHero({ src, alt }: { src: string; alt: string }) {
  return (
    <h1 className="overflow-hidden rounded-lg border border-separator bg-label shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- our own 1200×630 preview route, already sized */}
      <img src={src} alt={alt} width={1200} height={630} fetchPriority="high" className="block aspect-[40/21] h-auto w-full" />
    </h1>
  );
}

// After the show or trip, before the waitlist card: who logged it, and the
// rest of their diary.
export function LoggedBy({ handle, displayName, avatarUrl }: { handle: string; displayName: string | null; avatarUrl: string | null }) {
  return (
    <section aria-label={`Logged by @${handle}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <Link
        href={`/@${handle}`}
        className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Avatar name={displayName || `@${handle}`} url={avatarUrl} size={40} />
        <span className="flex min-w-0 flex-col">
          {displayName && <span className="truncate text-subheadline font-semibold text-label">{displayName}</span>}
          <span className={displayName ? "truncate text-footnote text-label-secondary" : "truncate text-subheadline font-semibold text-label"}>
            @{handle}
          </span>
        </span>
      </Link>
      <Link
        href={`/@${handle}`}
        className="inline-flex min-h-11 w-fit items-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        See @{handle}’s diary
      </Link>
    </section>
  );
}
