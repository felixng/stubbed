import Link from "next/link";

import { Container } from "@/components/landing/Container";

// The landing page's last word: sign up. Secondary, not coral; the hero's
// button stays the page's one coral fill.
export function SignUpReminder() {
  return (
    <section aria-labelledby="reminder-heading" className="pb-16 sm:pb-20">
      <Container className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="reminder-heading" className="font-display text-title-2 text-label">
          Start your theatre diary.
        </h2>
        <Link
          href="/signup"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Sign up free
        </Link>
      </Container>
    </section>
  );
}
