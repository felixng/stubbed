
import type { Copy } from "@/lib/cms/model";
import { Container } from "./Container";
import { AssetPlaceholder } from "./AssetPlaceholder";
import { LandingAction } from "./LandingAction";

export function Features({ copy }: { copy: Copy<"sharingLanding"> }) {
  const cards = Array.from({ length: 8 });
  return (
    <section aria-labelledby="sharing-heading" className="border-y border-separator bg-surface py-16 sm:py-20">
      <Container>
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="mb-4 text-subheadline font-semibold text-tint-text">{copy.shareEyebrow}</p>
            <h2 id="sharing-heading" className="font-display text-[clamp(32px,3.5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-label">{copy.shareHeading}</h2>
          </div>
          <p className="max-w-sm text-body leading-7 text-label-secondary">{copy.shareBody}</p>
        </div>
        <p className="mt-8 text-footnote text-label-secondary">{copy.galleryHelp}</p>
        <div role="region" aria-label={copy.galleryLabel} tabIndex={0} className="relative mt-4 flex gap-4 overflow-x-auto pb-5 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:gap-6">
          {cards.map((_, index) => (
            <div key={index} className="w-[82%] shrink-0 sm:w-[42%] lg:w-[31%]">
              <div className="aspect-square"><AssetPlaceholder label={copy.cardDescription} status={copy.placeholder} /></div>
            </div>
          ))}
        </div>
        <div className="mt-8"><LandingAction>{copy.cardCta}</LandingAction></div>
      </Container>
    </section>
  );
}
