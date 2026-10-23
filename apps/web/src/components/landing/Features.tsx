"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";

import { Container } from "@/components/landing/Container";

// "How it works": four banners, and the image beside them follows the one
// that is open. All images share one size (IMAGE_WIDTH × IMAGE_HEIGHT); the
// files in public/landing/features are mockups until the real ones arrive.
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 1500;

const FEATURES = [
  {
    title: "Log every show",
    body: "Every show you see, in one place: the venue, the date, your half-star rating and your thoughts about the show.",
    image: "/landing/features/track.svg",
    alt: "Logging Hadestown at the Lyric Theatre, rated four and a half stars",
  },
  {
    title: "Share with your friends",
    body: "Turn any night into a card for your Stories, with the show, your rating and your handle.",
    image: "/landing/features/share.svg",
    alt: "A share card for Hadestown, ready for Instagram Stories",
  },
  {
    title: "See your history",
    body: "Every show you’ve seen in one diary. Bring old nights in from ticket emails and photos.",
    image: "/landing/features/history.svg",
    alt: "A diary of recent shows, newest first",
  },
  {
    title: "Plan ahead",
    body: "Group a trip or a festival’s shows together and keep track of what you want to see next.",
    image: "/landing/features/plan.svg",
    alt: "Two trips: a week away and a festival",
  },
];

export function Features() {
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
          How it works
        </h2>
        <div className="flex flex-col gap-8 lg:flex-row-reverse lg:items-center lg:gap-16">
          <div
            role="tabpanel"
            id={`${id}-panel`}
            aria-labelledby={`${id}-tab-${active}`}
            className="relative mx-auto aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-lg border border-separator bg-glow shadow-sm lg:mx-0 lg:flex-[1_1_420px]"
          >
            {/* All four stay mounted, so switching is an instant cross-fade. */}
            {FEATURES.map((feature, index) => (
              <Image
                key={feature.image}
                src={feature.image}
                alt={index === active ? feature.alt : ""}
                aria-hidden={index !== active}
                width={IMAGE_WIDTH}
                height={IMAGE_HEIGHT}
                sizes="(min-width: 1024px) 420px, min(100vw, 420px)"
                className={`absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${
                  index === active ? "opacity-100" : "opacity-0"
                }`}
              />
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
                      selected ? "bg-tint text-on-tint" : "bg-fill text-label-secondary"
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
                      <span className="overflow-hidden text-body text-label-secondary">
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
