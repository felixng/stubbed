"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatDate, TRIP_SELECT, tripCovers, type Collection } from "@/lib/entries";
import {
  centroid,
  describeMissing,
  groupPhotos,
  mergeReadings,
  missingFields,
  visitAccuracy,
  type Extracted,
  type PhotoSource,
  type Reading,
} from "@/lib/import/drafts";
import { lookupNearby, preparePhoto, type PreparedPhoto } from "@/lib/import/photo-pipeline";
import { resolveShow, resolveVenue, runPool, saveDraft, SaveError } from "@/lib/import/resolve";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { PhotoCropDialog } from "../log/PhotoCropDialog";
import { renderPhotoCrop, squareCrop } from "@/lib/photo-crop";
import { DraftCard, draftCardId, type Draft } from "./DraftCard";

// One thing being read: a group of photos from one visit.
type Job = {
  ref: string;
  kind: "photos";
  label: string;
  detail: string | null;
  state: "queued" | "reading" | "nearby" | "done" | "failed";
  found: number;
  // The visit's photos, so it's clear which photo the results are about.
  thumbs?: string[];
};

type PhotoItem = PreparedPhoto & { ref: string; fileName: string; previewUrl: string };

const STATE_TEXT: Record<Job["state"], string> = {
  queued: "Waiting",
  reading: "Reading",
  nearby: "Finding nearby theatres",
  done: "Done",
  failed: "Failed",
};

const PHOTO_CONCURRENCY = 3;

// One photo per entry for now, even for shots from the same evening: several
// photos per entry is planned as a later (likely paid) feature. Turned off in
// the UI only; visit grouping and merging stay in lib/import for then.
const GROUP_VISITS = false;

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name);

// A photo becomes a draft with its date, nearby theatres and place filled in;
// the show is picked by hand.
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

// Bulk import (#17, #18): drop a set of photos, see what was read from each, correct the drafts, and save the ones
// you tick. Nothing is written until "Save". Built from the shared
// lib/import steps so a mobile-first flow can reuse them.
//
export function ImportTool() {
  const id = useId();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
  const urls = useRef<string[]>([]);
  const existingRef = useRef(existing);
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

  // Async steps read the latest values through these refs.
  useEffect(() => {
    draftsRef.current = drafts;
    existingRef.current = existing;
  });

  // Preview URLs are freed by reset(), not in an effect cleanup: that also runs
  // when the page is hidden, and the kept drafts would come back with broken
  // previews. The browser frees any left when the tab closes.

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

  async function readPhotos(files: File[]) {
    // Read and re-encode every photo on the device first.
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
      const sources: PhotoSource[] = group.map((p) => ({
        kind: "photo",
        ref: p.ref,
        fileName: p.fileName,
        previewUrl: p.previewUrl,
        date: p.meta.date,
        time: p.meta.time,
        hasLocation: p.meta.lat != null,
        readBy: null,
      }));
      const added = await addReading(
        { extracted: { ...blank(dated.meta.date), city: place.city, country: place.country }, sources },
        { nearby, place, photos: group.map((p) => ({ stored: p.stored, previewUrl: p.previewUrl })), unread: true },
      );
      updateJob(ref, { state: "done", found: added.created ? 1 : 0, label: `${groupJobs.find((j) => j.ref === ref)?.label} · ${where}` });
    });
  }

  function onFiles(list: FileList | File[]) {
    const files = [...list];
    setNotice(null);
    const photos = files.filter(isImage);
    if (photos.length) void readPhotos(photos);
    if (photos.length < files.length) setNotice("Only photos can be imported for now. Importing ticket emails is paused.");
  }

  const duplicateOf = (d: Draft) =>
    (d.show?.id && d.date && existing.find((x) => x.show_id === d.show!.id && x.date === d.date)?.id) || null;

  const toSave = drafts.filter((d) => d.include && d.status !== "saved" && d.status !== "resolving");
  // Ticked drafts that Save found incomplete and still are.
  const blocked = toSave.filter((d) => d.flagged && missingFields(d).length);
  const busy = jobs.some((j) => j.state !== "done" && j.state !== "failed");

  const [cropKey, setCropKey] = useState<string | null>(null);
  const cropDraft = drafts.find((draft) => draft.key === cropKey);
  const cropIndex = cropDraft?.photoIndex ?? null;
  const cropSource = cropIndex == null ? null : cropDraft?.photos[cropIndex]?.stored;

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
      const retryId = d.retryId ?? crypto.randomUUID();
      updateDraft(d.key, { status: "saving", retryId, error: undefined });
      try {
        const source = d.photoIndex != null ? (d.photos[d.photoIndex]?.stored ?? null) : null;
        let cropped = d.crop?.index === d.photoIndex ? d.crop?.photo : undefined;
        if (source && !cropped) {
          const bitmap = await createImageBitmap(source);
          const crop = squareCrop(bitmap.width, bitmap.height);
          bitmap.close();
          cropped = { ...await renderPhotoCrop(source, crop), requestId: crypto.randomUUID(), replacing: null };
        }
        const photo = cropped?.display ?? null;
        if (cropped && d.photoIndex != null && d.crop?.index !== d.photoIndex) {
          const previewUrl = URL.createObjectURL(cropped.display);
          urls.current.push(previewUrl);
          updateDraft(d.key, { crop: { index: d.photoIndex, previewUrl, photo: cropped } });
        }
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
          croppedPhoto: cropped,
          alias: d.reading.sources.some((src) => src.kind === "email") ? d.reading.extracted.show_title : null,
        }, retryId);
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
    setNotice(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {cropSource && cropDraft && cropIndex != null && (
        <PhotoCropDialog source={cropSource}
          rectangle={cropDraft.crop?.index === cropIndex ? cropDraft.crop.photo.rectangle : undefined} onCancel={() => setCropKey(null)}
          onConfirm={(photo) => {
            if (cropDraft.crop) URL.revokeObjectURL(cropDraft.crop.previewUrl);
            const previewUrl = URL.createObjectURL(photo.display);
            urls.current.push(previewUrl);
            updateDraft(cropDraft.key, { crop: { index: cropIndex, previewUrl,
              photo: { ...photo, requestId: crypto.randomUUID(), replacing: null } } });
            setCropKey(null);
          }} />
      )}
      {/* Sources */}
      <section aria-labelledby={`${id}-add`} className="flex flex-col gap-3">
        <h2 id={`${id}-add`} className="text-title-2 font-display text-label">
          Add photos
        </h2>
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
            <span className="hidden [@media(pointer:fine)]:inline">Drop your photos here</span>
            <span className="[@media(pointer:fine)]:hidden">Add your photos</span>
          </p>
          <p className="max-w-[420px] text-subheadline text-label-secondary">
            We read the date and place from photos taken at the theatre. Each photo becomes its own show to check.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
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
      </section>

      {/* What we read from each source */}
      {jobs.length > 0 && (
        <section aria-labelledby={`${id}-read`} className="flex flex-col gap-3">
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
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Done"
                        : j.state === "failed"
                          ? // Its blank draft is in the review list below.
                            `${j.detail ?? "Failed"}${j.kind === "photos" && j.thumbs ? " Add it yourself below." : ""}`
                          : STATE_TEXT[j.state]}
                    </p>
                  </div>
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
            <div key={d.key}>
            {d.photoIndex != null && d.status !== "saved" && (
              <button type="button" className="mb-2 min-h-11 px-3 text-tint-text"
                onClick={() => setCropKey(d.key)}>Crop photo</button>
            )}
            <DraftCard
              key={d.key}
              draft={d}
              duplicateOf={duplicateOf(d)}
              emailText={() => undefined}
              onChange={(patch) => updateDraft(d.key, { ...patch, ...(d.error ? { error: undefined } : {}) })}
            />
            </div>
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
