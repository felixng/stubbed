import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { HeroPhone } from "@/components/landing/Screens";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

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
          <div id="waitlist" className="mt-2 flex scroll-mt-24 flex-col gap-1">
            <WaitlistForm />
            <p className="text-footnote text-label-secondary">
              One email to confirm, then one at launch. Unsubscribe any time.{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Privacy Policy
              </Link>
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
              <HeroPhone label="The Stubbed diary on a phone: Hadestown, Operation Mincemeat, Les Misérables and Sunset Boulevard, each with its theatre, date and star rating" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
