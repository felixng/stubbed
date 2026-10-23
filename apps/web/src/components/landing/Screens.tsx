"use client";

import { useEffect, useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { Poster } from "@/components/ui/Poster";
import { RatingStars } from "@/components/ui/RatingStars";
import { ShowRow } from "@/components/ui/ShowRow";
import { Wordmark } from "@/components/ui/Wordmark";
import { renderCard, type CardData } from "@/lib/share-card";

// The landing page's pictures of the app, drawn with the app's own components
// and sample theatre data instead of screenshots, so they stay sharp, follow
// the tokens and never show a real person's diary. Venues carry no city
// (public copy never names one) and the sample handle is @sillyelphaba.

export const SAMPLE_HANDLE = "sillyelphaba";

const DIARY = [
  { title: "Hadestown", venue: "Lyric Theatre", date: "18 Oct 2026", rating: 4.5 },
  { title: "Operation Mincemeat", venue: "Fortune Theatre", date: "2 Oct 2026", rating: 5 },
  { title: "Les Misérables", venue: "Sondheim Theatre", date: "9 Aug 2026", rating: 4 },
  { title: "Sunset Boulevard", venue: "Savoy Theatre", date: "20 Jul 2026", rating: 3.5 },
  { title: "Stereophonic", venue: "Duke of York’s Theatre", date: "14 Jun 2026", rating: 5 },
];

const CARD: CardData = {
  title: "Hadestown",
  venue: "Lyric Theatre",
  where: "Lyric Theatre",
  date: "18 Oct 2026",
  year: 2026,
  rating: 4.5,
  showOfYear: 14,
  venueVisit: 2,
  timesSeen: 2,
  handle: SAMPLE_HANDLE,
};

// A labelled picture: screen readers get one description, not the parts.
function Picture({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className={className}>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-separator rounded-md border border-separator bg-surface px-4 shadow-sm">
      {children}
    </div>
  );
}

// The hero: the diary inside a phone, as the app looks at phone width.
export function HeroPhone({ label }: { label: string }) {
  return (
    <Picture
      label={label}
      className="relative w-[372px] max-w-full overflow-hidden rounded-[48px] border-[10px] border-surface bg-background shadow-lg ring-1 ring-separator"
    >
      <div className="flex items-center justify-between border-b border-separator px-5 pt-8 pb-3">
        <Wordmark size={20} />
        <span className="text-caption text-label-secondary">@{SAMPLE_HANDLE}</span>
      </div>
      <div className="flex flex-col gap-3 px-4 pt-4 pb-8">
        <p className="font-display text-title-2 text-label">Diary</p>
        <List>
          {DIARY.slice(0, 4).map((entry) => (
            <ShowRow key={entry.title} {...entry} />
          ))}
        </List>
      </div>
    </Picture>
  );
}

// "Log a show": the form after a photo, filled in.
export function TrackScreen() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-title-2 text-label">Log a show</p>
      <List>
        <Field label="Show" value="Hadestown" />
        <Field label="Theatre" value="Lyric Theatre" />
        <Field label="Date" value="Sat, 18 Oct 2026" />
        <div className="flex items-center justify-between py-3">
          <span className="text-body text-label">Rating</span>
          <RatingStars value={4.5} size={20} />
        </div>
      </List>
      <div className="rounded-md border border-separator bg-surface p-4 text-body text-label shadow-sm">
        The staging of “Wait for Me” stayed with me all the way home.
      </div>
      <span className="mt-1 inline-flex min-h-[50px] items-center justify-center rounded-pill bg-tint px-6 text-headline font-semibold text-on-tint shadow-btn">
        Save
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-body text-label-secondary">{label}</span>
      <span className="truncate text-body text-label">{value}</span>
    </div>
  );
}

// The real share card, drawn by the same code as in the app (no photo).
export function ShareScreen() {
  const [src, setSrc] = useState<string | null>(null);

  // Drawn once. The URL is never revoked: state outlives a hidden page (see
  // CLAUDE.md), and one small image for the page's life costs nothing.
  useEffect(() => {
    if (src) return;
    let cancelled = false;
    renderCard("square", CARD, null)
      .then((blob) => {
        if (!cancelled) setSrc(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-label">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob drawn on the device
          <img src={src} alt="" className="size-full" />
        )}
      </div>
      <span className="inline-flex min-h-[50px] items-center justify-center rounded-pill bg-tint px-6 text-headline font-semibold text-on-tint shadow-btn">
        Share to Stories
      </span>
    </div>
  );
}

export function HistoryScreen() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-title-2 text-label">Seen</p>
      <List>
        {DIARY.map((entry) => (
          <ShowRow key={entry.title} {...entry} />
        ))}
      </List>
    </div>
  );
}

export function PlanScreen() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-title-2 text-label">Upcoming</p>
      <List>
        <PlannedRow title="Wicked" meta="Apollo Victoria Theatre · 7 Nov 2026" />
        <PlannedRow title="Hamilton" meta="Victoria Palace Theatre · 21 Nov 2026" />
      </List>
      <p className="mt-2 font-display text-title-2 text-label">Trips</p>
      <List>
        <div className="flex flex-col gap-1 py-3">
          <span className="text-headline text-label">Festival week</span>
          <span className="text-subheadline text-label-secondary">4–10 Aug 2026 · 6 shows</span>
        </div>
        <div className="flex flex-col gap-1 py-3">
          <span className="text-headline text-label">Birthday weekend</span>
          <span className="text-subheadline text-label-secondary">12–14 Jun 2026 · 3 shows</span>
        </div>
      </List>
    </div>
  );
}

function PlannedRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <Poster title={title} className="w-14 flex-none" />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="text-headline text-label">{title}</p>
        <p className="w-full truncate text-subheadline text-label-secondary">{meta}</p>
        <Chip>Going</Chip>
      </div>
    </div>
  );
}
