"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RatingStars } from "@/components/ui/RatingStars";
import { track } from "@/lib/analytics";
import { formatDate, localToday } from "@/lib/entries";
import { COUNTRY_CODES, isCountryCode } from "@/lib/import/countries";
import { attentionCopy, checkMezzanineFileSize, MEZZANINE_EXPORT_HELP, runImportBatch } from "@/lib/import/mezzanine-review";
import { MezzanineError, parseMezzanine, type MezzanineRow } from "@/lib/import/mezzanine";
import { canonicalMezzanineVenue, MezzanineStopped, existingMezzanineKeys, isMezzanineDuplicate, mezzanineMissing, normaliseImportName, resolveMezzanine, type MezzanineDraft } from "@/lib/import/mezzanine-resolve";
import { saveDraft } from "@/lib/import/resolve";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { DraftCard, type Draft } from "./DraftCard";

// Region labels are for display; values remain ISO alpha-2 for canonical_city.
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
const textAction = "inline-flex min-h-11 items-center text-subheadline font-semibold text-tint-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40";
const disclosureSummary = "flex min-h-[50px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-subheadline font-semibold text-tint-text focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden";
const chevron = <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 transition-transform group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>;
const fieldClass = "min-h-11 w-full rounded-md border border-outline bg-surface px-3 text-body text-label focus-visible:outline-2 focus-visible:outline-focus";

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
  const [stopped, setStopped] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [matchingStopped, setMatchingStopped] = useState(false);
  const [lastCountry, setLastCountry] = useState<string | null>(null);
  const [countryNotice, setCountryNotice] = useState("");
  const [readyExpanded, setReadyExpanded] = useState(false);
  const [duplicatesExpanded, setDuplicatesExpanded] = useState(false);
  const stopRequested = useRef(false);
  const saving = useRef(false);
  const summary = useRef<HTMLElement>(null);
  const attention = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (finished) { summary.current?.focus(); summary.current?.scrollIntoView({ block: "start" }); }
  }, [finished]);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef("");
  const busyRef = useRef(false);
  const existing = useRef(new Set<string>());
  const user = useRef("");
  const done = useFreshOnReturn(() => {
    setDrafts([]); setParsed(null); setError(null); setProgress(""); setAdded(0); setFinished(false); setExpanded(null);
    setStopped(false); setStopping(false); setMatchingStopped(false); setCountryNotice(""); stopRequested.current = false;
    existing.current = new Set(); started.current = ""; if (input.current) input.current.value = "";
  });
  const selection = drafts.filter((d) => d.include && d.status !== "saved" && d.status !== "resolving" && !d.error?.startsWith("Couldn’t check") && !mezzanineMissing(d).length);
  const cities = [...new Map(drafts.filter((d) => d.status !== "saved" && d.venue && !d.venue.id && !d.venue.country && d.venue.city).map((d) => [normaliseImportName(d.venue!.city!), d.venue!.city!])).values()].sort();
  const update = (key: string, change: (draft: MezzanineDraft) => MezzanineDraft) => setDrafts((rows) => rows.map((d) => d.key === key ? change(d) : d));

  async function resolve(rows: MezzanineRow[]) {
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) throw new Error("Sign in again to import your shows.");
    user.current = data.user.id;
    const result = await resolveMezzanine(client, user.current, rows, started.current,
      (count, total) => { if (!stopRequested.current) setProgress(`Matching shows and theatres: ${count} of ${total}`); }, () => stopRequested.current);
    existing.current = result.existing; setDrafts(result.drafts);
    setReadyExpanded(result.drafts.length <= 10);
    setProgress("");
  }
  async function read(file: File) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setDrafts([]); setParsed(null); setFinished(false); setAdded(0);
    stopRequested.current = false; saving.current = false; setStopping(false); setStopped(false); setMatchingStopped(false); setCountryNotice(""); setExpanded(null);
    started.current = new Date().toISOString(); setProgress("Reading your file…");
    try {
      if (!/\.(csv|json)$/i.test(file.name)) throw new Error("Choose the CSV or JSON file Mezzanine made.");
      checkMezzanineFileSize(file.size);
      const rows = parseMezzanine(await file.text(), localToday()); setParsed(rows);
      await resolve(rows);
    } catch (err) {
      if (err instanceof MezzanineStopped) { setMatchingStopped(true); setProgress("Matching stopped. Your file is kept."); }
      else {
        setError(err instanceof MezzanineError || (err instanceof Error && (err.message.startsWith("This file is too large") || err.message.startsWith("Choose the CSV")))
          ? err.message : "Couldn’t match your shows. Check your connection and try again. Your file is kept.");
        setProgress("");
      }
    }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function retryResolve() {
    if (!parsed || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); stopRequested.current = false; saving.current = false; setStopping(false); setMatchingStopped(false);
    try { await resolve(parsed); }
    catch (err) {
      if (err instanceof MezzanineStopped) { setMatchingStopped(true); setProgress("Matching stopped. Your file is kept."); }
      else setError("Couldn’t match your shows. Check your connection and try again. Your file is kept.");
    }
    finally { busyRef.current = false; setBusy(false); }
  }
  function country(city: string, code: string) {
    const key = normaliseImportName(city);
    const affected = drafts.filter((d) => d.status !== "saved" && d.venue && !d.venue.id && normaliseImportName(d.venue.city ?? "") === key).length;
    setLastCountry(code);
    setCountryNotice(`${names.of(code) ?? code} applied to ${affected} ${affected === 1 ? "show" : "shows"} in ${city}.`);
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
  function stop() {
    stopRequested.current = true; setStopping(true);
    setProgress(saving.current ? "Stopping after this show…" : "Stopping after the current matches…");
  }
  async function save() {
    if (busyRef.current || !selection.length) return;
    busyRef.current = true; saving.current = true; stopRequested.current = false;
    setBusy(true); setError(null); setFinished(false); setStopping(false); setStopped(false);
    let count = added;
    const cities = new Map<string, string>();
    try {
      const result = await runImportBatch(selection, {
        shouldStop: () => stopRequested.current,
        save: async (draft, index) => {
          setProgress(`Importing ${index + 1} of ${selection.length}`);
          update(draft.key, (d) => ({ ...d, status: "saving", error: undefined }));
          const venue = await canonicalMezzanineVenue(client, draft.venue!, cities);
          const saved = await saveDraft(client, user.current, { show: draft.show!, venue, date: draft.date,
            rating: draft.rating, note: draft.note, collectionIds: [], photo: null }, draft.key);
          count++; setAdded(count);
          update(draft.key, (d) => ({ ...d, status: "saved", include: false, entryId: saved.id }));
          void track(client, "entry_logged", { method: "mezzanine" });
        },
        failed: (draft) => update(draft.key, (d) => ({ ...d, status: "failed", error: "Couldn’t save this show. Check your connection and try again." })),
      });
      setStopped(result.stopped); setFinished(true); setProgress(result.stopped ? "Import stopped. Your remaining shows are kept." : "Import finished.");
      if (count === drafts.filter((d) => !d.duplicate).length) done();
    } finally { busyRef.current = false; saving.current = false; setBusy(false); }
  }
  const groups = [
    { name: "Needs attention", id: "needs-attention", rows: drafts.filter((d) => d.status !== "saved" && !d.duplicate && (mezzanineMissing(d).length || d.error)) },
    { name: "Ready", id: "ready", rows: drafts.filter((d) => d.status !== "saved" && !d.duplicate && !mezzanineMissing(d).length && !d.error) },
    { name: "Already in your diary", id: "duplicates", rows: drafts.filter((d) => d.status !== "saved" && d.duplicate) },
  ];
  const ready = groups[1].rows, needs = groups[0].rows, duplicates = groups[2].rows;
  const left = drafts.filter((d) => d.status !== "saved" && !d.duplicate).length;
  const details = [stopped && left ? `${left} left` : needs.length ? `${needs.length} ${needs.length === 1 ? "needs" : "need"} a fix` : null,
    !stopped && ready.length ? `${ready.length} not imported` : null,
    duplicates.length ? `${duplicates.length} already in your diary` : null].filter(Boolean).join(" · ");
  function selectReady(include: boolean) {
    const ids = new Set(ready.map((d) => d.key));
    setDrafts((rows) => rows.map((d) => ids.has(d.key) ? { ...d, include } : d));
  }
  function jumpToAttention() { attention.current?.focus(); attention.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  function rowList(rows: MezzanineDraft[]) {
    return <ul className="divide-y divide-separator rounded-md border border-separator bg-surface shadow-sm">
      {rows.map((d) => {
        const missing = mezzanineMissing(d);
        const problem = missing.length > 0 || !!d.error;
        const title = d.show?.title || d.reading.extracted.show_title || "Untitled show";
        const when = d.date ? formatDate(d.date) : "date missing";
        const toggleEditor = () => setExpanded(expanded === d.key ? null : d.key);
        const metadata = <span className="flex min-w-0 flex-col gap-1 break-words">
          <span className="text-body font-semibold text-label">{title}</span>
          <span className="text-footnote text-label-secondary">{[d.venue?.name || d.reading.extracted.venue_name, d.venue?.city].filter(Boolean).join(" · ")}</span>
          {(d.date || d.rating != null) && <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-label-secondary">
            {d.date && <span>{when}</span>}{d.rating != null && <RatingStars value={d.rating} />}
          </span>}
          {d.duplicate && <span className="text-footnote text-label-secondary">Already in your diary</span>}
        </span>;
        return <li key={d.key} className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            {problem ? <>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="mt-1 shrink-0 text-destructive" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/></svg>
              <div className="min-w-0 flex-1">
                {metadata}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {missing.length > 0 && <span className="text-footnote text-destructive">{attentionCopy(missing)}</span>}
                  <Button variant="secondary" size="sm" disabled={busy} aria-label={`Fix ${title}, ${when}`} aria-expanded={expanded === d.key} onClick={toggleEditor}>Fix</Button>
                </div>
                {d.error && <p role="alert" className="text-subheadline text-destructive">{d.error}</p>}
              </div>
            </> : <>
              <label className="flex min-h-11 min-w-0 flex-1 items-start gap-3">
                <input type="checkbox" checked={d.include} disabled={busy || d.status === "resolving"}
                  onChange={(e) => update(d.key, (row) => ({ ...row, include: e.target.checked }))} className="mt-1 size-5 shrink-0 cursor-pointer accent-tint" />
                {metadata}
              </label>
              <button type="button" className={textAction} disabled={busy} aria-label={`Edit ${title}, ${when}`} aria-expanded={expanded === d.key} onClick={toggleEditor}>Edit</button>
            </>}
          </div>
          {expanded === d.key && <fieldset disabled={busy} className="min-w-0 [&_.border-separator]:border-outline"><DraftCard draft={d} headingLevel={3} showSelection={false} duplicateOf={null} emailText={() => undefined} onChange={(patches) => void patch(d, patches)} /></fieldset>}
          {expanded === d.key && d.invalidRating && <Button variant="secondary" disabled={busy} onClick={() => void patch(d, { rating: null })}>Clear invalid rating</Button>}
        </li>;
      })}
    </ul>;
  }
  return <div className="flex flex-col gap-5 pb-24">
    <input ref={input} type="file" accept=".csv,.json" className="sr-only" tabIndex={-1} aria-label="Mezzanine export file" disabled={busy}
      onChange={(e) => { const file = e.target.files?.[0]; if (file) void read(file); e.target.value = ""; }} />
    {!finished && <div role="group" aria-label="Choose or drop a Mezzanine export" onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void read(file); }}
      className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm">
      <div className="flex flex-col items-start gap-3 p-4">
        {parsed ? <p className="text-body text-label">{parsed.length} {parsed.length === 1 ? "show" : "shows"} in this file</p>
          : <><p className="text-body text-label">Choose or drop your Mezzanine CSV or JSON file. You review every show before importing.</p>
            <p id="file-limit" className="text-footnote text-label-secondary">CSV or JSON, up to 20 MB.</p></>}
        <Button variant="secondary" aria-describedby={parsed ? undefined : "file-limit"} disabled={busy} onClick={() => input.current?.click()}>{error || parsed ? "Choose another file" : "Choose a file"}</Button>
        {progress && <p className="text-subheadline text-label-secondary">{progress}</p>}
      </div>
      {!parsed && <details className="group border-t border-separator">
        <summary className={disclosureSummary}>How to import from Mezzanine{chevron}</summary>
        <p className="border-t border-separator p-4 text-subheadline text-label-secondary">{MEZZANINE_EXPORT_HELP}</p>
      </details>}
    </div>}
    <p role="status" aria-live="polite" className="sr-only">{progress}</p>
    {error && <div role="alert" className="flex flex-col items-start gap-3"><p>{error}</p>{parsed && <Button variant="secondary" disabled={busy} onClick={retryResolve}>Try again</Button>}</div>}
    {matchingStopped && <Button variant="secondary" disabled={busy} onClick={retryResolve}>Resume matching</Button>}
    {finished && <section ref={summary} tabIndex={-1} aria-labelledby="import-result" className="scroll-mt-20 focus-visible:outline-2 focus-visible:outline-focus">
      <h2 id="import-result" className="text-title font-display text-label">{added ? `${added} ${added === 1 ? "show" : "shows"} added` : "No shows added"}</h2>
      {details && <p className="mt-2 text-subheadline text-label-secondary">{details}</p>}
      {selection.length > 0 && <Button variant="secondary" className="mt-3" disabled={busy} onClick={save}>{stopped ? "Continue importing" : "Import selected shows"}</Button>}
      {needs.length === 0 && ready.length === 0 && <button type="button" className={`${textAction} mt-2`} onClick={() => input.current?.click()}>Import another file</button>}
    </section>}
    {drafts.length > 0 && !finished && <div className="flex flex-col gap-2 text-subheadline text-label-secondary">
      <p>{ready.length > 0 && <span>{ready.length} ready</span>}{needs.length > 0 && <>{ready.length > 0 && " · "}{drafts.length > 10 ? <button type="button" className="min-h-11 text-tint-text underline underline-offset-4" onClick={jumpToAttention}>{needs.length} need attention</button> : <span>{needs.length} {needs.length === 1 ? "needs" : "need"} attention</span>}</>}{duplicates.length > 0 && <>{(ready.length > 0 || needs.length > 0) && " · "}{duplicates.length} already in your diary</>}</p>
    </div>}
    {(cities.length > 0 || (!finished && countryNotice)) && <section aria-label="Countries" className="flex flex-col gap-3">
      {cities.length > 0 && <p className="text-subheadline text-label-secondary">We couldn’t identify this country from our theatre catalogue. Choose one so your stats group correctly.</p>}
      {cities.map((city, i) => <div key={city} className="flex flex-col gap-2">
        <label htmlFor={`city-${i}`} className="flex flex-col gap-2 text-body text-label">Where is {city}?
          <select id={`city-${i}`} disabled={busy} value="" onChange={(e) => country(city, e.target.value)} className={fieldClass}>
            <option value="">Choose country</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        {lastCountry && <button type="button" className={textAction} disabled={busy} onClick={() => country(city, lastCountry)}>Use {names.of(lastCountry)} for {city}</button>}
      </div>)}
      <p role="status" aria-live="polite" className="text-subheadline text-label-secondary">{countryNotice}</p>
    </section>}
    {!finished && drafts.some((d) => d.planned) && <p className="text-footnote text-label-secondary">Future dates become planned shows, without ratings.</p>}
    {!finished && drafts.length > 0 && drafts.every((d) => d.duplicate) && <p>Every show in this file is already in your diary.</p>}
    {groups.map((group) => group.rows.length > 0 && !(finished && group.id === "duplicates") && <section key={group.id} aria-labelledby={`group-${group.id}`} className="flex flex-col gap-2">
      <h2 ref={group.id === "needs-attention" ? attention : undefined} tabIndex={-1} id={`group-${group.id}`} className="scroll-mt-20 text-headline text-label focus-visible:outline-2 focus-visible:outline-focus">{finished && group.id === "needs-attention" ? `${group.rows.length} ${group.rows.length === 1 ? "show" : "shows"} to fix` : `${group.name} · ${group.rows.length}`}</h2>
      {group.id === "ready" && <button type="button" className={textAction} disabled={busy}
        onClick={() => selectReady(!ready.every((d) => d.include))}>{ready.every((d) => d.include) ? "Untick all ready shows" : "Select all ready shows"}</button>}
      {group.id === "needs-attention" ? rowList(group.rows) : <details className="group overflow-hidden rounded-md border border-separator bg-surface shadow-sm" open={group.id === "ready" ? readyExpanded : duplicatesExpanded}
        onToggle={(e) => group.id === "ready" ? setReadyExpanded(e.currentTarget.open) : setDuplicatesExpanded(e.currentTarget.open)}>
        <summary className={disclosureSummary}>{group.id === "ready" ? "Review ready shows" : "Review existing visits"}{chevron}</summary>
        <div className="border-t border-separator [&>ul]:rounded-none [&>ul]:border-0 [&>ul]:shadow-none">{rowList(group.rows)}</div>
      </details>}
    </section>)}
    {(drafts.length > 0 || busy) && <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-separator bg-surface p-4 md:bottom-0 md:mx-0">
      {busy ? <Button variant="secondary" className="w-full" disabled={stopping} onClick={stop}>{stopping ? "Stopping…" : "Stop"}</Button>
        : finished ? <Link href="/app/profile" onClick={done} className="inline-flex min-h-[50px] w-full items-center justify-center rounded-pill bg-tint px-6 font-semibold text-on-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">View diary</Link>
          : <Button className="w-full" disabled={!selection.length || drafts.some((d) => d.status === "resolving")} onClick={save}>Import {selection.length} {selection.length === 1 ? "show" : "shows"}</Button>}
    </div>}
  </div>;
}
