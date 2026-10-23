import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CardHero, DiaryLink } from "@/components/profile/CardHero";
import { CommentThread } from "@/components/profile/CommentThread";
import { PublicEntryCard } from "@/components/profile/PublicEntryCard";
import { formatDate } from "@/lib/entries";
import { getEntryForViewer, type ViewedEntry } from "@/lib/public-pages";
import { getReactions, listComments, listLikers, NO_REACTIONS } from "@/lib/reactions";

// Public entry page, the link behind a shared card: the card itself (its
// preview image, so the page opens on what was shared), the show as a post,
// its likes and comments, and a link to the rest of @handle's diary; the
// layout adds the waitlist card after it for signed-out visitors. Public,
// logged entries on public profiles (RLS, via the publishable key), plus, for
// a signed-in viewer, what their session may see: a private profile's public
// entries, to its approved followers and owner. Those aren't indexed and have
// no preview image. Anything else is a 404. Its preview image is
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
  const image = { url: `/api/og/entry/${entry.id}?v=${version}`, width: 1200, height: 630, alt: `${at}, tracked on Stubbed` };
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
      {listed && <CardHero src={`/api/og/entry/${entry.id}?v=${version}`} alt={cardAlt(entry, owner.handle)} />}
      <PublicEntryCard
        entry={entry}
        photoUrl={photoUrl ?? undefined}
        handle={owner.handle}
        name={name}
        avatarUrl={owner.avatar_url}
        page
        social={{ viewerId, reactions: social }}
      />
      <CommentThread
        entryId={entry.id}
        ownerId={owner.id}
        viewerId={viewerId}
        comments={comments}
        likers={likers}
        likes={social.likes}
        loginHref={loginHref}
      />
      <DiaryLink handle={owner.handle} />
    </>
  );
}

// The card's words for screen readers: the show, where, when and the stars.
function cardAlt(entry: ViewedEntry["entry"], handle: string) {
  const where = [entry.venue?.name, entry.venue?.city].filter(Boolean).join(", ");
  return [
    `@${handle}’s card: ${entry.show.title}`,
    where,
    formatDate(entry.date, { day: "numeric", month: "long", year: "numeric" }),
    entry.rating != null ? `rated ${entry.rating} out of 5` : null,
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
