import { stat } from "node:fs/promises";
import { ALL_FORMATS, FilePathSource, Input, MP4 } from "mediabunny";

const limit = 15 * 1024 * 1024;

async function inspect(path) {
  const { size } = await stat(path);
  if (size <= 0 || size > limit) throw new Error("MEDIA_VIDEO_SIZE");
  const input = new Input({ source: new FilePathSource(path), formats: ALL_FORMATS });
  try {
    if (await input.getFormat() !== MP4) throw new Error("MEDIA_VIDEO_CONTAINER");
    const [video, audio, tracks] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.getTracks(),
    ]);
    if (video.length !== 1 || audio.length > 1 || tracks.length !== video.length + audio.length ||
        await video[0].getCodec() !== "avc" || (audio.length && await audio[0].getCodec() !== "aac")) {
      throw new Error("MEDIA_VIDEO_CODEC");
    }
    const [seconds, width, height] = await Promise.all([
      input.computeDuration(), video[0].getDisplayWidth(), video[0].getDisplayHeight(),
    ]);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 30) throw new Error(`MEDIA_VIDEO_DURATION (${seconds}s)`);
    if (Math.min(width, height) > 720 || Math.max(width, height) > 1280) throw new Error("MEDIA_VIDEO_DIMENSIONS");
    return { bytes: size, seconds, width, height };
  } finally {
    input.dispose();
  }
}

for (const path of process.argv.slice(2)) {
  try {
    console.log(path, await inspect(path));
  } catch (error) {
    console.error(path, error.message);
    process.exitCode = 1;
  }
}
