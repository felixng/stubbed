"use client";

import type { Copy } from "@/lib/cms/model";

import { useId, useRef, useState } from "react";

import { Container } from "@/components/landing/Container";
import { Phone, type Shot } from "@/components/landing/Screens";

// "How it works": four banners, and the phone beside them follows the one
// that is open. The screenshots come from the iOS app (Screens.tsx).
const features = (copy: Copy<"features">): { title: string; body: string; shot: Shot; alt: string }[] => [
  {
    title: copy.feature1Title,
    body: copy.feature1Body,
    shot: "log",
    alt: copy.feature1Alt,
  },
  {
    title: copy.feature2Title,
    body: copy.feature2Body,
    shot: "share",
    alt: copy.feature2Alt,
  },
  {
    title: copy.feature3Title,
    body: copy.feature3Body,
    shot: "history",
    alt: copy.feature3Alt,
  },
  {
    title: copy.feature4Title,
    body: copy.feature4Body,
    shot: "plan",
    alt: copy.feature4Alt,
  },
];

export function Features({ copy }: { copy: Copy<"features"> }) {
  const FEATURES = features(copy);
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  // Arrow keys move between banners, as in any tab list.
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = FEATURES.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <section aria-labelledby="features-heading" className="pt-6 pb-16 sm:pb-20">
      <Container className="flex flex-col gap-6">
        <h2 id="features-heading" className="font-display text-title text-label">
          {copy.heading}
        </h2>
        <div className="flex flex-col gap-8 lg:flex-row-reverse lg:items-center lg:gap-16">
          <div
            role="tabpanel"
            id={`${id}-panel`}
            aria-labelledby={`${id}-tab-${active}`}
            className="relative mx-auto aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-lg border border-separator bg-glow shadow-sm lg:mx-0 lg:flex-[1_1_420px]"
          >
            {/* All four stay mounted, so switching is an instant cross-fade.
                The phone sits at the top and runs off the bottom edge. */}
            {FEATURES.map(({ shot, alt, title }, index) => (
              <div
                key={title}
                aria-hidden={index !== active}
                className={`absolute inset-0 flex justify-center pt-8 transition-opacity duration-300 motion-reduce:transition-none sm:pt-10 ${
                  index === active ? "opacity-100" : "opacity-0"
                }`}
              >
                <Phone
                  shot={shot}
                  label={alt}
                  sizes="(min-width: 640px) 290px, 68vw"
                  className="h-fit w-[69%]"
                />
              </div>
            ))}
          </div>

          <div
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby="features-heading"
            className="flex flex-col gap-3 lg:flex-[1_1_520px]"
          >
            {FEATURES.map((feature, index) => {
              const selected = index === active;
              return (
                <button
                  key={feature.title}
                  ref={(el) => {
                    tabs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${index}`}
                  aria-selected={selected}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={`flex w-full cursor-pointer gap-4 rounded-lg border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-6 ${
                    selected
                      ? "border-separator bg-surface shadow-sm"
                      : "border-transparent hover:bg-fill"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-pill text-headline tabular-nums ${
                      selected ? "bg-label text-background" : "bg-fill text-label-secondary"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-display text-[20px] leading-9 font-bold text-label">
                      {feature.title}
                    </span>
                    {/* Kept in the page when closed so search engines read it. */}
                    <span
                      className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${
                        selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <span className="overflow-hidden text-body leading-6 text-pretty text-label-secondary">
                        <span className="block pt-1">{feature.body}</span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
