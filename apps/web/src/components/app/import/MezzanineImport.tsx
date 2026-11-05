"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RatingStars } from "@/components/ui/RatingStars";
import { track } from "@/lib/analytics";
import { formatDate, localToday } from "@/lib/entries";
import { COUNTRY_CODES, isCountryCode } from "@/lib/import/countries";
import { parseMezzanine, type MezzanineRow } from "@/lib/import/mezzanine";
import { canonicalMezzanineVenue, existingMezzanineKeys, isMezzanineDuplicate, mezzanineMissing, normaliseImportName, resolveMezzanine, type MezzanineDraft } from "@/lib/import/mezzanine-resolve";
import { saveDraft } from "@/lib/import/resolve";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { DraftCard, type Draft } from "./DraftCard";

// Region labels are for display; values remain ISO alpha-2 for canonical_city.
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
const fieldClass = "min-h-11 w-full rounded-md border border-separator bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";

export function MezzanineImport() {
  const [client] = useState(createClient);
  const [drafts, setDrafts] = useState<MezzanineDraft[]>([]);
  const [parsed, setParsed] = useState<MezzanineRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [finished, setFinished] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef("");
  const busyRef = useRef(false);
  const existing = useRef(new Set<string>());
  const user = useRef("");
  const done = useFreshOnReturn(() => {
    setDrafts([]); setParsed(null); setError(null); setProgress(""); setAdded(0); setFinished(false); setExpanded(null);
    existing.current = new Set(); started.current = ""; if (input.current) input.current.value = "";
  });
  const selection = drafts.filter((d) => d.include && d.status !== "saved" && d.status !== "resolving" && !d.error?.startsWith("Couldn’t check") && !mezzanineMissing(d).length);
  const cities = [...new Map(drafts.filter((d) => d.status !== "saved" && d.venue && !d.venue.id && !d.venue.country && d.venue.city).map((d) => [normaliseImportName(d.venue!.city!), d.venue!.city!])).values()].sort();
  const update = (key: string, change: (draft: MezzanineDraft) => MezzanineDraft) => setDrafts((rows) => rows.map((d) => d.key === key ? change(d) : d));

  async function resolve(rows: MezzanineRow[]) {
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) throw new Error("Sign in again to import your shows.");
    user.current = data.user.id;
    const result = await resolveMezzanine(client, user.current, rows, started.current, (count, total) => setProgress(`Matching shows and theatres: ${count} of ${total}`));
    existing.current = result.existing; setDrafts(result.drafts);
    setProgress(`${result.drafts.length} shows ready to review.`);
  }
  async function read(file: File) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setDrafts([]); setParsed(null); setFinished(false); setAdded(0);
    started.current = new Date().toISOString(); setProgress("Reading your file…");
    try {
      if (!/\.(csv|json)$/i.test(file.name)) throw new Error("Choose the CSV or JSON file Mezzanine made.");
      const rows = parseMezzanine(await file.text(), localToday()); setParsed(rows);
      await resolve(rows);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn’t match your shows. Your file is kept. Try again."); setProgress(""); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function retryResolve() {
    if (!parsed || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await resolve(parsed); }
    catch { setError("Couldn’t match your shows. Check your connection and try again. Your file is kept."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function country(city: string, code: string) {
    const key = normaliseImportName(city);
    setDrafts((rows) => rows.map((d) => {
      if (d.status === "saved" || !d.venue || d.venue.id || normaliseImportName(d.venue.city ?? "") !== key) return d;
      const next = { ...d, venue: { ...d.venue, country: code || null } };
      return { ...next, include: !next.duplicate && !mezzanineMissing(next).length };
    }));
  }
  async function patch(original: MezzanineDraft, patch: Partial<Draft>) {
    if (busyRef.current) return;
    let next = { ...original, ...patch };
    if ("venue" in patch && next.venue && !next.venue.id && next.venue.country) {
      const raw = next.venue.country.trim();
      const code = raw.toUpperCase();
      const country = isCountryCode(code) ? code : countries.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.code ?? null;
      next.venue = { ...next.venue, country };
    }
    if ("rating" in patch) next.invalidRating = false;
    next.planned = !!next.date && next.date > localToday();
    if (next.planned) next.rating = null;
    next.note = Array.from(next.note).slice(0, 10_000).join("");
    const recheck = "show" in patch || "date" in patch;
    next.duplicate = isMezzanineDuplicate(next.show?.id, next.date, existing.current);
    next.include = !next.duplicate && !mezzanineMissing(next).length && (patch.include ?? true);
    if (recheck) next = { ...next, status: "resolving", include: false };
    update(next.key, () => next);
    if (recheck) {
      try {
        const keys = await existingMezzanineKeys(client, user.current, next.show?.id ? [next.show.id] : [], started.current);
        keys.forEach((key) => existing.current.add(key));
        update(next.key, (current) => {
          // A later edit wins over an earlier lookup.
          if (current.show?.id !== next.show?.id || current.date !== next.date) return current;
          const duplicate = isMezzanineDuplicate(current.show?.id, current.date, existing.current);
          return { ...current, status: "ready", error: undefined, duplicate, include: !duplicate && !mezzanineMissing(current).length };
        });
      } catch { update(next.key, (d) => ({ ...d, status: "failed", include: false, error: "Couldn’t check your diary. Edit the show to retry." })); }
    }
  }
  async function save() {
    if (busyRef.current || !selection.length) return;
    busyRef.current = true; setBusy(true); setError(null); setFinished(false);
    let count = added;
    const cities = new Map<string, string>();
    try {
      for (const [index, draft] of selection.entries()) {
        setProgress(`Importing ${index + 1} of ${selection.length}`);
        update(draft.key, (d) => ({ ...d, status: "saving", error: undefined }));
        try {
          const venue = await canonicalMezzanineVenue(client, draft.venue!, cities);
          const saved = await saveDraft(client, user.current, { show: draft.show!, venue, date: draft.date,
            rating: draft.rating, note: draft.note, collectionIds: [], photo: null }, draft.key);
          count++; setAdded(count);
          update(draft.key, (d) => ({ ...d, status: "saved", include: false, entryId: saved.id }));
          void track(client, "entry_logged", { method: "mezzanine" });
        } catch (err) { update(draft.key, (d) => ({ ...d, status: "failed", error: err instanceof Error ? err.message : "Couldn’t save this show. Try again." })); }
      }
      setFinished(true); setProgress("Import finished.");
      // Keep unfinished rows when returning for fixes/retry.
      if (count === drafts.filter((d) => !d.duplicate).length) done();
    } finally { busyRef.current = false; setBusy(false); }
  }
  const groups = [
    { name: "Needs attention", rows: drafts.filter((d) => d.status !== "saved" && !d.duplicate && (mezzanineMissing(d).length || d.error)) },
    { name: "Ready", rows: drafts.filter((d) => d.status !== "saved" && !d.duplicate && !mezzanineMissing(d).length && !d.error) },
    { name: "Already in your diary", rows: drafts.filter((d) => d.status !== "saved" && d.duplicate) },
  ];
  return <div className="flex flex-col gap-5 pb-24">
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void read(file); }} className="flex flex-col items-start gap-3 rounded-md border border-dashed border-outline bg-surface p-5">
      <p className="text-body text-label">Choose or drop your Mezzanine CSV or JSON file. You review every show before importing.</p>
      <input ref={input} type="file" accept=".csv,.json" className="sr-only" aria-label="Mezzanine export file" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void read(file); e.target.value = ""; }} />
      <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{error || drafts.length ? "Choose another file" : "Choose a file"}</Button>
    </div>
    <details className="rounded-md border border-separator bg-surface p-4">
      <summary className="min-h-11 cursor-pointer text-body font-medium text-label">How to export from Mezzanine</summary>
      <p className="text-subheadline text-label-secondary">Open Mezzanine, find its export option, and export your diary as a CSV or JSON file. Save the file, then choose it here.</p>
    </details>
    <p role="status" aria-live="polite" className="text-subheadline text-label-secondary">{progress}</p>
    {error && <div role="alert" className="flex flex-col items-start gap-3"><p>{error}</p>{parsed && <Button variant="secondary" disabled={busy} onClick={retryResolve}>Try again</Button>}</div>}
    {finished && <section aria-label="Import summary" className="rounded-md border border-separator bg-surface p-4">
      <h2 className="text-headline text-label">{added} added, {drafts.filter((d) => d.status !== "saved" && !d.duplicate).length} to finish, {drafts.filter((d) => d.duplicate).length} already in your diary</h2>
      {drafts.some((d) => d.status === "failed") && <p>{drafts.filter((d) => d.status === "failed").length} couldn’t be saved. Your selections are kept for retry.</p>}
      <Link href="/app/profile" onClick={() => done()} className="inline-flex min-h-11 items-center font-semibold text-tint-text hover:underline">View diary</Link>
    </section>}
    {cities.map((city, i) => <label key={city} htmlFor={`city-${i}`} className="flex flex-col gap-2 text-body text-label">Where is {city}?
      <select id={`city-${i}`} disabled={busy} value="" onChange={(e) => country(city, e.target.value)} className={fieldClass}>
        <option value="">Choose country</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
    </label>)}
    {drafts.length > 0 && <p className="text-subheadline text-label-secondary">Private notes aren’t imported.{drafts.some((d) => d.planned) && " Future dates become planned shows, without ratings."}</p>}
    {drafts.length > 0 && drafts.every((d) => d.duplicate) && <p>Every show in this file is already in your diary.</p>}
    {groups.map((group) => group.rows.length > 0 && <section key={group.name} aria-label={group.name} className="flex flex-col gap-2">
      <h2 className="text-headline text-label">{group.name} · {group.rows.length}</h2>
      <ul className="divide-y divide-separator rounded-md border border-separator bg-surface">
        {group.rows.map((d) => <li key={d.key} className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={d.include} disabled={busy || d.status === "resolving" || !!mezzanineMissing(d).length || (!!d.error && d.error.startsWith("Couldn’t check"))} onChange={(e) => update(d.key, (row) => ({ ...row, include: e.target.checked }))} className="mt-1 size-5 shrink-0 accent-tint" />
              <span className="flex min-w-0 flex-col gap-1 break-words">
                <span className="text-body font-semibold text-label">{d.show?.title || d.reading.extracted.show_title || "Untitled show"}</span>
                <span className="text-subheadline text-label-secondary">{[d.venue?.name || d.reading.extracted.venue_name, d.venue?.city].filter(Boolean).join(", ")}</span>
                <span className="text-subheadline text-label-secondary">{d.date && formatDate(d.date)}</span>
                {d.rating != null && <RatingStars value={d.rating} />}
                {mezzanineMissing(d).length > 0 && <span className="text-footnote text-destructive">Missing or invalid: {mezzanineMissing(d).join(", ")}</span>}
                {d.duplicate && <span className="text-footnote">Already in your diary</span>}
              </span>
            </label>
            <Button variant="ghost" size="sm" disabled={busy} aria-expanded={expanded === d.key} onClick={() => setExpanded(expanded === d.key ? null : d.key)}>Edit</Button>
          </div>
          {d.error && <p role="alert" className="text-subheadline text-destructive">{d.error}</p>}
          {expanded === d.key && <fieldset disabled={busy} className="min-w-0"><DraftCard draft={d} showSelection={false} duplicateOf={null} emailText={() => undefined} onChange={(patches) => void patch(d, patches)} /></fieldset>}
          {expanded === d.key && d.invalidRating && <Button variant="secondary" onClick={() => void patch(d, { rating: null })}>Clear invalid rating</Button>}
        </li>)}
      </ul>
    </section>)}
    {drafts.length > 0 && <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-separator bg-surface p-4 md:bottom-0 md:mx-0">
      <Button className="w-full" disabled={busy || !selection.length || drafts.some((d) => d.status === "resolving")} onClick={save}>Import {selection.length} {selection.length === 1 ? "show" : "shows"}</Button>
    </div>}
  </div>;
}
