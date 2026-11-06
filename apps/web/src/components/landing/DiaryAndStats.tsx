import type { Copy } from "@/lib/cms/model";
import Image from "next/image";
import { Container } from "./Container";
import { statsImageAlt, tripImageAlt } from "./alt-text";

export function DiaryAndStats({ copy }: { copy: Copy<"sharingLanding"> }) {
  return <>
    <section id="diary" aria-labelledby="diary-heading" className="scroll-mt-8 py-16 sm:py-24">
      <Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
        <div className="order-2 lg:order-1">
          <Image src="/landing/broadway-trip-summary.webp" alt={tripImageAlt} width={1080} height={1080} sizes="(min-width: 1024px) 560px, 100vw" className="h-auto w-full rounded-lg" />
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
          <div className="relative aspect-[1/1.35] w-full max-w-[480px] overflow-hidden rounded-lg">
            <Image src="/landing/insights-screen.webp" alt={statsImageAlt} width={1206} height={2622} sizes="(min-width: 640px) 480px, 100vw" className="absolute top-0 left-0 h-auto w-full -translate-y-[28%]" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-b from-transparent to-surface" />
          </div>
        </figure>
      </Container>
    </section>
  </>;
}
