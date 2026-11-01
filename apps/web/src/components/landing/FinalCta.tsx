import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/landing/Container";

// The landing page's last word (#239): a large, separate call to action, as
// on the reference site, with the ticket mark above the heading.
export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading" className="pb-16 sm:pb-24">
      <Container>
        <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[32px] bg-surface px-6 py-14 text-center ring-1 ring-separator sm:py-20">
          <div
            aria-hidden="true"
            className="absolute -bottom-1/3 left-1/2 h-2/3 w-[min(90%,620px)] -translate-x-1/2 rounded-full bg-sweep opacity-25 blur-[80px]"
          />
          <Image src="/brand/stubbed-mark.svg" alt="" width={110} height={90} unoptimized className="relative h-auto w-[80px] sm:w-[96px]" />
          <h2
            id="final-cta-heading"
            className="relative font-display text-[clamp(40px,7vw,80px)] leading-[1] font-extrabold tracking-[-0.035em] text-balance text-label"
          >
            Start your theatre diary.
          </h2>
          <p className="relative max-w-[460px] text-[19px] leading-[1.45] text-pretty text-label-secondary">
            Free to sign up. Bring your past shows in from photos and ticket emails.
          </p>
          <div className="relative mt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex min-h-[54px] items-center justify-center rounded-pill bg-tint px-7 font-sans text-headline font-semibold text-on-tint shadow-btn transition-colors hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Sign up free
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[54px] items-center justify-center rounded-pill px-5 text-headline font-semibold text-tint-text transition-colors hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Sign in
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
