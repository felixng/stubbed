import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CardHero, LoggedBy } from "@/components/profile/CardHero";
import { CommentThread } from "@/components/profile/CommentThread";
import { EntryReactions } from "@/components/profile/EntryReactions";
import { PublicEntryCard } from "@/components/profile/PublicEntryCard";
import { formatDate, WITH_WEEKDAY } from "@/lib/entries";
import { getEntryForViewer, type ViewedEntry } from "@/lib/public-pages";
import { getReactions, listComments, listLikers, NO_REACTIONS } from "@/lib/reactions";

// Public entry page, the link behind a shared card: the card itself (its
// preview image, so the page opens on what was shared), then only what the
// card lacks: the note, likes and comments, and who logged it with a link to
// the rest of their diary. The layout adds the waitlist card after it for
// signed-out visitors. Public, logged entries on public profiles (RLS, via
// the publishable key), plus, for a signed-in viewer, what their session may
// see: a private profile's public entries, to its approved followers and
// owner. Those aren't indexed and have no preview image, so the show is a
// post instead of a card. Anything else is a 404. Its preview image is
// /api/og/entry/[id].

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  const { id } = await params;
  const found = await getEntryForViewer(id);
  if (!found) return { title: "Not found — Stubbed", robots: { index: false } };
  const { entry, owner, version } = found;
  const at = entry.venue ? `${entry.show.title} at ${entry.venue.name}` : entry.show.title;
  const title = `${at} — @${owner.handle} on Stubbed`;
  if (!found.listed) return { title, robots: { index: false } };
  const description = [
    `@${owner.handle} saw ${entry.show.title}${entry.venue?.city ? ` in ${entry.venue.city}` : ""} on ${formatDate(entry.date, { day: "numeric", month: "long", year: "numeric" })}`,
    entry.rating != null ? `and rated it ${entry.rating} out of 5` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .concat(".");
  const image = { url: `/api/og/entry/${entry.id}?v=${version}`, width: 1200, height: 630, alt: `${at}, logged on Stubbed` };
  return {
    title,
    description,
    alternates: { canonical: `/e/${entry.id}` },
    openGraph: { type: "article", title: at, description, url: `/e/${entry.id}`, images: [image] },
    twitter: { card: "summary_large_image", title: at, description, images: [image] },
  };
}

async function Entry({ params }: PageProps<"/e/[id]">) {
  const { id } = await params;
  const found = await getEntryForViewer(id);
  if (!found) notFound();
  const { entry, owner, photoUrl, supabase, viewerId, version, listed } = found;
  const [reactions, comments, likers] = await Promise.all([
    getReactions(supabase, [entry.id]),
    listComments(supabase, entry.id),
    listLikers(supabase, entry.id),
  ]);
  const social = reactions.get(entry.id) ?? NO_REACTIONS;
  const name = owner.display_name || `@${owner.handle}`;
  const loginHref = `/login?next=${encodeURIComponent(`/e/${entry.id}`)}`;
  return (
    <>
      {listed ? (
        // The card already shows the show, where, when, the stars and the
        // photo, so none of them are repeated under it.
        <>
          <CardHero src={`/api/og/entry/${entry.id}?v=${version}`} alt={cardAlt(entry, owner.handle)} />
          <section aria-label="Note and likes" className="flex flex-col gap-3 px-1">
            {entry.note && (
              <p className="text-body whitespace-pre-line text-label">
                <span className="font-semibold">@{owner.handle} </span>
                {entry.note}
              </p>
            )}
            <TripChips trips={entry.collections} />
            <EntryReactions entryId={entry.id} reactions={social} viewerId={viewerId} commentsHref="#comments" loginHref={loginHref} />
          </section>
        </>
      ) : (
        <PublicEntryCard
          entry={entry}
          photoUrl={photoUrl ?? undefined}
          handle={owner.handle}
          name={name}
          avatarUrl={owner.avatar_url}
          page
          social={{ viewerId, reactions: social }}
        />
      )}
      <CommentThread
        entryId={entry.id}
        ownerId={owner.id}
        viewerId={viewerId}
        comments={comments}
        likers={likers}
        likes={social.likes}
        loginHref={loginHref}
      />
      <LoggedBy handle={owner.handle} displayName={owner.display_name} avatarUrl={owner.avatar_url} />
    </>
  );
}

// The public trips this show is part of (RLS hides private ones), each
// linking to its trip page. The card doesn't show them.
function TripChips({ trips }: { trips: ViewedEntry["entry"]["collections"] }) {
  if (trips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Trips">
      {trips.map((c) => (
        <li key={c.id}>
          <Link
            href={`/t/${c.id}`}
            className="inline-flex min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// The card's words for screen readers, as drawn on it: the show, where, when
// and the stars. The page doesn't repeat them as visible text.
function cardAlt(entry: ViewedEntry["entry"], handle: string) {
  const where = [entry.venue?.name, entry.venue?.city].filter(Boolean).join(", ");
  return [
    `@${handle}’s card: ${entry.show.title}`,
    where,
    formatDate(entry.date, WITH_WEEKDAY),
    entry.rating != null ? `rated ${entry.rating} out of 5 stars` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function EntryPage(props: PageProps<"/e/[id]">) {
  return (
    <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
      <Entry {...props} />
    </Suspense>
  );
}
