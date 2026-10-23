import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/ui/Wordmark";

// Where Kit sends people after they tap the link in the waitlist confirmation
// email (Kit form → Incentive → redirect URL). Nothing to look up: Kit has
// already confirmed them by the time they land here.
export const metadata: Metadata = {
  title: "You’re on the list — Stubbed",
  robots: { index: false, follow: false },
};

// Always light, like the landing page (owner's call).
export const viewport: Viewport = { themeColor: "#fff9f6" };

export default function ConfirmedPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-8 text-center">
        <Wordmark size={44} href="/" />
        <div className="flex w-full flex-col items-center gap-3 rounded-md border border-separator bg-surface px-6 py-10 shadow-sm">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-pill bg-tint-fill text-title-2 text-tint-text"
          >
            ✓
          </span>
          <h1 className="text-title-2 font-display text-label">You’re on the list</h1>
          <p className="text-subheadline text-label-secondary">
            Thanks for confirming your email. Stubbed is in private beta, and
            we’ll let you know as soon as a space opens up.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-pill px-4 text-subheadline font-semibold text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Back to Stubbed
        </Link>
      </div>
    </main>
  );
}
