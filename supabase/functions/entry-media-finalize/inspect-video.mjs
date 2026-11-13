import { BufferSource, EncodedPacketSink, Input, MP4 } from "npm:mediabunny@1.65.2";

const limit = 15 * 1024 * 1024;

function checkBoxExtents(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < view.byteLength;) {
    if (view.byteLength - offset < 8) throw new Error("MEDIA_VIDEO_BOX");
    let length = view.getUint32(offset);
    let headerLength = 8;
    if (length === 1) {
      headerLength = 16;
      if (view.byteLength - offset < headerLength) throw new Error("MEDIA_VIDEO_BOX");
      const extendedLength = view.getBigUint64(offset + 8);
      if (extendedLength > BigInt(view.byteLength - offset)) throw new Error("MEDIA_VIDEO_BOX");
      length = Number(extendedLength);
    }
    if (length < headerLength || length > view.byteLength - offset) throw new Error("MEDIA_VIDEO_BOX");
    offset += length;
  }
}

export async function inspectVideo(bytes) {
  const size = bytes.byteLength;
  if (size <= 0 || size > limit) throw new Error("MEDIA_VIDEO_SIZE");
  checkBoxExtents(bytes);
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    if (await input.getFormat() !== MP4) throw new Error("MEDIA_VIDEO_CONTAINER");
    const [video, audio, tracks] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.getTracks(),
    ]);
    if (video.length !== 1 || audio.length > 1 || tracks.length !== video.length + audio.length ||
        await video[0].getCodec() !== "avc" || (audio.length && await audio[0].getCodec() !== "aac")) {
      throw new Error("MEDIA_VIDEO_CODEC");
    }
    const [width, height, codedWidth, codedHeight] = await Promise.all([
      video[0].getDisplayWidth(), video[0].getDisplayHeight(),
      video[0].getCodedWidth(), video[0].getCodedHeight(),
    ]);
    for (const [w, h] of [[width, height], [codedWidth, codedHeight]]) {
      if (!Number.isInteger(w) || !Number.isInteger(h) || Math.min(w, h) <= 0 ||
          Math.min(w, h) > 720 || Math.max(w, h) > 1280) {
        throw new Error("MEDIA_VIDEO_DIMENSIONS");
      }
    }
    // Read each sample payload as well as the timeline so truncated media
    // cannot pass by supplying a complete sample index alone.
    let seconds = 0;
    let samples = 0;
    let sampleBytes = 0;
    for (const track of tracks) {
      const timeResolution = await track.getTimeResolution();
      let trackSamples = 0;
      for await (const packet of new EncodedPacketSink(track).packets()) {
        const end = Math.round((packet.timestamp + packet.duration) * timeResolution) / timeResolution;
        if (!Number.isFinite(end) || !Number.isFinite(packet.duration) || packet.duration <= 0 || end > 30) {
          throw new Error(`MEDIA_VIDEO_DURATION (${end}s)`);
        }
        seconds = Math.max(seconds, end);
        trackSamples++;
        samples++;
        sampleBytes += packet.data.byteLength;
        if (!packet.data.byteLength || packet.data.byteLength !== packet.byteLength || sampleBytes > size || samples > 12000) {
          throw new Error("MEDIA_VIDEO_SAMPLES");
        }
      }
      if (!trackSamples) throw new Error("MEDIA_VIDEO_SAMPLES");
    }
    if (seconds <= 0) throw new Error("MEDIA_VIDEO_DURATION");
    return { bytes: size, seconds, width, height };
  } finally {
    input.dispose();
  }
}
