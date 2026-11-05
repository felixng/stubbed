import type { Copy } from "@/lib/cms/model";
import Image from "next/image";
import { Container } from "./Container";

export function DiaryAndStats({ copy }: { copy: Copy<"sharingLanding"> }) {
  return <>
    <section id="diary" aria-labelledby="diary-heading" className="scroll-mt-8 py-16 sm:py-24">
      <Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
        <div className="order-2 lg:order-1">
          <Image src="/landing/trip-summary.webp" alt={copy.tripImageAlt} width={1080} height={1080} sizes="(min-width: 1024px) 560px, 100vw" className="h-auto w-full rounded-lg" />
          <p className="mt-3 text-footnote text-label-secondary">{copy.diaryCaption} {copy.screenshotDemoCaption}</p>
        </div>
        <div className="order-1 max-w-md lg:order-2">
          <p className="mb-4 text-subheadline font-semibold text-tint-text">{copy.diaryEyebrow}</p>
          <h2 id="diary-heading" className="font-display text-[clamp(32px,3.5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-label">{copy.diaryHeading}</h2>
          <p className="mt-5 text-body leading-7 text-label-secondary">{copy.diaryBody}</p>
        </div>
      </Container>
    </section>
    <section aria-labelledby="year-heading" className="border-y border-separator bg-surface py-16 sm:py-24">
      <Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
        <div className="max-w-md">
          <p className="mb-4 text-subheadline font-semibold text-tint-text">{copy.yearEyebrow}</p>
          <h2 id="year-heading" className="font-display text-[clamp(32px,3.5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-label">{copy.yearHeading}</h2>
          <p className="mt-5 text-body leading-7 text-label-secondary">{copy.yearBody}</p>
        </div>
        <figure className="flex flex-col items-center gap-4">
          <Image src="/landing/insights-screen.webp" alt={copy.statsImageAlt} width={1206} height={2622} sizes="(min-width: 640px) 313px, 80vw" className="h-auto max-h-[680px] w-auto max-w-full rounded-lg border border-separator shadow-sm" />
          <figcaption className="text-center text-footnote text-label-secondary">{copy.screenshotDemoCaption}</figcaption>
        </figure>
      </Container>
    </section>
  </>;
}
