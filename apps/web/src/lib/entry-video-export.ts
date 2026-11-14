import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output,
  canEncodeAudio, canEncodeVideo,
} from "mediabunny";
import type { EntryVideoDraft } from "./entry-video-upload";

const maxBytes = 15 * 1024 * 1024;
let aacEncoder: Promise<void> | undefined;

export async function entryVideoDuration(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!await input.getPrimaryVideoTrack()) throw new Error("Choose a video with a picture track.");
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("This video couldn’t be opened.");
    return duration;
  } finally {
    input.dispose();
  }
}

export async function exportEntryVideo(file: Blob, start: number, end: number,
  signal: AbortSignal, onProgress: (fraction: number) => void): Promise<EntryVideoDraft> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 30) {
    throw new Error("Choose up to 30 seconds.");
  }
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    signal.throwIfAborted();
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("Choose a video with a picture track.");
    let useSoftware = !await video.canDecode();
    const [width, height] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight()]);
    const scale = Math.min(1, 1280 / Math.max(width, height), 720 / Math.min(width, height));
    if (!Number.isFinite(scale) || scale <= 0 || width * height > 4096 * 2160) {
      throw new Error("Choose a video at 4K resolution or lower.");
    }
    const outputWidth = Math.max(2, 2 * Math.floor(width * scale / 2));
    const outputHeight = Math.max(2, 2 * Math.floor(height * scale / 2));
    const encodeVideo = !useSoftware && await canEncodeVideo("avc", { width: outputWidth, height: outputHeight, bitrate: 3_000_000 });
    if (!encodeVideo && scale < 1) useSoftware = true;
    if (encodeVideo && await input.getPrimaryAudioTrack() &&
        !await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48000, bitrate: 96_000 })) {
      aacEncoder ??= import("@mediabunny/aac-encoder").then(({ registerAacEncoder }) => registerAacEncoder())
        .catch((error) => { aacEncoder = undefined; throw error; });
      await aacEncoder;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      let display: Blob | undefined;
      if (!useSoftware) {
        const target = new BufferTarget();
        const conversion = await Conversion.init({
          input, output: new Output({ format: new Mp4OutputFormat(), target }),
          trim: { start, end }, tags: {},
          copy: encodeVideo ? undefined : { mode: "forced", boundaryPolicy: "shrink" },
          video: encodeVideo ? {
            codec: "avc", bitrate: 3_000_000, width: outputWidth, height: outputHeight,
            fit: "contain", allowTransformationMetadata: false,
          } : { codec: "avc", allowTransformationMetadata: false },
          audio: encodeVideo ? { codec: "aac", bitrate: 96_000 } : { codec: "aac" },
        });
        if (!conversion.isValid || conversion.discardedTracks.length) {
          useSoftware = true;
        } else {
          conversion.onProgress = onProgress;
          const cancel = () => { void conversion.cancel().catch(() => undefined); };
          signal.addEventListener("abort", cancel, { once: true });
          try {
            signal.throwIfAborted();
            await conversion.execute();
          } finally {
            signal.removeEventListener("abort", cancel);
          }
          signal.throwIfAborted();
          if (!target.buffer) throw new Error("Couldn’t read the exported video.");
          if (!encodeVideo && target.buffer.byteLength > maxBytes) {
            useSoftware = true;
          } else {
            display = new Blob([target.buffer], { type: "video/mp4" });
          }
        }
      }
      if (!display) {
        const { exportVideoInSoftware } = await import("./entry-video-software");
        // FFmpeg needs an identified transfer function for linear-light tone mapping.
        const transfer: string | null | undefined = (await video.getColorSpace()).transfer;
        const hdr = transfer === "pq" || transfer === "hlg";
        display = await exportVideoInSoftware(file, start, end, {
          width: outputWidth, height: outputHeight, hdr, signal, onProgress,
        });
      }
      if (display.size <= 0 || display.size > maxBytes) throw new Error("Choose a shorter video selection.");
      const output = new Input({ source: new BlobSource(display), formats: ALL_FORMATS });
      try {
        const seconds = await output.computeDuration();
        if (seconds > 30 && attempt === 0) {
          end -= seconds - 30 + 0.05;
          if (end > start) continue;
        }
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error("Choose a shorter video selection.");
        const track = await output.getPrimaryVideoTrack();
        if (!track || Math.min(await track.getCodedWidth(), await track.getCodedHeight()) > 720 ||
            Math.max(await track.getCodedWidth(), await track.getCodedHeight()) > 1280) {
          throw new Error("This browser couldn’t resize the video.");
        }
        const [poster, thumb] = await createVideoPosters(display, signal);
        signal.throwIfAborted();
        return { requestId: crypto.randomUUID(), display, poster, thumb };
      } finally {
        output.dispose();
      }
    }
    throw new Error("Choose a shorter video selection.");
  } finally {
    input.dispose();
  }
}


async function createVideoPosters(display: Blob, signal: AbortSignal) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(display);
  try {
    await new Promise<void>((resolve, reject) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(fail, 10_000);
      function finish(error?: unknown) {
        window.clearTimeout(timeout);
        controller.abort();
        if (error) reject(error);
        else resolve();
      }
      function fail() { finish(new Error("Couldn’t decode the exported video for playback.")); }
      signal.addEventListener("abort", () => finish(signal.reason), { signal: controller.signal });
      video.addEventListener("loadeddata", () => finish(), { signal: controller.signal });
      video.addEventListener("error", fail, { signal: controller.signal });
      if (signal.aborted) finish(signal.reason);
      else video.src = url;
    });
    const side = Math.min(video.videoWidth, video.videoHeight);
    if (!side) throw new Error("Couldn’t create a video poster.");
    return await Promise.all([1024, 256].map(async (size) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Couldn’t create a video poster.");
      context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2,
        side, side, 0, 0, size, size);
      const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Couldn’t create a video poster."));
      }, "image/jpeg", 0.8));
      return stripJpegMetadata(jpeg);
    }));
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}


async function stripJpegMetadata(jpeg: Blob) {
  const buffer = await jpeg.arrayBuffer();
  const view = new DataView(buffer);
  const parts: BlobPart[] = [buffer.slice(0, 2)];
  // WebKit adds EXIF when encoding a canvas. Drop APP1 and comments while
  // preserving the color profile, coding tables, and compressed scan.
  for (let offset = 2; offset + 4 <= view.byteLength;) {
    const marker = view.getUint16(offset);
    if (marker === 0xffda) {
      parts.push(buffer.slice(offset));
      return new Blob(parts, { type: "image/jpeg" });
    }
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    if ((marker & 0xff00) !== 0xff00 || length < 2 || end > view.byteLength) break;
    if (marker !== 0xffe1 && marker !== 0xfffe) parts.push(buffer.slice(offset, end));
    offset = end;
  }
  throw new Error("Couldn’t create a video poster.");
}
