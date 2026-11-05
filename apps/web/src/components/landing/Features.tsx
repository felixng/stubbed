"use client";

import { useId, useRef, useState } from "react";
import type { Copy } from "@/lib/cms/model";
import { Container } from "./Container";
import { AssetPlaceholder } from "./AssetPlaceholder";
import { LandingAction } from "./LandingAction";

export function Features({ copy }: { copy: Copy<"sharingLanding"> }) {
  const cards = [copy.card0, copy.card1, copy.card2, copy.card3, copy.card4, copy.card5, copy.card6, copy.card7];
  // Selection is intentionally preserved on return; this is a browsing choice.
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const slides = useRef<(HTMLDivElement | null)[]>([]);
  const track = useRef<HTMLDivElement>(null);
  const id = useId();
  function select(index: number, focus = false) {
    setActive(index);
    const slide = slides.current[index];
    if (slide && track.current) track.current.scrollTo({ left: slide.offsetLeft - track.current.offsetLeft, behavior: "instant" });
    if (focus) tabs.current[index]?.focus();
  }
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % cards.length
      : event.key === "ArrowLeft" ? (index + cards.length - 1) % cards.length
      : event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }
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
        <div ref={track} onScroll={() => {
          if (!track.current) return;
          const left = track.current.scrollLeft;
          let nearest = 0;
          slides.current.forEach((slide, index) => {
            if (slide && Math.abs(slide.offsetLeft - track.current!.offsetLeft - left) < Math.abs((slides.current[nearest]?.offsetLeft ?? 0) - track.current!.offsetLeft - left)) nearest = index;
          });
          setActive(nearest);
        }} className="relative mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-5 [scrollbar-width:thin] sm:gap-6">
          {cards.map((label, index) => (
            <div key={index} ref={(el) => { slides.current[index] = el; }} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} tabIndex={active === index ? 0 : -1} className="w-[82%] shrink-0 snap-start scroll-mr-4 focus-visible:outline-2 focus-visible:outline-focus sm:w-[42%] lg:w-[31%]">
              <div className="aspect-square"><AssetPlaceholder label={label} status={copy.placeholder} /></div>
            </div>
          ))}
          {/* End space lets the final card align with its tab just like the first. */}
          <div aria-hidden="true" className="w-[18%] shrink-0 sm:w-[58%] lg:w-[69%]" />
        </div>
        <div role="tablist" aria-label={copy.galleryLabel} className="mt-2 flex flex-wrap gap-2">
          {cards.map((label, index) => <button key={index} ref={(el) => { tabs.current[index] = el; }} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={active === index} aria-controls={`${id}-panel-${index}`} tabIndex={active === index ? 0 : -1} onClick={() => select(index)} onKeyDown={(event) => onKeyDown(event, index)} className={`min-h-11 cursor-pointer rounded-pill px-4 text-footnote font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${active === index ? "bg-label text-background" : "bg-fill text-label hover:bg-separator"}`}>{label}</button>)}
        </div>
        <div className="mt-8"><LandingAction>{copy.cardCta}</LandingAction></div>
      </Container>
    </section>
  );
}
