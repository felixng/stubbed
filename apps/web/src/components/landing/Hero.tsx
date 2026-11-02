import Link from "next/link";

import { Container } from "@/components/landing/Container";
import { Phone } from "@/components/landing/Screens";

// The hero, bold and iOS-native (#237, structure after Personal Best's
// site): a centred headline, one primary action and a way down the page,
// then three phones with the Home feed in front, on the app icon's sweep.
export function Hero() {
  return (
    // Clipped sideways only, so the glow fades out instead of ending in a line.
    <section className="overflow-x-clip pt-10 pb-20 sm:pt-16 sm:pb-28">
      <Container className="flex flex-col items-center gap-14 text-center sm:gap-16">
        <div className="flex max-w-[820px] flex-col items-center gap-6">
          <h1 className="font-display text-[clamp(48px,9vw,104px)] leading-[0.98] font-extrabold tracking-[-0.035em] text-balance text-label">
            A theatre diary made for sharing.
          </h1>
          <p className="max-w-[560px] text-[clamp(19px,2.2vw,23px)] leading-[1.4] text-pretty text-label-secondary">
            Keep your stage photos, curtain calls and stage door memories in one place. Log your visits, look back at
            your stats, and share your theatre life.
          </p>
          <div id="get-started" className="mt-2 flex scroll-mt-24 flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex min-h-[54px] items-center justify-center rounded-pill bg-tint px-7 font-sans text-headline font-semibold text-on-tint shadow-btn transition-colors hover:bg-tint-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Get started
              </Link>
              <a
                href="#features"
                className="inline-flex min-h-[54px] items-center justify-center gap-1.5 rounded-pill px-5 text-headline font-semibold text-tint-text transition-colors hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Explore features
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </a>
            </div>
            <p className="text-footnote text-label-secondary">Sign up with Apple, Google or your email.</p>
          </div>
        </div>

        {/* Three phones: logging and sharing either side of the Home feed.
            The side phones sit lower and smaller, and drop out on phones. */}
        <div className="relative flex w-full max-w-[1040px] items-start justify-center">
          <div
            aria-hidden="true"
            className="absolute top-[8%] left-1/2 h-[80%] w-[min(64vw,340px)] -translate-x-1/2 rounded-[40%] bg-sweep opacity-60 blur-[64px]"
          />
          <Phone
            shot="log"
            label="Logging The Lost Boys: a photo from the show, the Palace Theatre, the date and four and a half stars"
            sizes="(min-width: 640px) 250px, 0px"
            className="relative mt-[12%] hidden w-[min(26vw,270px)] translate-x-[8%] -rotate-3 sm:block"
          />
          <Phone
            shot="hero"
            label="Stubbed on an iPhone: the Home feed, with @sillyelphaba’s photo from The Lost Boys at the Palace Theatre"
            sizes="(min-width: 640px) 320px, 72vw"
            preload
            className="relative z-10 w-[min(72vw,330px)]"
          />
          <Phone
            shot="share"
            label="A share card for The Lost Boys: the photo, four and a half stars and the handle @sillyelphaba"
            sizes="(min-width: 640px) 250px, 0px"
            className="relative mt-[12%] hidden w-[min(26vw,270px)] -translate-x-[8%] rotate-3 sm:block"
          />
        </div>
      </Container>
    </section>
  );
}
