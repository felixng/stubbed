// Reading and preparing photos on the device (#14, shared with #18).
//
// The original file never leaves the phone. We read its date and GPS here,
// then re-encode it to JPEG through a canvas, which drops all EXIF/GPS
// metadata. Only those clean copies are uploaded.
import exifr from "exifr";

export type PhotoMeta = {
  // Wall-clock date and time where the photo was taken, as the camera wrote
  // them (EXIF has no time zone): "2026-10-10" and "19:42".
  date: string | null;
  time: string | null;
  lat: number | null;
  lng: number | null;
  // How far off the phone says the position may be, in metres
  // (GPSHPositioningError; iPhones and many Android phones write it).
  accuracy_m: number | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  const meta: PhotoMeta = { date: null, time: null, lat: null, lng: null, accuracy_m: null };
  try {
    // With the GPS block on, exifr adds decimal `latitude` / `longitude`.
    const out = await exifr.parse(file, { tiff: true, exif: true, gps: true, ifd1: false, interop: false });
    // exifr builds the Date in this device's zone from the camera's wall-clock
    // value, so the local getters give back exactly what the camera wrote.
    const taken: unknown = out?.DateTimeOriginal ?? out?.CreateDate;
    if (taken instanceof Date && !Number.isNaN(taken.getTime())) {
      meta.date = `${taken.getFullYear()}-${pad(taken.getMonth() + 1)}-${pad(taken.getDate())}`;
      meta.time = `${pad(taken.getHours())}:${pad(taken.getMinutes())}`;
    }
    if (Number.isFinite(out?.latitude) && Number.isFinite(out?.longitude)) {
      meta.lat = out.latitude;
      meta.lng = out.longitude;
      const error = Number(out?.GPSHPositioningError);
      if (Number.isFinite(error) && error > 0) meta.accuracy_m = error;
    }
  } catch {
    // No EXIF (screenshots, some shared photos) or an unreadable format: the
    // fields stay blank and the form falls back to manual entry.
  }
  return meta;
}

// Downscales to `maxEdge` on the long side and re-encodes as JPEG. Drawing to
// a canvas keeps only pixels, so the result has no metadata at all.
// createImageBitmap applies the EXIF orientation first, so the picture stays
// the right way up after the orientation tag is gone. With `square`, crops
// the centre square first (avatars).
export async function reencodeJpeg(file: Blob, maxEdge: number, quality = 0.85, square = false): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sw = square ? side : bitmap.width;
    const sh = square ? side : bitmap.height;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the photo"))), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
}

// Stored photos back the share card (#15).
export const STORED_PHOTO_EDGE = 1600;
// Avatars show at most 88px; 512 covers 3x screens with room to spare.
export const AVATAR_EDGE = 512;
