import Link from "next/link";

import { RatingStars } from "@/components/ui/RatingStars";
import { formatDate, WITH_WEEKDAY, SHOW_TYPE_LABELS, type EntryRow } from "@/lib/entries";
import type { Comment, Reactions } from "@/lib/reactions";
import { Avatar } from "./Avatar";
import { EntryReactions, ShareAction } from "./EntryReactions";
import { FeedThread } from "./FeedThread";

// Who is looking (null when signed out) and the entry's likes and comments,
// for the Like and Comment row under the card. With `thread` (the feed), the
// entry's latest comments show inline with a box to add one; `ownerId` lets
// the owner delete any of them.
export type CardSocial = {
  viewerId: string | null;
  reactions: Reactions;
  thread?: { ownerId: string; latest: Comment[] };
};

// One public entry, as a post, laid out like Instagram: who and when, then the
// photo edge to edge with the show, where and stars on it (over a dark
// gradient, so they read on any photo), then Like and Comment, the note as a
// caption after the handle, and trip chips. Without a photo, the show, where
// and stars sit under the header instead. Used on profiles, trip pages and the entry's own page
// (`page`: the title is the page's h1 and doesn't link to itself). Only public
// trips appear as chips (RLS hides links to private ones), each linking to its
// trip page. On a trip page (`inTrip`), the header and that trip's chip are
// left out, since the page already says whose trip it is; the date stays.
// The feed points `href` and `tripHref` at the app's own pages for your own
// shows, and can pass `href={null}` where no page would open; `badge` marks
// your private shows. For your own shows, `editHref` puts an Edit button top
// right and `shareHref` adds Share next to Comment (or on its own when the show
// takes no likes or comments).
// With `social`, the card ends with Like and Comment; signed-out visitors
// sign in and come back to `loginNext`. With `social.thread`, the comments
// follow the caption and trips, inline.
export function PublicEntryCard({
  entry,
  photoUrl,
  handle,
  name,
  avatarUrl,
  page = false,
  level = 3,
  inTrip,
  href = `/e/${entry.id}`,
  tripHref = (id) => `/t/${id}`,
  badge,
  editHref,
  shareHref,
  social,
  loginNext,
}: {
  entry: EntryRow;
  photoUrl?: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  page?: boolean;
  // Heading level when not a page: 2 where cards sit right under the h1
  // (Home), 3 under a section heading.
  level?: 2 | 3;
  inTrip?: string;
  href?: string | null;
  tripHref?: (id: string) => string | null;
  badge?: string;
  editHref?: string;
  shareHref?: string;
  social?: CardSocial;
  loginNext?: string;
}) {
  const Title = page ? "h1" : level === 2 ? "h2" : "h3";
  const trips = entry.collections.filter((c) => c.id !== inTrip);
  const where = [entry.venue?.name, entry.venue?.city].filter(Boolean).join(", ");
  const onPhoto = Boolean(photoUrl);
  const hasFooter = Boolean(social || shareHref || entry.note || trips.length > 0);
  // On the photo, the title link covers the whole photo, so tapping the photo
  // opens the show.
  const titleLink = `underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus${onPhoto ? " after:absolute after:inset-0" : ""}`;
  const show = (
    <div className="flex flex-col gap-1">
      <Title id={`entry-${entry.id}-title`} className={`${page ? "text-title" : "text-title-2"} font-display ${onPhoto ? "text-white" : "text-label"}`}>
        {page || !href ? (
          entry.show.title
        ) : (
          <Link href={href} className={titleLink}>
            {entry.show.title}
          </Link>
        )}
      </Title>
      <p className={`text-subheadline ${onPhoto ? "text-white/85" : "text-label-secondary"}`}>
        {SHOW_TYPE_LABELS[entry.show.type]} · {where}
      </p>
      {entry.rating != null && <RatingStars value={entry.rating} size={20} className="mt-1" />}
    </div>
  );
  const loginHref = `/login?next=${encodeURIComponent(loginNext ?? `/e/${entry.id}`)}`;
  // The note as a caption after the handle, then the trip chips.
  const caption = (
    <>
      {entry.note && (
        <p className="text-body whitespace-pre-line text-label">
          {!inTrip && <span className="font-semibold">@{handle} </span>}
          {entry.note}
        </p>
      )}
      {trips.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Trips and labels">
          {trips.map((c) => {
            const to = tripHref(c.id);
            return (
              <li key={c.id}>
                {to ? (
                  <Link
                    href={to}
                    className="inline-flex min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {c.name}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label">{c.name}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
  return (
    <article
      id={`entry-${entry.id}`}
      aria-labelledby={`entry-${entry.id}-title`}
      className={`flex scroll-mt-20 flex-col gap-3 overflow-hidden rounded-md border border-separator bg-surface ${onPhoto && !hasFooter ? "" : "pb-4"} shadow-sm target:outline-2 target:outline-offset-2 target:outline-focus`}
    >
      <div className="flex flex-col gap-3 px-4 pt-4">
        {inTrip ? (
          <p className="text-footnote text-label-secondary">
            <time dateTime={entry.date}>{formatDate(entry.date, WITH_WEEKDAY)}</time>
          </p>
        ) : (
          <header className="flex items-center gap-3">
            <Link href={`/@${handle}`} className="shrink-0 rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              <Avatar name={name} url={avatarUrl} size={40} />
              <span className="sr-only">@{handle}’s profile</span>
            </Link>
            <div className="min-w-0">
              <p className="truncate text-subheadline font-semibold text-label">
                <Link href={`/@${handle}`} className="underline-offset-2 hover:underline">
                  @{handle}
                </Link>
              </p>
              <p className="text-footnote text-label-secondary">
                <time dateTime={entry.date}>{formatDate(entry.date, WITH_WEEKDAY)}</time>
              </p>
            </div>
            {(badge || editHref) && (
              <div className="-mr-2 ml-auto flex shrink-0 items-center gap-1">
                {badge && <span className="rounded-pill bg-fill px-3 text-footnote leading-7 font-medium text-label-secondary">{badge}</span>}
                {editHref && (
                  <Link
                    href={editHref}
                    className="inline-flex size-11 items-center justify-center rounded-pill text-label-secondary transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                      <path
                        d="M14.5 5.5l4 4M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19 4 20Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="sr-only">Edit {entry.show.title}</span>
                  </Link>
                )}
              </div>
            )}
          </header>
        )}
        {!onPhoto && show}
      </div>
      {photoUrl && (
        <div className="relative bg-fill">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, EXIF stripped on upload */}
          <img src={photoUrl} alt={`Photo from ${entry.show.title}`} loading="lazy" className="aspect-4/5 max-h-[600px] w-full object-cover" />
          {/* The gradient is always dark, so the stars take the dark appearance's
              star and white empty stars, whatever the page's appearance. */}
          <div className="absolute inset-x-0 bottom-0 [--outline:rgb(255_255_255/0.75)] [--star:#ffd60a] bg-linear-to-t from-black/80 via-black/55 to-transparent px-4 pt-20 pb-4 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {show}
          </div>
        </div>
      )}
      {hasFooter && (
        <div className="flex flex-col gap-3 px-4">
          {social?.thread ? (
            <FeedThread
              entryId={entry.id}
              ownerId={social.thread.ownerId}
              viewerId={social.viewerId}
              reactions={social.reactions}
              latest={social.thread.latest}
              loginHref={loginHref}
              shareHref={shareHref}
            >
              {caption}
            </FeedThread>
          ) : (
            <>
              {social ? (
                <EntryReactions
                  entryId={entry.id}
                  reactions={social.reactions}
                  viewerId={social.viewerId}
                  commentsHref={page ? "#comments" : `/e/${entry.id}#comments`}
                  loginHref={loginHref}
                  shareHref={shareHref}
                />
              ) : (
                shareHref && (
                  <div className="-mx-3 -mb-2 flex items-center gap-1 text-label">
                    <ShareAction href={shareHref} />
                  </div>
                )
              )}
              {caption}
            </>
          )}
        </div>
      )}
    </article>
  );
}
