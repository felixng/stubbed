import type { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";

export async function exportVideoInSoftware(file: Blob, start: number, end: number,
  options: { width: number; height: number; hdr: boolean; signal: AbortSignal;
    onProgress: (fraction: number) => void }): Promise<Blob> {
  const { width, height, hdr, signal, onProgress } = options;
  const core = process.env.NEXT_PUBLIC_VIDEO_SOFTWARE_CORE;
  if (!core) throw new Error("Software video conversion is unavailable on this deployment.");
  signal.throwIfAborted();
  const root = new URL(core, location.href);
  if (root.origin !== location.origin) throw new Error("Invalid video converter URL.");
  const wrapper = new URL("wrapper/index.js", root).href;
  const { FFmpeg: Converter } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ wrapper) as {
    FFmpeg: typeof FFmpeg;
  };
  signal.throwIfAborted();
  const ffmpeg = new Converter();
  const cancel = () => ffmpeg.terminate();
  signal.addEventListener("abort", cancel, { once: true });
  ffmpeg.on("progress", ({ progress }) => onProgress(Math.max(0, Math.min(progress, 1))));
  try {
    await ffmpeg.load({ coreURL: new URL("ffmpeg-core.js", root).href,
      wasmURL: new URL("ffmpeg-core.wasm", root).href });
    signal.throwIfAborted();
    await ffmpeg.createDir("/input");
    await ffmpeg.mount("WORKERFS" as FFFSType, { blobs: [{ name: "source", data: file }] }, "/input");
    const scale = `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
    const toneMap = `zscale=w=${width}:h=${height}:transfer=linear:npl=100,format=gbrpf32le,` +
      "zscale=primaries=bt709,tonemap=tonemap=hable,zscale=transfer=bt709:matrix=bt709:range=limited";
    const filter = hdr ? toneMap : scale;
    const status = await ffmpeg.exec([
      "-ss", String(start), "-i", "/input/source", "-t", String(Math.min(end - start, 29.9)),
      "-map", "0:v:0", "-map", "0:a:0?", "-vf", filter,
      "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "3M", "-maxrate", "3M", "-bufsize", "6M",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
      "-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart", "/trim.mp4",
    ], 180_000);
    signal.throwIfAborted();
    if (status !== 0) throw new Error("This video couldn’t be converted. Try a shorter selection.");
    const data = await ffmpeg.readFile("/trim.mp4");
    if (typeof data === "string") throw new Error("Couldn’t read the exported video.");
    return new Blob([Uint8Array.from(data)], { type: "video/mp4" });
  } finally {
    signal.removeEventListener("abort", cancel);
    ffmpeg.terminate();
  }
}
