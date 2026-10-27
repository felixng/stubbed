import Link from "next/link";

import { RatingStars } from "@/components/ui/RatingStars";
import { Wordmark } from "@/components/ui/Wordmark";
import { formatDate, WITH_WEEKDAY } from "@/lib/entries";
import { halfStep } from "@/lib/share-card";
import { Avatar } from "./Avatar";

// The shared card at the top of a public entry or trip page, drawn live in
// HTML so it reads and zooms at any width: the posted square card's dark
// stage with its coral glow (`.stage` in globals.css), the title as the
// page's h1, where and when, five stars, the photo, and the wordmark with
// @handle. Only public data: the share card's ordinals (show of the year,
// venue visits) come from `entry_card_stats`, which counts private shows, so
// they're left out. The 1200×630 image at /api/og/* stays for link previews.

const TITLE = "font-display text-title text-balance text-label sm:text-large-title";
const SETTLE = "motion-safe:animate-[stage-in_700ms_cubic-bezier(0.16,1,0.3,1)_both]";

// Wordmark on the left, @handle on the right, over a hairline, as on the card.
function StageFooter({ handle }: { handle: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-separator pt-3">
      <Wordmark size={22} />
      <span className="truncate text-subheadline text-label-secondary sm:text-body">@{handle}</span>
    </div>
  );
}

export function EntryHero({
  title,
  venue,
  date,
  rating,
  photoUrl,
  handle,
}: {
  title: string;
  venue: string; // "Belasco Theatre, New York", or "" with no venue
  date: string; // ISO day
  rating: number | null;
  photoUrl: string | null;
  handle: string;
}) {
  const words = (
    <div className={`flex flex-col gap-3 ${SETTLE}`}>
      <div className="flex flex-col gap-1.5">
        <h1 className={TITLE}>{title}</h1>
        <p className="text-subheadline text-label-secondary sm:text-body">
          {venue && <>{venue} · </>}
          <time dateTime={date} className="whitespace-nowrap">
            {formatDate(date, WITH_WEEKDAY)}
          </time>
        </p>
      </div>
      {rating != null && <RatingStars value={rating} size={24} />}
    </div>
  );
  return (
    <header className="stage relative overflow-hidden rounded-lg border border-separator shadow-lg">
      {photoUrl ? (
        // The photo fills the square; a dark wash from the bottom keeps the
        // words readable on any picture.
        <div className="relative grid aspect-square sm:aspect-4/3 md:aspect-video">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, EXIF stripped on upload */}
          <img
            src={photoUrl}
            alt={`Photo from ${title}`}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="relative flex flex-col justify-end gap-4 bg-linear-to-t from-black via-black/75 via-45% to-transparent to-75% p-5 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)] sm:p-7">
            {words}
            <StageFooter handle={handle} />
          </div>
        </div>
      ) : (
        <div className="flex aspect-4/3 flex-col justify-end gap-4 p-5 sm:aspect-auto sm:min-h-80 sm:p-7">
          {words}
          <StageFooter handle={handle} />
        </div>
      )}
    </header>
  );
}

export function TripHero({
  name,
  dates,
  place,
  headline,
  average,
  photos,
  handle,
}: {
  name: string;
  dates: string; // "4 Oct – 8 Oct 2026"
  place: string | null; // "New York", "3 cities", or null
  headline: string; // "4 shows in 5 nights", public shows only
  average: number | null;
  photos: { src: string; alt: string }[];
  handle: string;
}) {
  const tiles = photos.slice(0, 4);
  // 1 photo runs wide; 2 or 3 sit in a row; 4 make a 2×2 grid, a row from sm.
  const grid = tiles.length === 4 ? "grid-cols-2 sm:grid-cols-4" : tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <header className="stage relative flex flex-col gap-5 overflow-hidden rounded-lg border border-separator p-5 shadow-lg sm:gap-6 sm:p-7">
      <div className={`flex flex-col gap-3 pt-6 sm:pt-10 ${SETTLE}`}>
        <div className="flex flex-col gap-1.5">
          <h1 className={TITLE}>{name}</h1>
          <p className="text-subheadline text-label-secondary sm:text-body">{[dates, place].filter(Boolean).join(" · ")}</p>
        </div>
        <p className="text-title-2 font-display text-tint-text">{headline}</p>
        {average != null && (
          <p className="flex items-center gap-2 text-subheadline text-label-secondary">
            <RatingStars value={halfStep(average)} size={22} />
            <span>average</span>
          </p>
        )}
      </div>
      {tiles.length > 0 && (
        <ul className={`grid gap-1 overflow-hidden rounded-md ${grid}`} aria-label="Photos">
          {tiles.map((p) => (
            <li key={p.src} className="bg-fill">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, EXIF stripped on upload */}
              <img src={p.src} alt={p.alt} className={`block w-full object-cover ${tiles.length === 1 ? "aspect-video" : tiles.length === 2 ? "aspect-square sm:aspect-4/3" : "aspect-square"}`} />
            </li>
          ))}
        </ul>
      )}
      <StageFooter handle={handle} />
    </header>
  );
}

// After the show or trip, before the join card: who logged it, and the
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
