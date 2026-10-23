"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatDate, TRIP_SELECT, tripCovers, type Collection } from "@/lib/entries";
import type { Identification } from "@/lib/identify";
import {
  centroid,
  describeMissing,
  groupPhotos,
  MAX_IDENTIFY_PHOTOS,
  mergeReadings,
  missingFields,
  pickSpread,
  visitAccuracy,
  type Extracted,
  type PhotoSource,
  type Reading,
} from "@/lib/import/drafts";
import { pickBest, type Attempt } from "@/lib/import/compare";
import { importErrorText } from "@/lib/import/errors";
import { EMAIL_FILE_ACCEPT, parseEmailFile, type ParsedEmail } from "@/lib/import/email-parse";
import type { EmailExtraction } from "@/lib/import/extract-email";
import { lookupNearby, preparePhoto, requestIdentify, type PreparedPhoto } from "@/lib/import/photo-pipeline";
import { resolveShow, resolveVenue, runPool, saveDraft, SaveError } from "@/lib/import/resolve";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { DraftCard, draftCardId, type Draft } from "./DraftCard";
import { CompareGrid } from "./CompareGrid";
import { COMPARE_ALL, DEFAULT_CHAIN, ModelPicker, type ProvidersInfo } from "./ModelPicker";

// One thing being read: an email, or a group of photos from one visit.
type Job = {
  ref: string;
  kind: "email" | "photos";
  label: string;
  detail: string | null;
  state: "queued" | "reading" | "nearby" | "identifying" | "done" | "failed";
  found: number;
  // One per model asked; several in compare mode.
  attempts?: Attempt[];
  // `model` of the attempt the drafts came from.
  chosen?: string | null;
  // The visit's photos, so it's clear which photo the results are about.
  thumbs?: string[];
};

type PhotoItem = PreparedPhoto & { ref: string; fileName: string; previewUrl: string };

const STATE_TEXT: Record<Job["state"], string> = {
  queued: "Waiting",
  reading: "Reading",
  nearby: "Finding nearby theatres",
  identifying: "Working out the show",
  done: "Done",
  failed: "Failed",
};

// Sources run a few at a time: quick enough, and gentle on rate limits
// (compare mode adds one call per compared model).
const EMAIL_CONCURRENCY = 3;
const PHOTO_CONCURRENCY = 3;

// One photo per entry for now, even for shots from the same evening: several
// photos per entry is planned as a later (likely paid) feature. Turned off in
// the UI only; visit grouping and merging stay in lib/import for then.
const GROUP_VISITS = false;

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name);

// A photo's own time isn't the curtain time, so `time` stays empty: it would
// stop the draft merging with the booking email for the same show.
function fromIdentification(result: Identification, date: string | null): Extracted {
  return {
    show_title: result.show_title,
    show_type: result.show_type,
    venue_name: result.venue_name,
    venue_osm_id: result.venue_osm_id,
    city: null,
    country: null,
    date,
    time: null,
    seats: null,
    price: null,
    confidence: result.confidence,
    reason: result.reason,
  };
}

// A source nothing could be read from still becomes a draft, so the show can
// be logged by hand with its photos, nearby theatres and date kept.
function blank(date: string | null): Extracted {
  return {
    show_title: null,
    show_type: null,
    venue_name: null,
    venue_osm_id: null,
    city: null,
    country: null,
    date,
    time: null,
    seats: null,
    price: null,
    confidence: "low",
    reason: "",
  };
}

// Bulk import (#17, #18): drop exported confirmation emails or a set of
// photos, see what was read from each, correct the drafts, and save the ones
// you tick. Nothing is written until "Save". Built from the shared
// lib/import steps so a mobile-first flow can reuse them.
//
// `admin` (the admin import page only) adds the model picker and compares
// models side by side. Without it, every source goes to the default chain,
// exactly as for any other user.
export function ImportTool({ admin = false }: { admin?: boolean }) {
  const id = useId();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [emails, setEmails] = useState<Map<string, ParsedEmail>>(new Map());
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // COMPARE_ALL (default), DEFAULT_CHAIN, or "provider[:model]" (see ModelPicker).
  const [model, setModel] = useState(admin ? COMPARE_ALL : DEFAULT_CHAIN);
  const [providers, setProviders] = useState<ProvidersInfo | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [existing, setExisting] = useState<{ id: string; date: string; show_id: string }[]>([]);
  const [visibility, setVisibility] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const imported = useFreshOnReturn(reset);

  // Unique refs across several drops in one session.
  const seq = useRef(0);
  // Latest drafts for async steps (merging into a draft added meanwhile).
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const urls = useRef<string[]>([]);
  const existingRef = useRef(existing);
  existingRef.current = existing;
  // Per source: how to turn an attempt into drafts, and the drafts it made,
  // so "Use this" can swap one model's reading for another's.
  // A null attempt makes a blank draft to fill in by hand.
  const appliers = useRef(new Map<string, (attempt: Attempt | null) => Promise<string[]>>());
  const jobDrafts = useRef(new Map<string, string[]>());

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: claims } = await supabase.auth.getClaims();
      const uid = claims?.claims?.sub;
      if (!uid) return;
      setUserId(uid);
      const [profile, cols, entries] = await Promise.all([
        supabase.from("profiles").select("default_visibility").eq("id", uid).single(),
        supabase
          .from("collections")
          .select(TRIP_SELECT)
          .eq("user_id", uid)
          .eq("kind", "trip")
          .order("start_date", { ascending: false }),
        supabase.from("entries").select("id, date, show_id").eq("user_id", uid),
      ]);
      setVisibility(profile.data?.default_visibility ?? null);
      setCollections((cols.data as Collection[] | null) ?? []);
      setExisting((entries.data as typeof existing | null) ?? []);
    })();
  }, []);

  // Preview URLs are freed by reset(), not in an effect cleanup: that also runs
  // when the page is hidden, and the kept drafts would come back with broken
  // previews. The browser frees any left when the tab closes.

  useEffect(() => {
    if (!admin) return;
    fetch("/api/ai/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProvidersInfo | null) => setProviders(data))
      .catch(() => setProviders(null));
  }, [admin]);

  const updateJob = (ref: string, patch: Partial<Job>) =>
    setJobs((js) => js.map((j) => (j.ref === ref ? { ...j, ...patch } : j)));
  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  // A new reading either joins a draft for the same show and date (a
  // reminder for a booking already read) or becomes a new draft, which is
  // then matched to the catalogue.
  async function addReading(reading: Reading, extra: Pick<Draft, "nearby" | "place" | "photos" | "unread">): Promise<{ key: string; created: boolean }> {
    const same = draftsRef.current.find(
      (d) =>
        d.status !== "saved" &&
        // One photo per entry: a photo only joins a draft that has none (its booking email).
        (GROUP_VISITS || !extra.photos.length || !d.photos.length) &&
        mergeReadings([d.reading, reading]).length === 1,
    );
    if (same) {
      // Functional update: other jobs may be updating drafts at the same time.
      setDrafts((ds) =>
        ds.map((d) =>
          d.key === same.key
            ? { ...d, reading: mergeReadings([d.reading, reading])[0], photos: [...d.photos, ...extra.photos] }
            : d,
        ),
      );
      return { key: same.key, created: false };
    }
    const e = reading.extracted;
    const key = `draft-${++seq.current}`;
    const draft: Draft = {
      key,
      reading,
      show: null,
      venue: null,
      date: e.date ?? "",
      rating: null,
      note: "",
      include: false,
      suggestion: null,
      ...extra,
      photoIndex: extra.photos.length ? 0 : null,
      status: "resolving",
    };
    // The ref is updated now so a reading arriving before the next render
    // still finds this draft to merge into.
    draftsRef.current = [...draftsRef.current, draft];
    setDrafts((ds) => [...ds, draft]);

    const supabase = createClient();
    // Same rule as the log form: low confidence never fills a field.
    const confident = e.confidence !== "low";
    const [show, venue] = await Promise.all([
      confident ? resolveShow(supabase, e) : Promise.resolve(null),
      resolveVenue(supabase, confident ? e : { ...e, venue_name: null, venue_osm_id: null }, extra.nearby, extra.place),
    ]);
    const duplicate = Boolean(show?.id && existingRef.current.some((x) => x.show_id === show.id && x.date === e.date));
    updateDraft(key, {
      show,
      venue,
      suggestion: !confident && e.show_title ? e.show_title : null,
      include: Boolean(show && venue && e.date && !duplicate),
      status: "ready",
    });
    return { key, created: true };
  }

  // Which models to ask for one source: in compare mode, a column per
  // compare model of each configured provider that has some (photos: only
  // providers that read images); otherwise the one picked.
  function targets(chosen: string, images: boolean): string[] {
    if (chosen !== COMPARE_ALL) return [chosen === DEFAULT_CHAIN ? "" : chosen];
    const ids = (providers?.providers ?? [])
      .filter((p) => p.configured && (!images || p.images))
      .flatMap((p) => p.compareModels.map((m) => `${p.id}:${m}`));
    // Provider list not loaded (or nothing configured): the server decides.
    return ids.length ? ids : [""];
  }

  // Asks each model in parallel and shows each answer as it lands.
  async function runAttempts(ref: string, models: string[], call: (model: string) => Promise<Omit<Attempt, "model" | "state" | "ms">>) {
    updateJob(ref, { attempts: models.map((model) => ({ model, state: "running", ms: null, readBy: null, shows: [], note: null })) });
    return Promise.all(
      models.map(async (model) => {
        const started = performance.now();
        let attempt: Attempt;
        try {
          attempt = { model, state: "done", ...(await call(model)), ms: performance.now() - started };
        } catch (err) {
          const note = err instanceof Error ? err.message : "Failed";
          attempt = { model, state: "failed", ms: performance.now() - started, readBy: null, shows: [], note };
        }
        setJobs((js) => js.map((j) => (j.ref === ref ? { ...j, attempts: j.attempts?.map((x) => (x.model === model ? attempt : x)) } : j)));
        return attempt;
      }),
    );
  }

  // Turns one attempt into drafts, replacing drafts an earlier choice made
  // for this source (unless saved, or shared with another source). With no
  // attempt, `manual` leaves a blank draft to fill in by hand.
  async function chooseAttempt(ref: string, attempt: Attempt | null, manual = false) {
    const previous = new Set(jobDrafts.current.get(ref) ?? []);
    if (previous.size) {
      draftsRef.current = draftsRef.current.filter((d) => !previous.has(d.key) || d.status === "saved");
      setDrafts((ds) => ds.filter((d) => !previous.has(d.key) || d.status === "saved"));
    }
    jobDrafts.current.set(ref, []);
    updateJob(ref, { chosen: attempt?.model ?? null, found: attempt?.shows.length ?? 0 });
    if (!attempt && !manual) return;
    const created = await appliers.current.get(ref)?.(attempt);
    jobDrafts.current.set(ref, created ?? []);
  }

  async function finishJob(ref: string, attempts: Attempt[], kind: "email" | "identify") {
    const order = (providers?.defaults[kind] ?? []).map((m) => m.split(":")[0]);
    const best = pickBest(attempts, order);
    const done = attempts.some((a) => a.state === "done");
    updateJob(ref, {
      state: done ? "done" : "failed",
      detail: best ? best.note : (attempts.find((a) => a.note)?.note ?? null),
    });
    // A photo visit is always worth logging; an email only when reading it
    // failed (not when it simply wasn't a booking).
    await chooseAttempt(ref, best, kind === "identify" || !done);
  }

  async function readEmails(files: File[], text?: string) {
    // The model picked when the files were added, even if changed meanwhile.
    const chosen = model;
    const parsed: ParsedEmail[] = [];
    for (const f of files) {
      try {
        if (/\.msg$/i.test(f.name)) throw new Error("Outlook .msg files aren’t supported; save as .eml instead.");
        parsed.push(...parseEmailFile(f.name, await f.text()));
      } catch (err) {
        const ref = `${f.name}@${++seq.current}`;
        setJobs((js) => [...js, { ref, kind: "email", label: f.name, detail: err instanceof Error ? err.message : "Unreadable file", state: "failed", found: 0 }]);
      }
    }
    if (text?.trim()) parsed.push(...parseEmailFile(`Pasted email ${++seq.current}`, text));
    // Unique refs even when the same file is dropped twice.
    const batch = parsed.map((p) => ({ ...p, ref: `${p.ref}@${++seq.current}` }));
    setEmails((m) => new Map([...m, ...batch.map((p) => [p.ref, p] as const)]));
    setJobs((js) => [
      ...js,
      ...batch.map((p): Job => ({
        ref: p.ref,
        kind: "email",
        label: p.subject ?? p.fileName,
        detail: p.text ? null : "No readable text",
        state: p.text ? "queued" : "failed",
        found: 0,
      })),
    ]);

    const models = targets(chosen, false);
    await runPool(batch.filter((p) => p.text), EMAIL_CONCURRENCY, async (email) => {
      updateJob(email.ref, { state: "reading" });
      appliers.current.set(email.ref, async (attempt) => {
        const source = { kind: "email" as const, ref: email.ref, fileName: email.fileName, subject: email.subject, from: email.from, sent: email.sent, trimmed: email.trimmed, readBy: attempt?.readBy ?? null };
        if (!attempt) {
          const added = await addReading({ extracted: blank(null), sources: [source] }, { nearby: [], place: { city: null, country: null }, photos: [], unread: true });
          return added.created ? [added.key] : [];
        }
        const keys: string[] = [];
        for (const extracted of attempt.shows) {
          const added = await addReading({ extracted, sources: [source] }, { nearby: [], place: { city: extracted.city, country: extracted.country }, photos: [] });
          if (added.created) keys.push(added.key);
        }
        return keys;
      });
      const attempts = await runAttempts(email.ref, models, async (m) => {
        const res = await fetch("/api/import/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: email.subject, from: email.from, sent: email.sent, text: email.text, model: m || undefined }),
        });
        if (!res.ok) {
          const { error: code, detail } = (await res.json().catch(() => ({}))) as { error?: string; detail?: string | null };
          throw new Error(
            res.status === 503
              ? "Import isn’t set up yet (no API key)."
              : res.status === 429
                ? "Too many at once. Try again in a few minutes."
                : code === "model_unavailable" || code === "invalid_model"
                  ? `Can’t use ${m}: no API key, or not a valid model.`
                  : // Admins also see the provider's raw reply, to debug a model.
                    `${importErrorText("email", detail)}${admin && detail ? ` ${detail}` : ""}`,
          );
        }
        const { result, model: readBy } = (await res.json()) as { result: EmailExtraction | null; model: string | null };
        const shows = result?.shows ?? [];
        const note =
          result?.kind === "not_a_booking" || !shows.length
            ? "No booking found"
            : result?.kind && result.kind !== "booking"
              ? `${result.kind[0].toUpperCase()}${result.kind.slice(1)}`
              : null;
        return { readBy, shows, note };
      });
      await finishJob(email.ref, attempts, "email");
    });
  }

  async function readPhotos(files: File[]) {
    const chosen = model;
    // Read and re-encode every photo on the device first, so they can be
    // grouped by visit before any AI call.
    const items: PhotoItem[] = [];
    const prepRef = `prep@${++seq.current}`;
    setJobs((js) => [...js, { ref: prepRef, kind: "photos", label: `${files.length} photo${files.length === 1 ? "" : "s"}`, detail: null, state: "reading", found: 0 }]);
    const failed: string[] = [];
    await runPool(files, 3, async (file) => {
      try {
        const prepared = await preparePhoto(file);
        const previewUrl = URL.createObjectURL(prepared.stored);
        urls.current.push(previewUrl);
        items.push({ ...prepared, ref: `${file.name}@${++seq.current}`, fileName: file.name, previewUrl });
      } catch {
        failed.push(file.name);
      }
    });
    const when = (p: PhotoItem) => `${p.meta.date ?? "9999"} ${p.meta.time ?? "99:99"}`;
    // Without grouping, each photo is its own visit, in time order.
    const groups = GROUP_VISITS
      ? groupPhotos(items.map((p) => ({ ...p, ...p.meta })))
      : [...items].sort((a, b) => when(a).localeCompare(when(b))).map((p) => [{ ...p, ...p.meta }]);
    updateJob(prepRef, {
      state: failed.length && !items.length ? "failed" : "done",
      label: `${items.length} photo${items.length === 1 ? "" : "s"} read${GROUP_VISITS ? `, ${groups.length} visit${groups.length === 1 ? "" : "s"}` : ""}`,
      detail: failed.length
        ? `Couldn’t open ${failed.join(", ")}. HEIC only opens in Safari; export as JPEG for other browsers.`
        : null,
    });

    const groupJobs = groups.map((g) => {
      const first = g[0];
      const when = first.date ? `${first.date}${first.time ? ` ${first.time}` : ""}` : "No date";
      return { ref: `visit-${++seq.current}`, group: g, label: `${when} · ${g.length} photo${g.length === 1 ? "" : "s"}` };
    });
    setJobs((js) => [
      ...js,
      ...groupJobs.map((j): Job => ({
        ref: j.ref,
        kind: "photos",
        label: j.label,
        detail: null,
        state: "queued",
        found: 0,
        thumbs: j.group.map((p) => p.previewUrl),
      })),
    ]);

    const models = targets(chosen, true);
    await runPool(groupJobs, PHOTO_CONCURRENCY, async ({ ref, group }) => {
      const point = centroid(group);
      const dated = group.find((p) => p.date) ?? group[0];
      let nearby: Draft["nearby"] = [];
      let place: Draft["place"] = { city: null, country: null };
      if (point) {
        updateJob(ref, { state: "nearby" });
        ({ candidates: nearby, place } = await lookupNearby(point.lat, point.lng, visitAccuracy(group.map((p) => p.meta))));
      }
      const where = [place.city, nearby.length ? `${nearby.length} theatre${nearby.length === 1 ? "" : "s"} nearby` : point ? "no theatre found nearby" : "no location in photo"]
        .filter(Boolean)
        .join(" · ");
      updateJob(ref, { state: "identifying", label: `${groupJobs.find((j) => j.ref === ref)?.label} · ${where}` });

      appliers.current.set(ref, async (attempt) => {
        const sources: PhotoSource[] = group.map((p) => ({
          kind: "photo",
          ref: p.ref,
          fileName: p.fileName,
          previewUrl: p.previewUrl,
          date: p.meta.date,
          time: p.meta.time,
          hasLocation: p.meta.lat != null,
          readBy: attempt?.readBy ?? null,
        }));
        const extracted = attempt?.shows[0];
        const added = await addReading(
          { extracted: extracted ?? { ...blank(dated.meta.date), city: place.city, country: place.country }, sources },
          { nearby, place, photos: group.map((p) => ({ stored: p.stored, previewUrl: p.previewUrl })), unread: !extracted },
        );
        return added.created ? [added.key] : [];
      });

      const photos = pickSpread(group, MAX_IDENTIFY_PHOTOS).map((p) => p.small);
      const attempts = await runAttempts(ref, models, async (m) => {
        const outcome = await requestIdentify({ photos, meta: dated.meta, point, place, candidates: nearby, model: m || undefined });
        if (outcome.error) {
          throw new Error(
            outcome.error === "not_configured"
              ? "Show detection isn’t set up yet (no API key)."
              : outcome.error === "model_unavailable"
                ? `Can’t use ${m} for photos: no API key, or it can’t read images.`
                : `${importErrorText("photo", outcome.detail)}${admin && outcome.detail ? ` ${outcome.detail}` : ""}`,
          );
        }
        const r = outcome.result;
        const shows = r && (r.show_title || r.venue_name) ? [{ ...fromIdentification(r, dated.meta.date), city: place.city, country: place.country }] : [];
        return { readBy: outcome.model ?? null, shows, note: shows.length ? null : "Couldn’t tell the show from these photos." };
      });
      await finishJob(ref, attempts, "identify");
    });
  }

  function onFiles(list: FileList | File[]) {
    const files = [...list];
    setNotice(null);
    const photos = files.filter(isImage);
    const others = files.filter((f) => !isImage(f));
    if (photos.length) void readPhotos(photos);
    if (others.length) void readEmails(others);
  }

  const providerNames = Object.fromEntries((providers?.providers ?? []).map((p) => [p.id, p.name]));
  const modelName = (a: Attempt | undefined) => (a ? (a.readBy ?? (a.model || "the default chain")) : "");

  const duplicateOf = (d: Draft) =>
    (d.show?.id && d.date && existing.find((x) => x.show_id === d.show!.id && x.date === d.date)?.id) || null;

  const toSave = drafts.filter((d) => d.include && d.status !== "saved" && d.status !== "resolving");
  // Ticked drafts that Save found incomplete and still are.
  const blocked = toSave.filter((d) => d.flagged && missingFields(d).length);
  const busy = jobs.some((j) => j.state !== "done" && j.state !== "failed");

  async function saveAll() {
    if (!userId) return setNotice("You’re signed out. Sign in again to save.");
    // Each card marks what it still needs; the list above Save links to them.
    const incomplete = toSave.filter((d) => missingFields(d).length);
    if (incomplete.length) {
      setNotice(null);
      incomplete.forEach((d) => updateDraft(d.key, { flagged: true }));
      return goToDraft(incomplete[0].key);
    }

    setSaving(true);
    setNotice(null);
    const supabase = createClient();
    let saved = 0;
    let photoFailures = 0;
    // One at a time, so two drafts for the same new show or venue reuse the
    // row the first one created instead of adding a duplicate.
    for (const d of toSave) {
      updateDraft(d.key, { status: "saving", error: undefined });
      try {
        const photo = d.photoIndex != null ? (d.photos[d.photoIndex]?.stored ?? null) : null;
        const result = await saveDraft(supabase, userId, {
          show: d.show!,
          venue: d.venue!,
          date: d.date,
          rating: d.rating,
          note: d.note,
          // A trip holds only shows within its dates; others are saved without it.
          collectionIds: collectionIds.filter((cid) => {
            const trip = collections.find((c) => c.id === cid);
            return trip ? tripCovers(trip, d.date) : false;
          }),
          photo,
        });
        saved++;
        if (result.photoFailed) photoFailures++;
        updateDraft(d.key, { status: "saved", entryId: result.id });
        // A later import of the same email or photo is then flagged as a duplicate.
        if (d.show?.id) setExisting((xs) => [...xs, { id: result.id, date: d.date, show_id: d.show!.id! }]);
      } catch (err) {
        updateDraft(d.key, { status: "failed", error: err instanceof SaveError ? err.message : String(err) });
      }
    }
    setSaving(false);
    // All saved: the import is done, so it starts over the next time it's shown.
    if (saved === toSave.length && !busy) imported();
    setNotice(
      `Saved ${saved} of ${toSave.length}.${photoFailures ? ` ${photoFailures} photo${photoFailures === 1 ? "" : "s"} didn’t upload; add them from the entry.` : ""}`,
    );
  }

  function goToDraft(key: string) {
    // After the render that marks it.
    requestAnimationFrame(() => {
      const card = document.getElementById(draftCardId(key));
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      card?.focus({ preventScroll: true });
    });
  }

  // How a draft is named in the list of ones that can't be saved yet.
  function draftName(d: Draft) {
    const title = d.show?.title ?? d.reading.extracted.show_title;
    const source = d.reading.sources[0];
    const from = source?.kind === "email" ? (source.subject ?? source.fileName) : `${d.photos.length} photo${d.photos.length === 1 ? "" : "s"}`;
    const when = d.date ? formatDate(d.date, { day: "numeric", month: "short", year: "numeric" }) : null;
    return [title ?? `Unknown show (${from})`, when].filter(Boolean).join(", ");
  }

  function reset() {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setJobs([]);
    setDrafts([]);
    draftsRef.current = [];
    setEmails(new Map());
    appliers.current.clear();
    jobDrafts.current.clear();
    setNotice(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sources */}
      <section aria-labelledby={`${id}-add`} className="flex flex-col gap-3">
        <h2 id={`${id}-add`} className="text-title-2 font-display text-label">
          Add emails or photos
        </h2>
        {admin && <ModelPicker value={model} onChange={setModel} info={providers} />}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-8 text-center shadow-sm ${
            dragging ? "border-tint bg-tint-fill" : "border-outline bg-surface"
          }`}
        >
          {/* Drag and drop needs a mouse or trackpad; phones get tap wording. */}
          <p className="text-headline text-label">
            <span className="hidden [@media(pointer:fine)]:inline">Drop your ticket emails or photos here</span>
            <span className="[@media(pointer:fine)]:hidden">Add your ticket emails or photos</span>
          </p>
          <p className="max-w-[420px] text-subheadline text-label-secondary">
            We read the show, theatre and date from ticket confirmation emails, and the date and place from photos taken at the theatre. Each photo becomes its own show to check.
          </p>
          <p className="max-w-[420px] text-footnote text-label-secondary">
            Emails saved from your mail app (.eml or .mbox) or as a web page (.html) all work.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text hover:bg-fill focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
              Choose emails
              <input
                type="file"
                multiple
                accept={EMAIL_FILE_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-pill bg-tint-fill px-4 text-subheadline font-semibold text-tint-text hover:bg-fill focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
              Choose photos
              <input
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-subheadline font-semibold text-tint-text">Or paste an email</summary>
          <div className="flex flex-col gap-2 pt-1">
            <label htmlFor={`${id}-paste`} className="sr-only">
              Email text
            </label>
            <textarea
              id={`${id}-paste`}
              rows={6}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Paste the whole confirmation email"
              className="block w-full rounded-md border border-separator bg-surface px-4 py-3 text-body text-label shadow-sm placeholder:text-label-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={!pasted.trim()}
              onClick={() => {
                void readEmails([], pasted);
                setPasted("");
              }}
            >
              Read email
            </Button>
          </div>
        </details>
      </section>

      {/* What we read from each source */}
      {jobs.length > 0 && (
        // Admin: wider than the app column on desktop, so compared answers sit
        // side by side; the column width on phones.
        <section
          aria-labelledby={`${id}-read`}
          className={`flex flex-col gap-3 ${admin ? "lg:relative lg:left-1/2 lg:w-[min(1120px,calc(100vw-4rem))] lg:-translate-x-1/2" : ""}`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={`${id}-read`} className="text-title-2 font-display text-label">
              What we read
            </h2>
            {!busy && !saving && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Start over
              </Button>
            )}
          </div>
          <ul className="overflow-hidden rounded-md border border-separator bg-surface shadow-sm" aria-live="polite">
            {jobs.map((j) => (
              <li key={j.ref} className="flex items-start gap-3 border-b border-separator px-4 py-3 last:border-b-0">
                <span aria-hidden="true" className="mt-1 flex size-4 shrink-0 items-center justify-center">
                  {j.state === "done" ? (
                    <span className="text-tint-text">✓</span>
                  ) : j.state === "failed" ? (
                    <span className="text-destructive">!</span>
                  ) : j.state === "queued" ? (
                    <span className="size-2 rounded-full bg-outline" />
                  ) : (
                    <span className="size-3 animate-spin rounded-full border-2 border-outline border-t-transparent" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {j.thumbs && j.thumbs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {j.thumbs.map((src, i) => (
                        // Opens the full photo in a new tab to check details.
                        <a
                          key={src}
                          href={src}
                          target="_blank"
                          rel="noopener"
                          aria-label={`Open photo ${i + 1} of this visit`}
                          className="overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob */}
                          <img src={src} alt="" className="h-20 w-auto max-w-32 object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="truncate text-body text-label">{j.label}</p>
                    <p className={`text-footnote ${j.state === "failed" ? "text-destructive" : "text-label-secondary"}`}>
                      {j.state === "done"
                        ? [
                            j.found ? `${j.found} show${j.found === 1 ? "" : "s"} found` : null,
                            j.detail,
                            admin && j.attempts && j.chosen != null && `drafts from ${modelName(j.attempts.find((a) => a.model === j.chosen))}`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Done"
                        : j.state === "failed"
                          ? // Its blank draft is in the review list below.
                            `${j.detail ?? "Failed"}${j.kind === "photos" && j.thumbs ? " Add it yourself below." : ""}`
                          : STATE_TEXT[j.state]}
                    </p>
                  </div>
                  {admin && j.attempts && j.attempts.length > 1 && (
                    <CompareGrid
                      attempts={j.attempts}
                      names={providerNames}
                      chosen={j.chosen ?? null}
                      disabled={saving || j.state !== "done"}
                      onUse={(attempt) => void chooseAttempt(j.ref, attempt)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Drafts to review */}
      {drafts.length > 0 && (
        <section aria-labelledby={`${id}-review`} className="flex flex-col gap-3">
          <h2 id={`${id}-review`} className="text-title-2 font-display text-label">
            Review {drafts.length} show{drafts.length === 1 ? "" : "s"}
          </h2>
          <p className="text-footnote text-label-secondary">
            Ticked shows are saved; nothing is saved until you press Save. Guesses aren’t filled in: tap “Maybe…” to use one. Anything we couldn’t read is here too, to fill in yourself.
          </p>
          {drafts.map((d) => (
            <DraftCard
              key={d.key}
              draft={d}
              duplicateOf={duplicateOf(d)}
              emailText={(ref) => emails.get(ref)?.text}
              onChange={(patch) => updateDraft(d.key, { ...patch, ...(d.error ? { error: undefined } : {}) })}
            />
          ))}

          {collections.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <span id={`${id}-trips`} className="text-subheadline font-medium text-label">
                Add shows within its dates to trip
              </span>
              <div role="group" aria-labelledby={`${id}-trips`} className="flex flex-wrap gap-2">
                {collections.map((c) => (
                  <Chip
                    key={c.id}
                    selected={collectionIds.includes(c.id)}
                    onClick={() =>
                      setCollectionIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                    }
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {blocked.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border-2 border-destructive bg-surface p-4 shadow-sm">
          <p className="text-subheadline font-semibold text-destructive">
            {blocked.length} ticked show{blocked.length === 1 ? " needs" : "s need"} more before saving
          </p>
          <ul className="flex flex-col">
            {blocked.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => goToDraft(d.key)}
                  className="flex min-h-11 w-full flex-col items-start justify-center py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="text-body font-semibold text-tint-text underline">{draftName(d)}</span>
                  <span className="text-footnote text-label-secondary">Needs {describeMissing(missingFields(d))}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-footnote text-label-secondary">Fill them in, or untick Save on them to save the rest.</p>
        </div>
      )}

      {notice && (
        <p role="status" className="text-footnote text-label">
          {notice}
        </p>
      )}

      {drafts.length > 0 && (
        // Sits on the tab bar (49px), or the bottom edge from md where the sidebar replaces it, like the log form's Save.
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+49px)] z-10 md:bottom-0 -mx-4 flex flex-col gap-1 bg-background/90 px-4 pt-3 pb-4 md:pb-5 backdrop-blur">
          <Button className="w-full" disabled={saving || !toSave.length} onClick={() => void saveAll()}>
            {saving ? "Saving…" : toSave.length ? `Save ${toSave.length} show${toSave.length === 1 ? "" : "s"}` : "Tick shows to save"}
          </Button>
          {visibility && (
            <p className="text-center text-footnote text-label-secondary">
              Saved as {visibility}, your default. Change any entry afterwards.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
