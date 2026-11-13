"use client";

import { useEffect, useId, useRef, useState } from "react";
import { renderPhotoCrop, squareCrop, type SquareCrop, type CropRectangle } from "@/lib/photo-crop";

export type CroppedPhoto = Awaited<ReturnType<typeof renderPhotoCrop>>;

export function PhotoCropDialog({ source, initial, rectangle, onCancel, onConfirm }: {
  source: Blob;
  initial?: SquareCrop;
  rectangle?: CropRectangle;
  onCancel: () => void;
  onConfirm: (photo: CroppedPhoto) => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number; crop: SquareCrop } | null>(null);
  const previewImage = useRef<HTMLImageElement>(null);
  const [image, setImage] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<SquareCrop | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const preview = URL.createObjectURL(source);
    const img = previewImage.current;
    if (img) img.src = preview;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => URL.revokeObjectURL(preview);
  }, [source]);

  function move(dx: number, dy: number, base = crop) {
    if (!image || !base) return;
    setCrop(squareCrop(image.width, image.height,
      base.x + base.side / 2 + dx, base.y + base.side / 2 + dy, base.side));
  }

  async function confirm() {
    if (!crop || busy) return;
    setBusy(true);
    setError("");
    try {
      onConfirm(await renderPhotoCrop(source, crop));
    } catch {
      setError("Couldn’t crop this photo. Try again.");
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby={title} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
      className="m-auto w-[min(92vw,30rem)] max-h-[90dvh] overflow-auto rounded-xl bg-background p-5 text-foreground backdrop:bg-black/60">
      <h2 id={title} className="mb-3 text-lg font-semibold">Crop photo</h2>
      <div
        tabIndex={0}
        aria-label="Square preview. Use arrow keys to move the crop."
        className="relative aspect-square touch-none overflow-hidden rounded-md bg-black"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 20 : 4;
          const direction = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
          if (direction) { event.preventDefault(); move(direction[0], direction[1]); }
        }}
        onPointerDown={(event) => {
          if (!crop || busy || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, crop };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const base = drag.current;
          const scale = base.crop.side / event.currentTarget.clientWidth;
          move((base.x - event.clientX) * scale, (base.y - event.clientY) * scale, base.crop);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
      >
        {(
          // A local blob preview is already decoded by the browser.
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={previewImage} alt="" draggable={false}
            className="pointer-events-none absolute max-w-none"
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              setImage({ width, height });
              setCrop((current) => {
                if (current) return current;
                if (!rectangle) return squareCrop(width, height);
                const [x, y, w, h] = rectangle;
                return squareCrop(width, height, (x + w / 2) * width, (y + h / 2) * height, w * width);
              });
            }}
            style={image && crop ? {
              width: `${image.width / crop.side * 100}%`,
              height: `${image.height / crop.side * 100}%`,
              left: `${-crop.x / crop.side * 100}%`,
              top: `${-crop.y / crop.side * 100}%`,
            } : { visibility: "hidden" }}
          />
        )}
      </div>
      {image && crop && (
        <label className="mt-3 flex items-center gap-3">
          Zoom
          <input type="range" min={1} max={Math.min(8, image.width, image.height)} step={0.01}
            className="w-full" value={Math.min(image.width, image.height) / crop.side}
            onChange={(event) => setCrop(squareCrop(image.width, image.height, crop.x + crop.side / 2,
              crop.y + crop.side / 2, Math.min(image.width, image.height) / event.currentTarget.valueAsNumber))} />
        </label>
      )}
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-4">
        <button type="button" disabled={!image || busy}
          onClick={() => image && setCrop(squareCrop(image.width, image.height))}>Reset</button>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!crop || busy} onClick={() => void confirm()}>Use photo</button>
      </div>
    </dialog>
  );
}
