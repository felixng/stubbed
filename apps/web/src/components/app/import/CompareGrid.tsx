"use client";

import { formatDate, WITH_WEEKDAY } from "@/lib/entries";
import { compareAttempts, type Attempt } from "@/lib/import/compare";

const CONFIDENCE = {
  high: "bg-tint-fill text-tint-text",
  medium: "bg-fill text-label",
  low: "bg-fill text-label-secondary",
} as const;

// "claude-haiku-5-5" → "Claude Haiku 5.5", so several Claude columns are
// told apart at a glance. Other ids fall back to the provider's name.
function columnName(provider: string, modelId: string | null, names: Record<string, string>) {
  const claude = modelId && /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(modelId);
  if (claude) return `Claude ${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ""}`;
  return names[provider] ?? provider;
}

const seconds = (ms: number | null) => (ms == null ? "" : `${(ms / 1000).toFixed(1)}s`);

// What each AI model read from one source, side by side, with the one used
// for the drafts highlighted. "Use this" switches the drafts to another
// model's reading. Columns scroll sideways on narrow screens.
export function CompareGrid({
  attempts,
  names,
  chosen,
  onUse,
  disabled,
}: {
  attempts: Attempt[];
  // Display names per provider id.
  names: Record<string, string>;
  // `model` of the attempt the drafts came from.
  chosen: string | null;
  onUse: (attempt: Attempt) => void;
  disabled: boolean;
}) {
  const agreement = compareAttempts(attempts);
  const running = attempts.some((a) => a.state === "running");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-footnote text-label-secondary">
        {running
          ? `Asking ${attempts.length} models…`
          : !agreement
            ? "Fewer than two models answered."
            : agreement.differs.length
              ? `${agreement.answered} answered · differ on ${agreement.differs.join(", ")}`
              : `${agreement.answered} answered · all agree`}
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${attempts.length}, minmax(180px, 1fr))` }}>
          {attempts.map((a) => {
            const provider = (a.readBy ?? a.model).split(":")[0];
            const modelId = a.readBy?.slice(a.readBy.indexOf(":") + 1) ?? (a.model.includes(":") ? a.model.slice(a.model.indexOf(":") + 1) : null);
            const isChosen = chosen === a.model;
            return (
              <section
                key={a.model || "chain"}
                aria-label={columnName(provider, modelId, names)}
                className={`flex min-w-0 flex-col gap-2 rounded-sm border bg-background p-3 ${isChosen ? "border-tint ring-1 ring-tint" : "border-separator"}`}
              >
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-subheadline font-semibold text-label">{a.model ? columnName(provider, modelId, names) : "Default chain"}</p>
                    {modelId && (
                      <p className="truncate font-mono text-caption text-label-secondary" title={modelId}>
                        {modelId}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-caption text-label-secondary">
                    {a.state === "running" ? (
                      <span aria-label="Running" className="inline-block size-3 animate-spin rounded-full border-2 border-outline border-t-transparent" />
                    ) : (
                      seconds(a.ms)
                    )}
                  </span>
                </header>

                {a.state === "failed" ? (
                  <p className="text-footnote break-words text-destructive">{a.note ?? "Failed"}</p>
                ) : a.state === "done" && !a.shows.length ? (
                  <p className="text-footnote text-label-secondary">{a.note ?? "Nothing found"}</p>
                ) : (
                  a.shows.map((s, i) => (
                    <div key={i} className="flex flex-col gap-0.5 border-t border-separator pt-2 first:border-t-0 first:pt-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-footnote">
                        <span className={`rounded-pill px-1.5 font-semibold ${CONFIDENCE[s.confidence]}`}>{s.confidence}</span>
                        <span className="font-semibold text-label">{s.show_title ?? "No show"}</span>
                      </p>
                      <p className="text-footnote text-label">{s.venue_name ?? (s.venue_osm_id ? "A nearby theatre" : "No venue")}</p>
                      <p className="text-footnote text-label">
                        {s.date ? formatDate(s.date, WITH_WEEKDAY) : "No date"}
                        {s.time ? `, ${s.time}` : ""}
                      </p>
                      {(s.seats || s.price) && (
                        <p className="text-footnote text-label-secondary">{[s.seats, s.price].filter(Boolean).join(" · ")}</p>
                      )}
                      {s.reason && <p className="text-caption text-label-secondary">{s.reason}</p>}
                    </div>
                  ))
                )}
                {a.state === "done" && a.note && a.shows.length > 0 && <p className="text-caption text-label-secondary">{a.note}</p>}

                {a.state === "done" && a.shows.length > 0 && (
                  <button
                    type="button"
                    disabled={disabled || isChosen}
                    onClick={() => onUse(a)}
                    className="mt-auto min-h-9 rounded-pill px-3 text-footnote font-semibold text-tint-text enabled:hover:bg-tint-fill disabled:cursor-default disabled:text-label-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {isChosen ? "Used for drafts" : "Use this"}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
