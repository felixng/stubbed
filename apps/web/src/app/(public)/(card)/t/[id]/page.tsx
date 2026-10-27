import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoggedBy, TripHero } from "@/components/profile/CardHero";
import { PublicEntryCard } from "@/components/profile/PublicEntryCard";
import { formatTripDates } from "@/lib/entries";
import { viewerContext } from "@/lib/follows";
import { getPublicTrip, type TripStats } from "@/lib/public-pages";
import { getReactions, NO_REACTIONS } from "@/lib/reactions";

// Public trip page, the recap behind a shared trip card (#16): the card
// itself (drawn live from its public shows), which already carries the trip's
// name, dates and numbers, so under it come only what it lacks: each public show in date
// order, then who went with a link to the rest of the diary. The layout adds
// the join card after it for signed-out visitors. A trip is public when
// it holds a public show and the profile isn't private (RLS, via the
// publishable key); private shows in it are left out, and so are their
// counts. Each show has Like and Comment, read with the visitor's session.
// Its preview image is /api/og/trip/[id].

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function place(stats: TripStats) {
  return stats.cities.length === 1 ? stats.cities[0] : stats.cities.length > 1 ? `${stats.cities.length} cities` : null;
}

function headline(stats: TripStats) {
  const where = place(stats);
  return `${plural(stats.shows, "show")}${stats.nights > 0 ? ` in ${plural(stats.nights, "night")}` : ""}${where ? ` in ${where}` : ""}`;
}

export async function generateMetadata({ params }: PageProps<"/t/[id]">): Promise<Metadata> {
  const { id } = await params;
  const found = await getPublicTrip(id);
  if (!found) return { title: "Not found — Stubbed", robots: { index: false } };
  const { trip, owner, stats, version } = found;
  const line = headline(stats);
  const title = `${trip.name} — @${owner.handle} on Stubbed`;
  const description = `${line}, ${formatTripDates(trip)}. @${owner.handle}’s trip on Stubbed.`;
  const image = { url: `/api/og/trip/${trip.id}?v=${version}`, width: 1200, height: 630, alt: `${trip.name}: ${line}` };
  return {
    title,
    description,
    alternates: { canonical: `/t/${trip.id}` },
    openGraph: { type: "article", title: `${trip.name}: ${line}`, description, url: `/t/${trip.id}`, images: [image] },
    twitter: { card: "summary_large_image", title: `${trip.name}: ${line}`, description, images: [image] },
  };
}

async function Trip({ params }: PageProps<"/t/[id]">) {
  const { id } = await params;
  const found = await getPublicTrip(id);
  if (!found) notFound();
  const { trip, owner, entries, photos, stats } = found;
  const { supabase, userId } = await viewerContext();
  const reactions = await getReactions(supabase, entries.map((e) => e.id));
  const name = owner.display_name || `@${owner.handle}`;
  const tripPhotos = entries.flatMap((e) => {
    const src = e.photo_path ? photos.get(e.photo_path) : undefined;
    return src ? [{ src, alt: `Photo from ${e.show.title}` }] : [];
  });

  return (
    <>
      <TripHero
        name={trip.name}
        dates={formatTripDates(trip)}
        place={place(stats)}
        headline={`${plural(stats.shows, "show")}${stats.nights > 0 ? ` in ${plural(stats.nights, "night")}` : ""}`}
        average={stats.average}
        photos={tripPhotos}
        handle={owner.handle}
      />
      <section aria-labelledby="shows-heading" className="flex flex-col gap-4">
        <h2 id="shows-heading" className="text-title-2 font-display text-label">
          The shows
        </h2>
        {entries.map((e) => (
          <PublicEntryCard
            key={e.id}
            entry={e}
            photoUrl={e.photo_path ? photos.get(e.photo_path) : undefined}
            handle={owner.handle}
            name={name}
            avatarUrl={owner.avatar_url}
            inTrip={trip.id}
            social={{ viewerId: userId, reactions: reactions.get(e.id) ?? NO_REACTIONS }}
            loginNext={`/t/${trip.id}`}
          />
        ))}
      </section>
      <LoggedBy handle={owner.handle} displayName={owner.display_name} avatarUrl={owner.avatar_url} />
    </>
  );
}

export default function TripPage(props: PageProps<"/t/[id]">) {
  return (
    <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
      <Trip {...props} />
    </Suspense>
  );
}
