import Link from "next/link";
import { getCopy } from "@/lib/cms/content";
import { Container } from "./Container";
import Image from "next/image";
import { LandingAction } from "./LandingAction";

export async function Hero() {
  const copy = await getCopy("sharingLanding");
  return (
    <section className="py-8 sm:py-12 lg:pb-20">
      <Container className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div className="max-w-xl">
          <p className="mb-5 text-subheadline font-semibold text-tint-text">{copy.eyebrow}</p>
          <h1 className="font-display text-[clamp(40px,5.3vw,72px)] leading-[1.04] font-extrabold tracking-[-0.04em] text-balance text-label">{copy.headline}</h1>
          <p className="mt-6 max-w-md text-[20px] leading-7 text-label-secondary">{copy.intro}</p>
          <div id="get-started" className="mt-8 flex scroll-mt-24 flex-wrap items-center gap-x-6 gap-y-3">
            <LandingAction>{copy.signup}</LandingAction>
            <Link href="#diary" className="inline-flex min-h-11 items-center gap-2 text-subheadline font-semibold text-label underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{copy.sampleLink}<span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className="landing-hero-fan" role="group" aria-label={copy.heroAsset}>
          {[
            { id: "name-lost-boys", alt: copy.cardLostBoysRatingAlt, position: "landing-fan-left" },
            { id: "activity", alt: copy.cardActivityAlt, position: "landing-fan-right" },
            { id: "stats-mincemeat", alt: copy.cardPhotoDataAlt, position: "landing-fan-centre" },
          ].map(card => (
            <div key={card.id} className={`landing-fan-card ${card.position} overflow-hidden rounded-md bg-surface`}>
              <Image src={`/landing/cards/${card.id}.webp`} alt={card.alt} width={1080} height={1080} sizes="(min-width: 1024px) 360px, (min-width: 640px) 385px, 62vw" preload className="h-auto w-full" />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
