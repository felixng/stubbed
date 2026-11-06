
import type { Copy } from "@/lib/cms/model";
import { Container } from "./Container";
import Image from "next/image";
import { LandingAction } from "./LandingAction";
import { cardAlt, storyAlt, type CardId } from "./alt-text";

export function Features({ copy }: { copy: Copy<"sharingLanding"> }) {
  // Stable mixed order: every card once, with the two reference stories interleaved.
  const cards = Object.keys(cardAlt) as CardId[];
  const stories = [
    ...cards.slice(0, 2), "placeholder-1",
    ...cards.slice(8, 11), ...cards.slice(2, 5), "placeholder-2",
    ...cards.slice(11), ...cards.slice(5, 8),
  ] as const;
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
        <div role="region" aria-label={copy.galleryLabel} tabIndex={0} className="relative mt-4 flex snap-x snap-proximity gap-4 overflow-x-auto pb-5 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:gap-6">
          {stories.map((story, index) => (
            <div key={story} className="w-[62%] shrink-0 snap-start sm:w-[38%] lg:w-[calc((100%-4.5rem)/4)]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-separator bg-fill shadow-sm">
                {story === "placeholder-1" || story === "placeholder-2" ? (
                  <Image src={`/landing/stories/${story}.webp`} alt={storyAlt[story]} fill sizes="(min-width: 1024px) 300px, 62vw" className="object-cover" />
                ) : (
                  <>
                    <Image src={`/landing/trip-photos/photo-${index % 4 + 1}.webp`} alt="" fill sizes="(min-width: 1024px) 300px, 62vw" className="object-cover brightness-75" />
                    <div className="absolute inset-0 flex items-center justify-center p-[8%]">
                      <Image src={`/landing/cards/${story}.webp`} alt={`Story mockup. ${cardAlt[story]}`} width={1080} height={1080} sizes="(min-width: 1024px) 250px, 52vw" className="h-auto w-full rounded-md shadow-lg" />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8"><LandingAction>{copy.cardCta}</LandingAction></div>
      </Container>
    </section>
  );
}
