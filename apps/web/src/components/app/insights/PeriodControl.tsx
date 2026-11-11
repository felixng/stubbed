"use client";

import { useRef } from "react";

import { LockIcon } from "@/components/ui/LockIcon";
import type { PeriodChoice } from "@/lib/insights";
import { count } from "@/lib/plural";

const DETAIL: Record<string, string> = { earlier: "Look back at every year", all: "Every show you’ve logged" };

// The Insights period control (#497), after the iOS year sheet in Personal Best: the current period
// sits in the header as "2026 ⌄", and tapping it opens a "Time period" sheet (from the bottom on a
// phone, a small centred card on a wide screen). Each row is a period; the locked ones carry a Pro
// pill and open the paywall instead of selecting. A Free caller's server response lists no earlier
// years (listing them would reveal them), so the sheet offers one "Earlier years" row and All time.
// Built on <dialog>, so focus, Escape and the backdrop come from the browser.
export function PeriodControl({ choices, value, proName, visits, onChoose }: {
  choices: PeriodChoice[]; value: string; proName: string; visits: Record<string, number>; onChoose: (value: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = choices.find((c) => c.value === value) ?? choices[0];
  const close = () => dialog.current?.close();
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"
        className="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-pill px-2 text-title-2 font-display text-label hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus">
        <span className="sr-only">Time period: </span>{current.label}
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="text-label-secondary"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <dialog ref={dialog} aria-labelledby="period-title" onClick={(e) => { if (e.target === dialog.current) close(); }}
        className="period-sheet m-0 mt-auto w-full max-w-none rounded-t-lg bg-surface p-0 text-label backdrop:bg-black/40 sm:m-auto sm:max-w-sm sm:rounded-lg">
        <div className="flex flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-pill bg-separator sm:hidden" />
          <div className="relative flex min-h-11 items-center justify-center">
            <button type="button" onClick={close} aria-label="Close"
              className="absolute left-0 grid size-11 cursor-pointer place-items-center rounded-full text-label hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus">
              <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <h2 id="period-title" className="text-headline">Time period</h2>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto overscroll-contain rounded-md bg-background">
            {choices.map((c) => {
              const selected = c.value === value;
              const detail = DETAIL[c.value] ?? (visits[c.value] != null ? count(visits[c.value], "visit") : null);
              return (
                <li key={c.value} className="border-t border-separator first:border-t-0">
                  <button type="button" aria-current={selected || undefined}
                    onClick={() => { close(); onChoose(c.value); }}
                    className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
                    <span className="flex flex-col">
                      <span className="text-headline">{c.label}</span>
                      {detail && <span className="text-footnote text-label-secondary">{detail}</span>}
                    </span>
                    {c.locked ? (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-tint-fill px-3 py-1 text-subheadline font-semibold text-tint-text">
                        {proName}<LockIcon size={14} />
                        <span className="sr-only">: part of {proName}</span>
                      </span>
                    ) : selected && (
                      <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-tint-text"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
