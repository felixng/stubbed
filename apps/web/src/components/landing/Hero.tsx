import Link from "next/link";
import { getCopy } from "@/lib/cms/content";
import { Container } from "./Container";
import { AssetPlaceholder } from "./AssetPlaceholder";
import { LandingAction } from "./LandingAction";

export async function Hero() {
  const copy = await getCopy("sharingLanding");
  return (
    <section className="py-8 sm:py-12 lg:pb-20">
      <Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-xl">
          <p className="mb-5 text-subheadline font-semibold text-tint-text">{copy.eyebrow}</p>
          <h1 className="font-display text-[clamp(40px,5.3vw,72px)] leading-[1.04] font-extrabold tracking-[-0.04em] text-balance text-label">{copy.headline}</h1>
          <p className="mt-6 max-w-md text-[20px] leading-7 text-label-secondary">{copy.intro}</p>
          <div id="get-started" className="mt-8 flex scroll-mt-24 flex-wrap items-center gap-x-6 gap-y-3">
            <LandingAction>{copy.signup}</LandingAction>
            <Link href="#diary" className="inline-flex min-h-11 items-center gap-2 text-subheadline font-semibold text-label underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{copy.sampleLink}<span aria-hidden="true">↗</span></Link>
          </div>
          <p className="mt-3 text-footnote text-label-secondary">{copy.signupHelp}</p>
          <a href="https://www.instagram.com/stubbedapp/" className="mt-5 inline-flex min-h-11 items-center text-subheadline text-label-secondary hover:text-label focus-visible:outline-2 focus-visible:outline-focus">{copy.handle}</a>
        </div>
        <div className="mx-auto w-full max-w-[400px] rounded-lg border border-separator bg-surface p-4 shadow-sm sm:p-6">
          <div className="flex aspect-[4/5] items-center rounded-md bg-[image:var(--sweep)] p-5 sm:p-7">
            <div className="aspect-square w-full"><AssetPlaceholder label={copy.heroAsset} status={copy.placeholder} /></div>
          </div>
        </div>
      </Container>
    </section>
  );
}
