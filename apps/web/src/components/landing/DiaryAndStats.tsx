import type { Copy } from "@/lib/cms/model";
import { AssetPlaceholder } from "./AssetPlaceholder";
import { Container } from "./Container";

export function DiaryAndStats({ copy }: { copy: Copy<"sharingLanding"> }) {
  return <>
    <section id="diary" aria-labelledby="diary-heading" className="scroll-mt-8 py-16 sm:py-24">
      <Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
        <div className="order-2 lg:order-1">
          <div className="aspect-[4/3] rounded-lg border border-separator bg-surface p-5 shadow-sm sm:p-8"><AssetPlaceholder label={copy.diaryAsset} status={copy.placeholder} /></div>
          <p className="mt-3 text-footnote text-label-secondary">{copy.diaryCaption}</p>
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
        <div className="grid grid-cols-[1fr_0.8fr] items-end gap-3 rounded-lg border border-separator bg-surface p-5 shadow-sm sm:gap-5 sm:p-8">
          <div className="aspect-[3/4]"><AssetPlaceholder label={copy.yearAsset} status={copy.placeholder} /></div>
          <div className="aspect-square"><AssetPlaceholder label={copy.yearCard} status={copy.placeholder} className="p-3" /></div>
        </div>
      </Container>
    </section>
  </>;
}
