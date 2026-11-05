import type { Copy } from "@/lib/cms/model";
import Image from "next/image";
import { Container } from "./Container";

// Portrait stories (9:16) in the wild: the social half of "Share". The square
// card gallery above shows what you can make; this row shows what it looks like
// once it's posted. Kept out of the gallery on purpose, because mixed aspect
// ratios in one scroller read as ragged and bury both.
//
// The images in /landing/stories are placeholders (see the README there). Four
// slots reuse two images so the rhythm is visible; swap in real stories and
// give each its own alt text.
const stories = [
  { id: "placeholder-1", width: 703, height: 1250, alt: "storyAlt1" },
  { id: "placeholder-2", width: 335, height: 597, alt: "storyAlt2" },
  { id: "placeholder-1", width: 703, height: 1250, alt: "storyAlt1" },
  { id: "placeholder-2", width: 335, height: 597, alt: "storyAlt2" },
] as const;

export function Stories({ copy }: { copy: Copy<"sharingLanding"> }) {
  return (
    <section aria-labelledby="stories-heading" className="pt-16 sm:pt-24">
      <Container>
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="mb-4 text-subheadline font-semibold text-tint-text">{copy.storiesEyebrow}</p>
            <h2 id="stories-heading" className="font-display text-[clamp(32px,3.5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-label">{copy.storiesHeading}</h2>
          </div>
          <p className="max-w-sm text-body leading-7 text-label-secondary">{copy.storiesBody}</p>
        </div>
        <p className="mt-8 text-footnote text-label-secondary">{copy.storiesHelp} {copy.storiesCaption}</p>
        <div role="region" aria-label={copy.storiesLabel} tabIndex={0} className="relative mt-4 flex snap-x snap-proximity gap-4 overflow-x-auto pb-5 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:gap-6">
          {stories.map((story, index) => (
            <div key={`${story.id}-${index}`} className="w-[62%] shrink-0 snap-start sm:w-[38%] lg:w-[calc((100%-4.5rem)/4)]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-separator bg-fill shadow-sm">
                <Image
                  src={`/landing/stories/${story.id}.webp`}
                  alt={copy[story.alt]}
                  width={story.width}
                  height={story.height}
                  sizes="(min-width: 1024px) 300px, (min-width: 640px) 38vw, 62vw"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
