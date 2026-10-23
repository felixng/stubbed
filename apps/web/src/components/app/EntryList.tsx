import Link from "next/link";

import { Poster } from "@/components/ui/Poster";
import { RatingStars } from "@/components/ui/RatingStars";
import { withFrom, type From } from "@/lib/back-link";
import { formatDate, type EntryRow } from "@/lib/entries";

const ROW = "flex items-center gap-4 px-4 py-3";

// A list of entries: photo (or initials), title, venue, date, stars (or
// "Going" for a planned show) and trip chips. Used by the diary and trip pages.
//
// With `selection`, the same rows become checkboxes in place: a check circle
// appears at the end of each row and a tap ticks it instead of opening the
// entry, so the list doesn't change under you.
//
// `from` sets where the entry page's back link goes (a trip). The diary
// leaves it out: Profile is the entry page's default.
export function EntryList({
  entries,
  photos,
  selection,
  from,
}: {
  entries: EntryRow[];
  photos: Map<string, string>;
  selection?: { picked: string[]; onToggle: (id: string) => void };
  from?: From;
}) {
  return (
    <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
      {entries.map((e) => (
        // The id lets the diary's calendar jump to the row; scroll-mt clears the sticky phone header.
        <li key={e.id} id={`entry-${e.id}`} className="scroll-mt-20 border-b border-separator last:border-b-0 target:bg-fill">
          {selection ? (
            <label
              className={`${ROW} relative cursor-pointer transition-colors has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus ${
                selection.picked.includes(e.id) ? "bg-tint-fill" : "hover:bg-fill"
              }`}
            >
              <Row entry={e} photos={photos} />
              <input
                type="checkbox"
                checked={selection.picked.includes(e.id)}
                onChange={() => selection.onToggle(e.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="grid size-6 flex-none place-items-center rounded-full border-2 border-separator text-on-tint transition-colors peer-checked:border-tint peer-checked:bg-tint [&>svg]:invisible peer-checked:[&>svg]:visible"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
                  <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </label>
          ) : (
            <Link
              href={from ? withFrom(`/app/entries/${e.id}`, from) : `/app/entries/${e.id}`}
              className={`${ROW} hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}
            >
              <Row entry={e} photos={photos} />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function Row({ entry: e, photos }: { entry: EntryRow; photos: Map<string, string> }) {
  return (
    <>
      <Poster
        title={e.show.title}
        poster={e.photo_path ? photos.get(e.photo_path) : undefined}
        className="w-14 flex-none"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="w-full truncate text-headline text-label">{e.show.title}</p>
        <p className="w-full truncate text-subheadline text-label-secondary">
          {[e.venue?.name, formatDate(e.date)].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {e.status === "planned" ? (
            <span className="rounded-pill bg-tint-fill px-2 text-caption leading-5 font-medium text-tint-text">
              Going
            </span>
          ) : (
            e.rating != null && <RatingStars value={e.rating} size={14} />
          )}
          {e.collections.map((c) => (
            <span key={c.id} className="rounded-pill bg-fill px-2 text-caption leading-5 text-label">
              {c.name}
            </span>
          ))}
          {e.visibility === "private" && <span className="text-caption text-label-secondary">Private</span>}
        </div>
      </div>
    </>
  );
}
