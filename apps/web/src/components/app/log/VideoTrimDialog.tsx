"use client";

import { useEffect, useRef, useState } from "react";
import type { EntryVideoDraft } from "@/lib/entry-video-upload";

export function VideoTrimDialog({ file, onCancel, onConfirm }: {
  file: File;
  onCancel: () => void;
  onConfirm: (draft: EntryVideoDraft) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const exporting = useRef<AbortController | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    const player = preview.current;
    if (!element || !player) return;
    const url = URL.createObjectURL(file);
    player.src = url;
    element.showModal();
    let disposed = false;
    void import("@/lib/entry-video-export").then(({ entryVideoDuration }) => entryVideoDuration(file))
      .then((seconds) => {
        if (disposed) return;
        setDuration(seconds);
        setEnd(Math.min(30, seconds));
      })
      .catch(() => { if (!disposed) setError("This video couldn’t be opened."); });
    return () => {
      disposed = true;
      exporting.current?.abort();
      player.pause();
      player.removeAttribute("src");
      player.load();
      URL.revokeObjectURL(url);
      element.close();
    };
  }, [file]);

  async function confirm() {
    if (exporting.current || end <= start) return;
    const controller = new AbortController();
    exporting.current = controller;
    preview.current?.pause();
    setProgress(0);
    setError("");
    try {
      const { exportEntryVideo } = await import("@/lib/entry-video-export");
      const draft = await exportEntryVideo(file, start, end, controller.signal, setProgress);
      if (!controller.signal.aborted) onConfirm(draft);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "This video couldn’t be prepared.");
      }
    } finally {
      exporting.current = null;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  function updateStart(value: number) {
    const next = Math.min(Math.max(value, 0), Math.max(0, duration - 0.1));
    setStart(next);
    setEnd(Math.min(duration, Math.max(next + 0.1, Math.min(end, next + 30))));
    if (preview.current?.readyState) preview.current.currentTime = next;
  }

  return (
    <dialog ref={dialog} aria-labelledby="video-trim-title"
      className="m-auto w-[min(92vw,36rem)] rounded-lg bg-background p-5 text-foreground backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <div className="grid gap-4">
        <h2 id="video-trim-title" className="text-lg font-semibold">Trim video</h2>
        <video ref={preview} controls muted playsInline preload="metadata" className="max-h-[45vh] w-full bg-black"
          onPlay={(event) => {
            if (end > 0 && (event.currentTarget.currentTime < start || event.currentTarget.currentTime >= end)) {
              event.currentTarget.currentTime = start;
            }
          }}
          onTimeUpdate={(event) => { if (end > 0 && event.currentTarget.currentTime >= end) event.currentTarget.pause(); }} />
        {duration > 0 && (
          <fieldset disabled={progress !== null} className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Start (s)
              <input type="number" step="0.01" min={0} max={Math.max(0, duration - 0.1)}
                value={start} onChange={(event) => updateStart(Number(event.target.value))} />
            </label>
            <label className="grid gap-1">End (s)
              <input type="number" step="0.01" min={Math.min(duration, start + 0.1)}
                max={Math.min(duration, start + 30)} value={end}
                onChange={(event) => setEnd(Math.min(duration, start + 30,
                  Math.max(start + 0.1, Number(event.target.value))))} />
            </label>
            <output className="col-span-2">{(end - start).toFixed(2)} seconds selected</output>
          </fieldset>
        )}
        {progress !== null && <progress aria-label="Preparing video" max={1} value={progress} />}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="min-h-11 px-3" onClick={onCancel}>Cancel</button>
          <button type="button" className="min-h-11 px-3 text-tint-text disabled:opacity-50"
            disabled={duration <= 0 || progress !== null} onClick={() => void confirm()}>Use video</button>
        </div>
      </div>
    </dialog>
  );
}
