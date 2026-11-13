import { ALL_FORMATS, EncodedPacketSink, Input, MP4 } from "mediabunny";

const limit = 15 * 1024 * 1024;

export async function inspectVideo(source, size) {
  if (size <= 0 || size > limit) throw new Error("MEDIA_VIDEO_SIZE");
  const input = new Input({ source, formats: ALL_FORMATS });
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
    // Read each sample payload as well as the timeline so truncated media
    // cannot pass by supplying a complete sample index alone.
    let samples = 0;
    let sampleBytes = 0;
    for (const track of tracks) {
      let trackSamples = 0;
      for await (const packet of new EncodedPacketSink(track).packets()) {
        trackSamples++;
        samples++;
        sampleBytes += packet.data.byteLength;
        if (!packet.data.byteLength || sampleBytes > size || samples > 12000) {
          throw new Error("MEDIA_VIDEO_SAMPLES");
        }
      }
      if (!trackSamples) throw new Error("MEDIA_VIDEO_SAMPLES");
    }
    return { bytes: size, seconds, width, height };
  } finally {
    input.dispose();
  }
}
