import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { PublicEntryCard } from "@/components/profile/PublicEntryCard";
import { formatTripDates } from "@/lib/entries";
import { viewerContext } from "@/lib/follows";
import { getPublicTrip, type TripStats } from "@/lib/public-pages";
import { getReactions, NO_REACTIONS } from "@/lib/reactions";

// Public trip page, the recap behind a shared trip card (#16): the trip's
// name and dates, who went, its numbers, then each public show in date
// order. A trip is public when it holds a public show and the profile isn't
// private (RLS, via the publishable key); private shows in it are left out,
// and so are their counts. Each show has Like and Comment, read with the
// visitor's session. Its preview image is /api/og/trip/[id].

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function place(stats: TripStats) {
  return stats.cities.length === 1 ? stats.cities[0] : stats.cities.length > 1 ? `${stats.cities.length} cities` : null;
}

export async function generateMetadata({ params }: PageProps<"/t/[id]">): Promise<Metadata> {
  const { id } = await params;
  const found = await getPublicTrip(id);
  if (!found) return { title: "Not found — Stubbed", robots: { index: false } };
  const { trip, owner, stats, version } = found;
  const where = place(stats);
  const headline = `${plural(stats.shows, "show")}${stats.nights > 0 ? ` in ${plural(stats.nights, "night")}` : ""}${where ? ` in ${where}` : ""}`;
  const title = `${trip.name} — @${owner.handle} on Stubbed`;
  const description = `${headline}, ${formatTripDates(trip)}. @${owner.handle}’s trip on Stubbed.`;
  const image = { url: `/api/og/trip/${trip.id}?v=${version}`, width: 1200, height: 630, alt: `${trip.name}: ${headline}` };
  return {
    title,
    description,
    alternates: { canonical: `/t/${trip.id}` },
    openGraph: { type: "article", title: `${trip.name}: ${headline}`, description, url: `/t/${trip.id}`, images: [image] },
    twitter: { card: "summary_large_image", title: `${trip.name}: ${headline}`, description, images: [image] },
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
  const where = place(stats);
  const numbers: [string, string][] = [
    [String(stats.shows), stats.shows === 1 ? "Show" : "Shows"],
    [String(stats.venues), stats.venues === 1 ? "Theatre" : "Theatres"],
    ...(stats.nights > 0 ? [[String(stats.nights), stats.nights === 1 ? "Night" : "Nights"] as [string, string]] : []),
    ...(stats.average != null ? [[stats.average.toFixed(1), "Avg rating"] as [string, string]] : []),
  ];

  return (
    <>
      <section aria-labelledby="trip-name" className="flex flex-col gap-4 rounded-md border border-separator bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-1">
          <h1 id="trip-name" className="text-title font-display text-label">
            {trip.name}
          </h1>
          <p className="text-subheadline text-label-secondary">{[formatTripDates(trip), where].filter(Boolean).join(" · ")}</p>
        </div>
        <Link
          href={`/@${owner.handle}`}
          className="flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Avatar name={name} url={owner.avatar_url} size={40} />
          <span className="flex flex-col">
            <span className="text-subheadline font-semibold text-label">@{owner.handle}</span>
            {owner.display_name && <span className="text-footnote text-label-secondary">{owner.display_name}</span>}
          </span>
        </Link>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {numbers.map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-footnote text-label-secondary">{label}</dt>
              <dd className="text-title-2 font-display text-label tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

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
