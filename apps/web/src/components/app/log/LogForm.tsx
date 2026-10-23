"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { track } from "@/lib/analytics";
import {
  ensureShow,
  ensureVenue,
  localToday,
  PHOTO_BUCKET,
  photoPath,
  statusFor,
  TRIP_SELECT,
  tripsCovering,
  type Collection,
  type NewShow,
  type Show,
  type Venue,
  type Visibility,
} from "@/lib/entries";
import type { Identification } from "@/lib/identify";
import { lookupNearby, preparePhoto, requestIdentify, type Place, type PreparedPhoto } from "@/lib/import/photo-pipeline";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { DateField } from "../DateField";
import { RatingInput } from "./RatingInput";
import { ShowField } from "./ShowField";
import { VenueField, type NearbyVenue, type VenueChoice } from "./VenueField";

export type EntryDraft = {
  id: string;
  show: Show;
  venue: Venue | null;
  date: string;
  rating: number | null;
  note: string | null;
  visibility: Visibility;
  collectionIds: string[];
  photoUrl: string | null;
  photoPath: string | null;
};

type Photo = { stored: Blob; previewUrl: string };

// What the photo tells us, step by step. Each step fills only fields the
// user hasn't set, and only when it's confident; otherwise it offers a chip.
// The form stays usable throughout. Removing or replacing the photo clears
// what it filled.
type Detect =
  | { step: "idle" }
  | { step: "reading" | "nearby" | "identifying" }
  | { step: "done"; result: Identification | null; note?: string };

const label = "text-subheadline font-medium text-label";

// Show detection can take a while with a web search; after this the pill
// gives up quietly and the late answer is ignored.
const IDENTIFY_TIMEOUT_MS = 20_000;

// The device's date, read on the client only (null while prerendering), so
// "today" is where the phone is, not where the server is.
const noSubscribe = () => () => {};
function useToday() {
  return useSyncExternalStore(noSubscribe, () => localToday(), () => null);
}

// Log or edit an entry (#14). New entries start photo first: the photo's
// date fills the date at once, its location finds nearby theatres within
// about a second, and the AI's show suggestion arrives when it's ready.
// Nothing waits on it: every field can be used, and Save works, throughout.
//
// After a save the form starts over the next time it's shown (see
// useFreshOnReturn). An unsaved draft is kept, so a stray tap on another tab
// doesn't lose it.
export function LogForm({ initial }: { initial?: EntryDraft }) {
  const [round, setRound] = useState(0);
  const saved = useFreshOnReturn(() => setRound((r) => r + 1));
  return <EntryForm key={round} initial={initial} onSaved={saved} />;
}

function EntryForm({ initial, onSaved }: { initial?: EntryDraft; onSaved: () => void }) {
  const id = useId();
  const router = useRouter();
  const editing = Boolean(initial);

  // Photo first for new entries; "fill in by hand" skips straight to the form.
  const [started, setStarted] = useState(editing);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(initial?.photoUrl ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [detect, setDetect] = useState<Detect>({ step: "idle" });
  const [nearby, setNearby] = useState<NearbyVenue[]>([]);
  const [place, setPlace] = useState<{ city: string | null; country: string | null }>({ city: null, country: null });
  const [suggestion, setSuggestion] = useState<Identification | null>(null);
  // A photo is being dragged over a drop area (desktop).
  const [dragging, setDragging] = useState(false);
  // Several photos were dropped: one entry takes one photo.
  const [dropNote, setDropNote] = useState<string | null>(null);
  // A venue the AI matched that differs from the one already picked.
  const [venueSuggestion, setVenueSuggestion] = useState<VenueChoice | null>(null);

  const [show, setShow] = useState<Show | NewShow | null>(initial?.show ?? null);
  const [venue, setVenue] = useState<VenueChoice | null>(initial?.venue ?? null);
  // Empty until picked: it then shows the phone's today, not the server's.
  const [pickedDate, setDate] = useState(initial?.date ?? "");
  const today = useToday();
  const date = pickedDate || today || "";
  // A date after today is a show you're going to: no rating yet, venue optional.
  const planned = Boolean(today && date && statusFor(date, today) === "planned");
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "public");
  const [collectionIds, setCollectionIds] = useState<string[]>(initial?.collectionIds ?? []);

  const [userId, setUserId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recent, setRecent] = useState<{ show_id: string; venue: Venue }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = detect.step === "reading" || detect.step === "nearby" || detect.step === "identifying";
  const identifying = detect.step === "identifying";

  // Fields the user set themselves; detection never overwrites these.
  const touched = useRef({ show: editing, venue: editing, date: editing, collections: editing, visibility: editing });
  // Latest values for async detection steps, and a token so a newer photo
  // cancels the older one's late results.
  const live = useRef({ show, venue });
  useEffect(() => {
    live.current = { show, venue };
  }, [show, venue]);
  const run = useRef(0);
  // Fields whose current value came from the photo. Removing or replacing
  // the photo clears these (and only these), so a new photo can fill them.
  const fromPhoto = useRef({ show: false, venue: false, date: false });

  // Detection sets fields through these, so they can be cleared later.
  const autoShow = (v: Show | NewShow) => {
    fromPhoto.current.show = true;
    live.current.show = v;
    setShow(v);
  };
  const autoVenue = (v: VenueChoice) => {
    fromPhoto.current.venue = true;
    live.current.venue = v;
    setVenue(v);
  };

  // Forget everything the previous photo filled in or found.
  function clearPhotoResults() {
    run.current++;
    const f = fromPhoto.current;
    if (f.show) {
      live.current.show = null;
      setShow(null);
    }
    if (f.venue) {
      live.current.venue = null;
      setVenue(null);
    }
    if (f.date) setDate("");
    fromPhoto.current = { show: false, venue: false, date: false };
    setSuggestion(null);
    setVenueSuggestion(null);
    setNearby([]);
    setPlace({ city: null, country: null });
    setPhotoError(null);
    setDetect({ step: "idle" });
  }

  // The owner's default visibility, trips, and recent venues.
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
        supabase
          .from("entries")
          .select("show_id, venue:venues!inner(id, name, city, country, lat, lng, osm_id)")
          .eq("user_id", uid)
          .order("date", { ascending: false })
          .limit(50),
      ]);
      if (profile.data && !touched.current.visibility) setVisibility(profile.data.default_visibility);
      setCollections((cols.data as Collection[] | null) ?? []);
      setRecent((entries.data as unknown as { show_id: string; venue: Venue }[] | null) ?? []);
    })();
  }, []);

  // Trips are offered only when one covers the entry's date (a trip holds only
  // shows within its dates), so most visits never see the field. The first
  // covering trip is pre-selected until the user picks.
  const offeredTrips = date ? tripsCovering(collections, date) : [];
  useEffect(() => {
    if (touched.current.collections || !date) return;
    const trip = tripsCovering(collections, date)[0];
    setCollectionIds(trip ? [trip.id] : []);
  }, [collections, date]);

  // The preview URL is freed when the photo is replaced or removed, not in an
  // effect cleanup: that also runs when the page is hidden, and the kept
  // draft would come back with a broken preview.
  function replacePhoto(next: Photo | null) {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(next);
  }

  async function onPhoto(file: File) {
    clearPhotoResults();
    const token = run.current;
    const current = () => token === run.current;
    setStarted(true);
    setDetect({ step: "reading" });

    let prepared: PreparedPhoto;
    try {
      prepared = await preparePhoto(file);
    } catch {
      if (!current()) return;
      setPhotoError("Couldn’t read that photo. Try another, or fill in the details below.");
      setDetect({ step: "idle" });
      return;
    }
    if (!current()) return;
    const { meta, stored, small } = prepared;
    replacePhoto({ stored, previewUrl: URL.createObjectURL(stored) });
    setExistingPhoto(null);
    if (meta.date && !touched.current.date) {
      fromPhoto.current.date = true;
      setDate(meta.date);
    }

    // Nearby theatres, matched to venues already in the catalogue.
    let candidates: NearbyVenue[] = [];
    let where: Place = { city: null, country: null };
    const point = meta.lat != null && meta.lng != null ? { lat: meta.lat, lng: meta.lng } : null;
    if (point) {
      setDetect({ step: "nearby" });
      ({ candidates, place: where } = await lookupNearby(point.lat, point.lng, meta.accuracy_m));
      if (!current()) return;
      setNearby(candidates);
      setPlace(where);
      // One theatre in range is as good as an answer.
      if (candidates.length === 1 && !touched.current.venue && !live.current.venue) autoVenue(candidates[0]);
    }

    // Ask the AI for the show (and to choose between neighbouring theatres).
    // The form stays usable meanwhile; the answer fills only what's untouched.
    setDetect({ step: "identifying" });
    const outcome = await requestIdentify({
      photos: [small],
      meta,
      point,
      place: where,
      candidates,
      timeoutMs: IDENTIFY_TIMEOUT_MS,
    });
    const result = outcome.result;
    const note =
      outcome.error === "not_configured"
        ? "Show detection isn’t set up yet."
        : outcome.error
          ? "Couldn’t work out the show."
          : undefined;
    if (!current()) return;
    setDetect({ step: "done", result, note });
    if (!result) return;

    // A guess, or a different show from the one already picked: a chip.
    const differs = (s: Show | NewShow | null) => s && result.show_title && s.title.toLowerCase() !== result.show_title.toLowerCase();
    if (result.confidence === "low" || (touched.current.show && differs(live.current.show))) {
      if (result.show_title) setSuggestion(result);
      if (result.confidence === "low") return;
    }
    await applyIdentification(result, candidates, where);
  }

  // Fill show and venue from an identification, where the user hasn't.
  async function applyIdentification(
    result: Identification,
    candidates: NearbyVenue[],
    where: { city: string | null; country: string | null },
  ) {
    const supabase = createClient();
    if (result.show_title && !touched.current.show && !live.current.show) {
      const { data } = await supabase.rpc("search_shows", { q: result.show_title });
      const same = (data as Show[] | null)?.find((s) => s.title.toLowerCase() === result.show_title!.toLowerCase());
      autoShow(same ?? { title: result.show_title, type: result.show_type ?? "musical" });
    }
    const picked = candidates.find((c) => c.osm_id === result.venue_osm_id);
    // A venue picked by hand is never swapped: a different match is offered.
    if (touched.current.venue) {
      const current = live.current.venue;
      if (picked && current && (current.osm_id ?? current.name) !== (picked.osm_id ?? picked.name)) setVenueSuggestion(picked);
      return;
    }
    if (picked) {
      autoVenue(picked);
    } else if (result.venue_name && !live.current.venue) {
      const { data } = await supabase.rpc("search_venues", { q: result.venue_name });
      const same = (data as Venue[] | null)?.find((v) => v.name.toLowerCase() === result.venue_name!.toLowerCase());
      autoVenue(same ?? { name: result.venue_name, city: where.city, country: where.country });
    }
  }

  // Tapping a "Maybe…" chip is the user's choice, replacing any show set.
  async function takeSuggestion(s: Identification) {
    setSuggestion(null);
    if (!s.show_title) return;
    const { data } = await createClient().rpc("search_shows", { q: s.show_title });
    const same = (data as Show[] | null)?.find((x) => x.title.toLowerCase() === s.show_title!.toLowerCase());
    touched.current.show = true;
    fromPhoto.current.show = false;
    setShow(same ?? { title: s.show_title, type: s.show_type ?? "musical" });
    // The venue it went with, unless one was picked by hand.
    if (!touched.current.venue) {
      const picked = nearby.find((c) => c.osm_id === s.venue_osm_id);
      if (picked) autoVenue(picked);
    }
  }

  const venueSuggestions = (() => {
    const out: Venue[] = [];
    const add = (v: Venue) => {
      if (!out.some((o) => o.id === v.id)) out.push(v);
    };
    // Last venue used with this show, then the most recent venues.
    if (show?.id) recent.filter((r) => r.show_id === show.id).slice(0, 1).forEach((r) => add(r.venue));
    recent.forEach((r) => out.length < 5 && add(r.venue));
    return out;
  })();
  const venuePlace = place.city || place.country ? place : { city: recent[0]?.venue.city ?? null, country: recent[0]?.venue.country ?? null };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!show) return setError(identifying ? "Pick a show, or wait for the suggestion from your photo." : "Pick a show.");
    if (!venue && !planned) return setError("Pick a venue.");
    if (venue && !venue.id && !venue.osm_id && (!venue.city?.trim() || !venue.country?.trim())) {
      return setError("Add the venue’s city and country.");
    }
    if (!date) return setError("Pick a date.");
    if (!userId) return setError("You’re signed out. Sign in again to save.");

    // Saving wins over a suggestion still on its way: ignore it from here.
    run.current++;
    setSaving(true);
    const supabase = createClient();
    const entryId = initial?.id ?? crypto.randomUUID();
    // Which step failed, so the message can say (owner-only app, so the
    // raw error is useful rather than alarming).
    let step = "show";
    try {
      const showId = await ensureShow(supabase, show);
      step = "venue";
      const venueId = venue ? await ensureVenue(supabase, venue) : null;

      // Trips no longer covering the date (it changed) drop out. Links go
      // before the entry is re-dated: the database keeps a trip's shows
      // within its dates.
      step = "trips";
      const chosen = collectionIds.filter((c) => offeredTrips.some((t) => t.id === c));
      const before = new Set(initial?.collectionIds ?? []);
      const added = chosen.filter((c) => !before.has(c));
      const removed = [...before].filter((c) => !chosen.includes(c));
      if (removed.length) {
        const { error: unlink } = await supabase
          .from("entry_collections")
          .delete()
          .eq("entry_id", entryId)
          .in("collection_id", removed);
        if (unlink) throw unlink;
      }

      // The entry first, so a failed photo upload never loses it. Upsert, so
      // retrying after a later step failed doesn't trip over the same id.
      step = "entry";
      const keptPath = existingPhoto ? (initial?.photoPath ?? null) : null;
      const fields = {
        show_id: showId,
        venue_id: venueId,
        date,
        status: planned ? ("planned" as const) : ("logged" as const),
        rating: planned ? null : rating,
        note: note.trim() || null,
        visibility,
        photo_path: keptPath,
      };
      const { error: write } = initial
        ? await supabase.from("entries").update(fields).eq("id", entryId)
        : await supabase.from("entries").upsert({ id: entryId, ...fields });
      if (write) throw write;

      // Removed photo: the entry no longer points at it, so delete the file.
      if (initial?.photoPath && !keptPath && !photo) {
        await supabase.storage.from(PHOTO_BUCKET).remove([initial.photoPath]);
      }

      step = "trips";
      if (added.length) {
        const { error: link } = await supabase
          .from("entry_collections")
          .upsert(added.map((collection_id) => ({ entry_id: entryId, collection_id })), { ignoreDuplicates: true });
        if (link) throw link;
      }

      // The photo last: if it fails, the entry is still saved without it.
      let photoFailed = false;
      if (photo) {
        const path = photoPath(userId, entryId);
        const { error: upload } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, photo.stored, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
        const { error: link } = upload
          ? { error: upload }
          : await supabase.from("entries").update({ photo_path: path }).eq("id", entryId);
        if (link) {
          console.error("Saving the photo failed", link);
          photoFailed = true;
        }
      }

      // How new entries get logged: photo or by hand, and how far detection got.
      // A planned show isn't a visit yet, so it isn't counted.
      if (!editing && !planned) {
        void track(supabase, "entry_logged", {
          method: photo ? "photo" : "manual",
          detection: detect.step === "done" ? (detect.result?.confidence ?? "none") : detect.step === "idle" ? "skipped" : "pending",
          rated: rating != null,
          has_note: Boolean(note.trim()),
        });
      }

      // The entry page is the share screen, so a new entry lands on sharing.
      const params = new URLSearchParams();
      if (!editing) params.set("new", "1");
      if (photoFailed) params.set("photo", "failed");
      onSaved();
      router.push(`/app/entries/${entryId}${params.size ? `?${params}` : ""}`);
      router.refresh();
    } catch (err) {
      console.error(`Saving the entry failed at "${step}"`, err);
      const detail = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      setError(`Couldn’t save the ${step}: ${detail}`);
      setSaving(false);
    }
  }

  // Dropping a photo works like choosing one: on the start screen, or on the
  // photo row to replace it. An entry has a single photo, so with several
  // dropped the first image is used and the rest are pointed at Import.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(false);
      const images = [...e.dataTransfer.files].filter(
        (f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name),
      );
      setDropNote(images.length > 1 ? "One photo per show, so the first is used. To add several shows at once, use Import." : null);
      if (images[0]) void onPhoto(images[0]);
      else {
        setStarted(true);
        setPhotoError("That isn’t a photo. Drop a JPEG, PNG or HEIC.");
      }
    },
  };

  const picker = (
    <input
      id={`${id}-photo`}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        setDropNote(null);
        if (file) void onPhoto(file);
      }}
    />
  );

  if (!started) {
    return (
      <div className="flex flex-col gap-4">
        {picker}
        <label
          htmlFor={`${id}-photo`}
          {...dropProps}
          className={`flex min-h-72 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 text-center shadow-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
            dragging ? "border-tint bg-tint-fill" : "border-outline bg-surface hover:bg-fill"
          }`}
        >
          <svg viewBox="0 0 24 24" width={40} height={40} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-label-secondary">
            <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.2-2h7l1.2 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          <span className="text-headline text-label">Start with a photo</span>
          <span className="max-w-[280px] text-subheadline text-label-secondary">
            The curtain, the stage, the Playbill or your ticket. We’ll fill in what we can.
          </span>
          <span className="mt-2 inline-flex min-h-[50px] items-center rounded-pill bg-tint px-6 text-headline text-on-tint shadow-btn">
            Choose photo
          </span>
          {/* Only where there's a mouse; phones can't drag files in. */}
          <span className="hidden text-footnote text-label-secondary [@media(pointer:fine)]:block">
            {dragging ? "Drop it here" : "or drag a photo here"}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="min-h-11 self-center rounded-pill px-4 text-subheadline font-semibold text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          No photo? Fill in by hand
        </button>
      </div>
    );
  }

  const previewUrl = photo?.previewUrl ?? existingPhoto;
  const status =
    detect.step === "reading"
      ? "Reading the photo…"
      : detect.step === "nearby"
        ? "Looking for theatres nearby…"
        : detect.step === "identifying"
          ? "Working out the show…"
          : null;
  const showDiffers = Boolean(
    suggestion?.show_title && show && show.title.toLowerCase() !== suggestion.show_title.toLowerCase(),
  );
  const result = detect.step === "done" ? detect.result : null;

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      {/* Photo (drop another here to replace it) */}
      <div
        {...dropProps}
        className={`-m-2 flex items-start gap-4 rounded-md border border-dashed p-2 ${dragging ? "border-tint bg-tint-fill" : "border-transparent"}`}
      >
        {picker}
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob or signed URL
          <img src={previewUrl} alt="" className="size-24 shrink-0 rounded-sm object-cover" />
        ) : (
          <div aria-hidden="true" className="flex size-24 shrink-0 items-center justify-center rounded-sm bg-fill text-label-secondary">
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.2-2h7l1.2 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap gap-1">
            <label
              htmlFor={`${id}-photo`}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-pill px-3 text-subheadline font-semibold text-tint-text hover:bg-tint-fill focus-within:outline-2 focus-within:outline-focus"
            >
              {previewUrl ? "Change photo" : "Add photo"}
            </label>
            {previewUrl && (
              <button
                type="button"
                onClick={() => {
                  clearPhotoResults();
                  replacePhoto(null);
                  setExistingPhoto(null);
                }}
                className="min-h-11 rounded-pill px-3 text-subheadline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus"
              >
                Remove
              </button>
            )}
          </div>
          <p role="status" aria-live="polite" className="px-3 text-footnote text-label-secondary">
            {photoError ? (
              <span className="text-destructive">{photoError}</span>
            ) : working ? (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-outline border-t-transparent" />
                {status}
              </span>
            ) : result && result.confidence !== "low" && !showDiffers ? (
              `${result.confidence === "high" ? "Matched" : "Probably"}: ${result.reason}`
            ) : detect.step === "done" ? (
              (detect.note ?? (result ? null : "Couldn’t tell the show from this photo."))
            ) : null}
          </p>
          {dropNote && <p className="px-3 text-footnote text-label-secondary">{dropNote}</p>}
        </div>
      </div>

      {/* Every field stays usable while the photo is checked; results fill
          only what's untouched, and offer chips for the rest. */}
      <div className="relative">
        <div className="flex flex-col gap-6">
          {/* Show */}
          <div className="flex flex-col gap-2">
            <span id={`${id}-show`} className={label}>
              Show
            </span>
            <div>
              <ShowField
                labelledBy={`${id}-show`}
                value={show}
                onChange={(s) => {
                  // Clearing with "Change" isn't a choice; a new photo may refill it.
                  touched.current.show = s !== null;
                  fromPhoto.current.show = false;
                  setSuggestion(null);
                  setShow(s);
                }}
              />
            </div>
            {identifying && !show && (
              <p role="status" className="inline-flex items-center gap-2 self-start rounded-pill bg-fill px-3 py-1.5 text-footnote text-label-secondary">
                <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-outline border-t-transparent" />
                Working out the show from your photo…
              </p>
            )}
            {suggestion && (!show || showDiffers) && (
              <div className="flex flex-wrap items-center gap-2">
                <Chip onClick={() => void takeSuggestion(suggestion)}>
                  {showDiffers ? `Photo suggests ${suggestion.show_title}` : `Maybe ${suggestion.show_title}?`}
                </Chip>
                <span className="text-footnote text-label-secondary">{suggestion.reason}</span>
              </div>
            )}
          </div>

          {/* Venue */}
          <div className="flex flex-col gap-2">
            <span id={`${id}-venue`} className={label}>
              Venue {planned && <span className="font-normal text-label-secondary">(optional)</span>}
            </span>
            <VenueField
              labelledBy={`${id}-venue`}
              value={venue}
              onChange={(v) => {
                touched.current.venue = v !== null;
                fromPhoto.current.venue = false;
                setVenueSuggestion(null);
                setVenue(v);
              }}
              nearby={nearby}
              suggestions={venueSuggestions}
              place={venuePlace}
            />
            {/* Several theatres close by: one tap instead of a search. */}
            {!venue && nearby.length > 1 && (
              <div role="group" aria-label="Theatres near the photo" className="flex flex-wrap gap-2">
                {nearby.slice(0, 3).map((v) => (
                  <Chip
                    key={v.id ?? v.osm_id ?? v.name}
                    onClick={() => {
                      touched.current.venue = true;
                      fromPhoto.current.venue = false;
                      setVenue(v);
                    }}
                  >
                    {v.name} · {v.distance_m} m
                  </Chip>
                ))}
              </div>
            )}
            {venueSuggestion && venue && (
              <div>
                <Chip
                  onClick={() => {
                    touched.current.venue = true;
                    setVenue(venueSuggestion);
                    setVenueSuggestion(null);
                  }}
                >
                  Photo suggests {venueSuggestion.name}
                </Chip>
              </div>
            )}
          </div>

          {/* Date */}
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-date`} className={label}>
              Date
            </label>
            <DateField
              id={`${id}-date`}
              value={date}
              onChange={(v) => {
                touched.current.date = true;
                fromPhoto.current.date = false;
                setDate(v);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {(today
                ? [
                    ["Today", today],
                    ["Yesterday", localToday(-1)],
                  ]
                : []
              ).map(([text, value]) => (
                <Chip
                  key={text}
                  selected={date === value}
                  onClick={() => {
                    touched.current.date = true;
                    fromPhoto.current.date = false;
                    setDate(value);
                  }}
                >
                  {text}
                </Chip>
              ))}
            </div>
          </div>

          {/* Rating, once you've been. A future date makes this an upcoming show. */}
          {planned ? (
            <p role="status" className="rounded-md bg-tint-fill px-4 py-3 text-subheadline text-label">
              That’s after today, so this goes in Upcoming. Rate it after you’ve been.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <span id={`${id}-rating`} className={label}>
                Rating
              </span>
              <RatingInput labelledBy={`${id}-rating`} value={rating} onChange={setRating} />
            </div>
          )}

          {/* Note */}
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-note`} className={label}>
              Note <span className="font-normal text-label-secondary">(optional)</span>
            </label>
            <textarea
              id={`${id}-note`}
              rows={note ? 5 : 2}
              maxLength={10000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onFocus={(e) => (e.currentTarget.rows = 5)}
              placeholder="What stayed with you?"
              className="block w-full rounded-md border border-separator bg-surface px-4 py-3 text-body text-label shadow-sm placeholder:text-label-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </div>

          {/* Trip: only when one of the user's trips covers this date. */}
          {offeredTrips.length > 0 && (
            <div className="flex flex-col gap-2">
              <span id={`${id}-trips`} className={label}>
                Part of a trip?
              </span>
              <div role="group" aria-labelledby={`${id}-trips`} className="flex flex-wrap gap-2">
                {offeredTrips.map((c) => (
                  <Chip
                    key={c.id}
                    selected={collectionIds.includes(c.id)}
                    onClick={() => {
                      touched.current.collections = true;
                      setCollectionIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]));
                    }}
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* Visibility */}
          <div className="flex flex-col gap-2">
            <span id={`${id}-visibility`} className={label}>
              Who can see this
            </span>
            <div role="radiogroup" aria-labelledby={`${id}-visibility`} className="flex gap-2">
              {(["public", "private"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visibility === v}
                  onClick={() => {
                    touched.current.visibility = true;
                    setVisibility(v);
                  }}
                  className={`min-h-11 flex-1 rounded-pill px-4 text-subheadline font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    visibility === v ? "bg-label text-background" : "bg-fill text-label"
                  }`}
                >
                  {v === "public" ? "Public" : "Private"}
                </button>
              ))}
            </div>
            <p className="text-footnote text-label-secondary">
              {visibility === "public" ? "Anyone with the link can see this entry." : "Only you can see this entry."}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          )}

          {/* Sits on the tab bar (49px), or the bottom edge from md where the sidebar replaces it. */}
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+49px)] z-10 md:bottom-0 -mx-4 bg-background/90 px-4 pt-3 pb-4 md:pb-5 backdrop-blur">
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : planned ? "Add to Upcoming" : "Save"}
            </Button>
          </div>
        </div>

      </div>
    </form>
  );
}
