import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { Phone } from "@/components/landing/Screens";

export function Hero() {
  return (
    <section className="overflow-hidden pt-8 pb-16 sm:pb-20">
      <Container className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
        <div className="flex min-w-0 flex-col gap-6 lg:flex-[1_1_520px]">
          <h1 className="font-display text-[clamp(44px,7vw,76px)] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance text-label">
            Your theatre life, shared.
          </h1>
          <p className="max-w-[480px] text-[20px] leading-7 text-label-secondary">
            Log the shows you see. Rate them. Your diary, shared with
            the people who get it.
          </p>
          <div id="get-started" className="mt-2 flex scroll-mt-24 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex min-h-[50px] items-center justify-center rounded-pill bg-tint px-6 font-sans text-headline font-semibold text-on-tint shadow-btn transition-colors hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Sign up free
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[50px] items-center justify-center rounded-pill px-5 text-headline font-semibold text-tint-text transition-colors hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Sign in
              </Link>
            </div>
            <p className="text-footnote text-label-secondary">
              Sign up with Apple, Google or your email.
            </p>
          </div>
        </div>

        <div className="flex min-w-0 justify-center lg:flex-[1_1_400px]">
          <div className="relative flex w-full max-w-[540px] justify-center">
            {/* Decorative halo: a `glow` circle with a soft tint ring. */}
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 aspect-square w-[min(100%,520px)] -translate-1/2 rounded-full bg-glow shadow-[0_0_0_28px_color-mix(in_srgb,var(--tint)_16%,transparent)]"
            />
            <div className="relative">
              <Phone
                shot="hero"
                label="Stubbed on an iPhone: the Home feed, with @sillyelphaba’s photo from The Lost Boys at the Palace Theatre"
                sizes="(min-width: 640px) 320px, 72vw"
                preload
                className="w-[min(72vw,320px)]"
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
