"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

export type CalendarEntry = { id: string; date: string; title: string };

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// "2026-10" for a date or a { year, month } pair.
function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function parseMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m - 1 };
}

function addMonths(key: string, delta: number) {
  const { year, month } = parseMonth(key);
  const d = new Date(Date.UTC(year, month + delta, 1));
  return monthKey(d.getUTCFullYear(), d.getUTCMonth());
}

// Today in the visitor's time zone, as "YYYY-MM-DD"; null while rendering on
// the server, so the first paint matches and today appears after hydration.
const noSubscribe = () => () => {};
function useLocalToday() {
  const iso = useSyncExternalStore(
    noSubscribe,
    () => {
      const d = new Date();
      return `${monthKey(d.getFullYear(), d.getMonth())}-${d.getDate()}`;
    },
    () => null,
  );
  if (!iso) return null;
  return { key: iso.slice(0, 7), day: Number(iso.slice(8)) };
}

// A month at a time, Monday first, like Hevy's calendar. Days with a show sit
// on a coral wash with a dot under the number (so it isn't colour alone; the
// tint itself is kept for the page's one primary action), and jump to that
// day's entry in the list below.
// Opens on the month of the latest show, since most months have none.
export function ProfileCalendar({ entries }: { entries: CalendarEntry[] }) {
  // Entries arrive newest first.
  const latest = entries[0]?.date.slice(0, 7);
  const earliest = entries.at(-1)?.date.slice(0, 7);
  const [shown, setShown] = useState(latest);
  const today = useLocalToday();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries]);

  if (!shown || !earliest || !latest) return null;

  const last = today && today.key > latest ? today.key : latest;
  const { year, month } = parseMonth(shown);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // getUTCDay: 0 is Sunday; shift so Monday is the first column.
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const title = new Date(Date.UTC(year, month, 15)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const inMonth = entries.filter((e) => e.date.startsWith(shown)).length;

  const nav =
    "flex size-11 items-center justify-center rounded-pill bg-fill text-label hover:bg-tint-fill disabled:opacity-40 disabled:hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <section aria-labelledby="calendar-heading" className="rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 id="calendar-heading" className="text-headline text-label">Calendar</h2>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          className={nav}
          aria-label="Previous month"
          disabled={shown <= earliest}
          onClick={() => setShown(addMonths(shown, -1))}
        >
          <Chevron flip />
        </button>
        <p aria-live="polite" className="text-callout font-medium text-label">
          {title}
        </p>
        <button
          type="button"
          className={nav}
          aria-label="Next month"
          disabled={shown >= last}
          onClick={() => setShown(addMonths(shown, 1))}
        >
          <Chevron />
        </button>
      </div>
      {/* Screen readers get the labelled show days; the plain day numbers
          and weekday letters are visual only. */}
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} aria-hidden="true" className="pb-1 text-caption font-medium text-label-secondary">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = `${shown}-${String(day).padStart(2, "0")}`;
          const seen = byDay.get(date);
          const isToday = today?.key === shown && today.day === day;
          const base = "mx-auto flex size-10 items-center justify-center rounded-pill text-subheadline tabular-nums";
          if (!seen) {
            return (
              <span key={date} aria-hidden="true" className={`${base} ${isToday ? "font-semibold text-tint-text" : "text-label"}`}>
                {day}
              </span>
            );
          }
          const titles = seen.map((e) => e.title).join(", ");
          return (
            <a
              key={date}
              href={`#entry-${seen[0].id}`}
              aria-label={`${day} ${title}: ${titles}`}
              title={titles}
              className={`${base} relative bg-tint-fill font-semibold text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
            >
              {day}
              <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-pill bg-current" />
            </a>
          );
        })}
      </div>
      <p className="mt-3 text-footnote text-label-secondary">
        {inMonth === 0 ? "No shows this month" : `${inMonth} ${inMonth === 1 ? "show" : "shows"} this month`}
      </p>
    </section>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={flip ? "rotate-180" : undefined}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
