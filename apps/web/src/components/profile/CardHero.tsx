import Link from "next/link";

// The shared card at the top of a public entry or trip page: the same image
// as the link preview (/api/og/entry|trip/[id]), so someone who taps a shared
// link lands on what they saw in the message. The preview only renders for
// public entries and trips, so pages that only a signed-in viewer can see
// (a private profile's shows) leave it out. The image is dark like the share
// cards; `bg-label` holds its place while it loads.
export function CardHero({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-separator bg-label shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- our own 1200×630 preview route, already sized */}
      <img src={src} alt={alt} width={1200} height={630} fetchPriority="high" className="block aspect-[40/21] h-auto w-full" />
    </div>
  );
}

// After the show or trip, before the waitlist card: the rest of the diary.
export function DiaryLink({ handle }: { handle: string }) {
  return (
    <Link
      href={`/@${handle}`}
      className="inline-flex min-h-11 w-fit items-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      See @{handle}’s diary
    </Link>
  );
}
