import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DeleteEntryButton } from "@/components/app/DeleteEntryButton";
import { ShareSheet } from "@/components/app/share/ShareSheet";
import { BackLink } from "@/components/ui/BackLink";
import { formatDate, SHOW_TYPE_LABELS } from "@/lib/entries";
import type { CardData } from "@/lib/share-card";
import { getShareCard } from "@/lib/supabase/data";

export const metadata: Metadata = { title: "Entry" };

const plural = (n: number, noun: string) => `${n} ${n === 1 ? noun : `${noun}s`}`;

// The entry page is the share screen: sharing is the first thing on it, as
// in Hevy. The share cards carry the title, venue, date and rating; the
// details below add what the cards don't (type, note, trips, visibility).
async function Entry({ params, searchParams }: PageProps<"/app/entries/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const found = await getShareCard(id);
  if (!found) notFound();
  const { entry, photoUrl } = found;
  const planned = entry.status === "planned";
  const where = [entry.venue?.name, entry.venue?.city].filter(Boolean).join(", ");
  const data: CardData = {
    title: entry.show.title,
    venue: entry.venue?.name ?? null,
    where,
    date: formatDate(entry.date),
    year: Number(entry.date.slice(0, 4)),
    rating: entry.rating,
    showOfYear: found.showOfYear,
    venueVisit: found.venueVisit,
    timesSeen: found.timesSeen,
    handle: found.handle,
  };
  const slug = entry.show.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "show";

  return (
    <article className="flex flex-col gap-5">
      {/* A navigation bar: back to the diary on the left, Edit on the right,
          so the share controls under the card are only about sharing.
          Planned entries keep their Edit button in the card below instead. */}
      <div className="-my-2 flex items-center justify-between gap-3">
        <BackLink href="/app/profile">Profile</BackLink>
        {!planned && (
          <Link
            href={`/app/entries/${entry.id}/edit`}
            className="-mr-3 inline-flex min-h-11 items-center rounded-pill px-3 text-headline text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Edit
          </Link>
        )}
      </div>
      {query.new === "1" && (
        <p role="status" className="rounded-md bg-tint-fill px-4 py-3 text-subheadline font-medium text-label">
          {planned ? "Added to Upcoming in your diary." : "Saved to your diary. Share it?"}
        </p>
      )}
      {query.photo === "failed" && (
        <p role="alert" className="rounded-md bg-fill px-4 py-3 text-subheadline text-destructive">
          Saved, but the photo didn’t upload. Edit the entry to add it again.
        </p>
      )}
      {planned ? (
        // Nothing to share before the show: planned entries are owner-only.
        <div className="flex flex-col items-start gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
          <p className="text-subheadline text-label">
            You’re going on {formatDate(entry.date, { weekday: "long", day: "numeric", month: "long" })}. Once
            you’ve been, track it with your rating and share it.
          </p>
          <Link
            href={`/app/entries/${entry.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-pill bg-tint-fill px-4 text-[15px] leading-5 font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Edit
          </Link>
        </div>
      ) : (
        <ShareSheet
          subject={{ kind: "entry", data, photoUrl }}
          slug={slug}
          publicHref={found.isPublic ? `/e/${entry.id}` : null}
        />
      )}
      <section className="flex flex-col gap-3 border-t border-separator pt-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-title-2 font-display text-label">{entry.show.title}</h1>
          <p className="text-subheadline text-label-secondary">
            {[SHOW_TYPE_LABELS[entry.show.type], where].filter(Boolean).join(" · ")}
          </p>
          <p className="text-subheadline text-label-secondary">
            {formatDate(entry.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </header>
        {entry.note && <p className="text-body whitespace-pre-line text-label">{entry.note}</p>}
        {found.hasPage && (
          <Link
            href={`/e/${entry.id}#comments`}
            className="w-fit text-subheadline font-semibold text-tint-text underline-offset-2 hover:underline"
          >
            {found.reactions.likes || found.reactions.comments
              ? `${plural(found.reactions.likes, "like")} · ${plural(found.reactions.comments, "comment")}`
              : "No likes or comments yet"}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {entry.collections.map((c) => (
            <Link
              key={c.id}
              href={`/app/trips/${c.id}`}
              className="inline-flex min-h-7 items-center rounded-pill bg-fill px-3 text-footnote font-medium text-label hover:bg-tint-fill"
            >
              {c.name}
            </Link>
          ))}
          <span className="text-footnote text-label-secondary">
            {planned
              ? "Only you can see upcoming shows."
              : entry.visibility === "public"
                ? "Public"
                : "Private. Sharing the image doesn’t change that."}
          </span>
        </div>
      </section>
      <DeleteEntryButton id={entry.id} photoPath={entry.photo_path} />
    </article>
  );
}

export default function EntryPage(props: PageProps<"/app/entries/[id]">) {
  return (
    <Suspense fallback={<p className="text-subheadline text-label-secondary">Loading…</p>}>
      <Entry {...props} />
    </Suspense>
  );
}
