"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { VERDICT_LABEL, VERDICT_ORDER, nameVerdict, parseTitles, type NameVerdict } from "@/lib/admin-shows";
import { createClient } from "@/lib/supabase/client";

type Result = { id: string; title: string; type: string; year: number | null };
type Checked = { pos: number; title: string; found_at: number | null; results: Result[] };

const MAX = 100;

// Paste titles, one per line; each is run through search_shows (the search
// users type into) via admin_check_show_names, so this shows what they'd see.
// Missing and wrong-looking come first. The pasted text and the results stay
// until the next check: it's a scratch tool, not a form that finishes.
export function CheckShowNames() {
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Checked[] | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    const titles = parseTitles(text);
    if (titles.length === 0) return;
    if (titles.length > MAX) {
      setError(`Check at most ${MAX} titles at a time (you pasted ${titles.length}).`);
      return;
    }
    setChecking(true);
    setError(null);
    const { data, error } = await createClient().rpc("admin_check_show_names", { titles });
    setChecking(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRows((data ?? []) as unknown as Checked[]);
  }

  const verdicts = (rows ?? []).map((r) => ({ r, v: nameVerdict(r.found_at, r.results.length) }));
  const sorted = [...verdicts].sort((a, b) => VERDICT_ORDER.indexOf(a.v) - VERDICT_ORDER.indexOf(b.v) || a.r.pos - b.r.pos);
  const counts = VERDICT_ORDER.map((v) => [v, verdicts.filter((x) => x.v === v).length] as [NameVerdict, number]);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4 shadow-sm">
      <h2 className="text-headline text-label">Check show names</h2>
      <form onSubmit={check} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-footnote text-label-secondary">
          Paste titles, one per line (up to {MAX})
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="rounded-md border border-separator bg-surface px-3 py-2 text-body text-label focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>
        <div>
          <Button type="submit" size="sm" disabled={checking || !text.trim()}>
            {checking ? "Checking…" : "Check"}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-subheadline text-destructive">
          {error}
        </p>
      )}
      {rows && (
        <>
          <p className="text-subheadline text-label-secondary">{counts.map(([v, n]) => `${n} ${VERDICT_LABEL[v].toLowerCase()}`).join(" · ")}</p>
          <ul className="flex flex-col">
            {sorted.map(({ r, v }) => (
              <li key={r.pos} className="flex flex-col gap-0.5 border-t border-separator py-2">
                <p className="text-body text-label">
                  <span className="font-semibold">{r.title}</span>{" "}
                  <span
                    className={`rounded-pill px-2 py-0.5 text-footnote font-semibold ${v === "first" ? "bg-tint-fill text-tint-text" : "bg-fill text-label"}`}
                  >
                    {VERDICT_LABEL[v]}
                    {v === "lower" && r.found_at ? ` (#${r.found_at})` : ""}
                  </span>
                </p>
                {r.results.length > 0 && (
                  <p className="text-footnote text-label-secondary">
                    Top results: {r.results.map((x) => `${x.title} (${x.type}${x.year ? `, ${x.year}` : ""})`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
