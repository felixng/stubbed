import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/ui/Wordmark";

// Where Kit sent people after they tapped the link in the old waitlist
// confirmation email (Kit form → Incentive → redirect URL). Sign-up is open
// now (#149), so it points them there; kept for links in old emails.
export const metadata: Metadata = {
  title: "You’re in — Stubbed",
  robots: { index: false, follow: false },
};

// Always light, like the landing page (owner's call).
export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default function ConfirmedPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-8 text-center">
        <Wordmark size={44} href="/" mark />
        <div className="flex w-full flex-col items-center gap-3 rounded-md border border-separator bg-surface px-6 py-10 shadow-sm">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-pill bg-tint-fill text-title-2 text-tint-text"
          >
            ✓
          </span>
          <h1 className="text-title-2 font-display text-label">You’re in</h1>
          <p className="text-subheadline text-label-secondary">
            Thanks for confirming your email. Stubbed is open now: create your
            account and start your theatre diary.
          </p>
        </div>
        <Link
          href="/signup"
          className="inline-flex min-h-[50px] items-center rounded-pill bg-tint px-6 text-headline font-semibold text-on-tint shadow-btn hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Sign up free
        </Link>
      </div>
    </main>
  );
}
