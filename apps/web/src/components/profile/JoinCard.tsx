import Link from "next/link";
import { cache, Suspense } from "react";

import { viewerContext } from "@/lib/follows";

// The sign-up links on the public pages, for signed-out visitors only.
// Profiles put the join card first (the (profile)
// layout); entry and trip pages, where a shared card leads, put it last (the
// (card) layout). The card's button is the page's one coral fill; the header
// button is secondary, since the card renders on every page that has it.
// Like and comment prompts for visitors point at the card (`JOIN_ANCHOR`).
const JOIN_HREF = "/signup";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const HEADER_BUTTON = `inline-flex min-h-11 items-center justify-center rounded-pill bg-tint-fill px-4 font-sans text-subheadline font-semibold text-tint-text transition-colors hover:bg-fill ${FOCUS}`;

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

// The other half of the header slot: someone signed in (often the owner,
// looking at their own public page) gets a way back into the app instead of
// sign-up. No fallback, so signed-out visitors see no change.
export function SignedInAppLink() {
  return (
    <Suspense>
      <SignedIn>
        <Link href="/app" className={HEADER_BUTTON}>
          Open app
        </Link>
      </SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  return (await isSignedIn()) ? children : null;
}

const isSignedIn = cache(async () => (await viewerContext()).userId !== null);

function HeaderJoinButton() {
  return (
    <Link href={JOIN_HREF} className={HEADER_BUTTON}>
      Sign up
    </Link>
  );
}

function JoinCard() {
  return (
    <section
      id="join"
      aria-labelledby="join-heading"
      className="flex scroll-mt-20 flex-col items-start gap-4 rounded-md border border-separator bg-tint-fill p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="join-heading" className="font-display text-title-2 text-label">
          Keep your own theatre diary
        </h2>
        <p className="max-w-[460px] text-subheadline text-label-secondary">
          Log the shows you see, rate them and share a card. It’s free.
        </p>
      </div>
      <Link
        href={JOIN_HREF}
        className={`inline-flex min-h-[50px] shrink-0 items-center justify-center rounded-pill bg-tint px-6 font-sans text-headline font-semibold text-on-tint shadow-btn transition-colors hover:bg-tint-pressed ${FOCUS}`}
      >
        Sign up free
      </Link>
    </section>
  );
}
