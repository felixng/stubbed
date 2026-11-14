import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output,
  VideoSampleSink, canEncodeAudio, canEncodeVideo,
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
    const outputWidth = Math.max(2, 2 * Math.floor(width * scale / 2));
    const outputHeight = Math.max(2, 2 * Math.floor(height * scale / 2));
    const encodeVideo = !useSoftware && await canEncodeVideo("avc", { width: outputWidth, height: outputHeight, bitrate: 3_000_000 });
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
          if (!target.buffer || target.buffer.byteLength > maxBytes) throw new Error("Choose a shorter video selection.");
          display = new Blob([target.buffer], { type: "video/mp4" });
        }
      }
      if (!display) {
        const { exportVideoInSoftware } = await import("./entry-video-software");
        const hdr = await video.hasHighDynamicRange();
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
        const sample = await new VideoSampleSink(track).getSample(await track.getFirstTimestamp());
        if (!sample) throw new Error("Couldn’t create a video poster.");
        try {
          const [poster, thumb] = await Promise.all([1024, 256].map(async (size) => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Couldn’t create a video poster.");
            const side = Math.max(sample.displayWidth, sample.displayHeight);
            const scale = size / Math.min(sample.displayWidth, sample.displayHeight);
            const width = sample.displayWidth * scale;
            const height = sample.displayHeight * scale;
            if (!side) throw new Error("Couldn’t create a video poster.");
            sample.draw(context, (size - width) / 2, (size - height) / 2, width, height);
            return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Couldn’t create a video poster."));
            }, "image/jpeg", 0.8));
          }));
          signal.throwIfAborted();
          return { requestId: crypto.randomUUID(), display, poster, thumb };
        } finally {
          sample.close();
        }
      } finally {
        output.dispose();
      }
    }
    throw new Error("Choose a shorter video selection.");
  } finally {
    input.dispose();
  }
}
