import type { Copy } from "@/lib/cms/model";
import Image from "next/image";
import { Container } from "./Container";

export function ImportHistory({ copy }: { copy: Copy<"sharingLanding"> }) {
  return (
    <section aria-labelledby="import-heading" className="py-16 sm:py-24">
      <Container className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
        <figure className="order-2 flex flex-col items-center gap-4 lg:order-1">
          <Image src="/landing/import-hub-placeholder.png" alt="Work-in-progress Import shows hub with options to add shows from photos or a Mezzanine export." width={750} height={1334} sizes="(min-width: 640px) 340px, 80vw" className="h-auto w-full max-w-[340px] rounded-lg border border-separator shadow-sm" />
        </figure>
        <div className="order-1 max-w-md lg:order-2">
          <p className="mb-4 text-subheadline font-semibold text-tint-text">{copy.importEyebrow}</p>
          <h2 id="import-heading" className="font-display text-[clamp(32px,3.5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-label">{copy.importHeading}</h2>
          <p className="mt-5 text-body leading-7 text-label-secondary">{copy.importBody}</p>
        </div>
      </Container>
    </section>
  );
}
