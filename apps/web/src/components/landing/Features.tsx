"use client";

import { useId, useRef, useState } from "react";

import { Container } from "@/components/landing/Container";
import { HistoryScreen, PlanScreen, ShareScreen, TrackScreen } from "@/components/landing/Screens";

// "How it works": four banners, and the screen beside them follows the one
// that is open. The screens are drawn with the app's own components and
// sample data (Screens.tsx), not screenshots.
const FEATURES = [
  {
    title: "Log every show",
    body: "Every show you see, in one place: the venue, the date, your half-star rating and your thoughts about the show.",
    Screen: TrackScreen,
    alt: "Logging Hadestown at the Lyric Theatre: the date, four and a half stars and a note",
  },
  {
    title: "Share with your friends",
    body: "Turn any night into a card for your Stories, with the show, your rating and your handle.",
    Screen: ShareScreen,
    alt: "A share card for Hadestown with four and a half stars, the 14th show of 2026 and the handle @sillyelphaba",
  },
  {
    title: "See your history",
    body: "Every show you’ve seen in one diary. Bring old nights in from ticket emails and photos.",
    Screen: HistoryScreen,
    alt: "A diary of five recent shows, newest first, each with its theatre, date and star rating",
  },
  {
    title: "Plan ahead",
    body: "Group a trip or a festival’s shows together and keep track of what you want to see next.",
    Screen: PlanScreen,
    alt: "Two upcoming shows marked Going, and two trips: a festival week and a birthday weekend",
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
            {FEATURES.map(({ Screen, alt, title }, index) => (
              <div
                key={title}
                role="img"
                aria-label={alt}
                aria-hidden={index !== active}
                className={`absolute inset-0 overflow-hidden p-5 transition-opacity duration-300 motion-reduce:transition-none sm:p-6 ${
                  index === active ? "opacity-100" : "opacity-0"
                }`}
              >
                <div aria-hidden="true">
                  <Screen />
                </div>
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
