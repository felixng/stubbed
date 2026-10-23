import Link from "next/link";
import { cache, Suspense } from "react";

import { viewerContext } from "@/lib/follows";

// The waitlist links on the public pages, for signed-out visitors only;
// sign-ups are still off. Profiles put the join card first (the (profile)
// layout); entry and trip pages, where a shared card leads, put it last (the
// (card) layout).
const JOIN_HREF = "/#waitlist";
const JOIN_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-pill bg-tint font-sans font-semibold text-on-tint shadow-btn transition-colors hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Each is also its own Suspense fallback, so signed-out visitors (most of
// them) get no layout shift while the session is checked.
export function SignedOutJoinButton() {
  return (
    <Suspense fallback={<HeaderJoinButton />}>
      <SignedOut>
        <HeaderJoinButton />
      </SignedOut>
    </Suspense>
  );
}

export function SignedOutJoinCard() {
  return (
    <Suspense fallback={<JoinCard />}>
      <SignedOut>
        <JoinCard />
      </SignedOut>
    </Suspense>
  );
}

async function SignedOut({ children }: { children: React.ReactNode }) {
  return (await isSignedIn()) ? null : children;
}

const isSignedIn = cache(async () => (await viewerContext()).userId !== null);

function HeaderJoinButton() {
  return (
    <Link href={JOIN_HREF} className={`${JOIN_BUTTON} px-4 text-[15px] leading-5`}>
      Join the waitlist
    </Link>
  );
}

function JoinCard() {
  return (
    <section
      aria-labelledby="join-heading"
      className="flex flex-col items-start gap-4 rounded-md border border-separator bg-tint-fill p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="join-heading" className="font-display text-title-2 text-label">
          Keep your own theatre diary
        </h2>
        <p className="max-w-[460px] text-subheadline text-label-secondary">
          Track the shows you see, rate them and share a card. Stubbed is in private beta, and the waitlist is open.
        </p>
      </div>
      <Link href={JOIN_HREF} className={`${JOIN_BUTTON} min-h-[50px] shrink-0 px-6 text-headline`}>
        Join the waitlist
      </Link>
    </section>
  );
}
