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

// MP4 AVC samples contain length-prefixed NAL units. Validate the framing
// against avcC and require a coded picture in every video sample.
function checkAvcPacket(bytes, lengthBytes) {
  let hasPicture = false;
  for (let offset = 0; offset < bytes.length;) {
    if (bytes.length - offset <= lengthBytes) throw new Error("MEDIA_VIDEO_AVC");
    let length = 0;
    for (let index = 0; index < lengthBytes; index++) {
      length = length * 256 + bytes[offset++];
    }
    if (!length || length > bytes.length - offset || (bytes[offset] & 0x80)) {
      throw new Error("MEDIA_VIDEO_AVC");
    }
    const type = bytes[offset] & 0x1f;
    if (!type || type >= 24) throw new Error("MEDIA_VIDEO_AVC");
    if (type >= 1 && type <= 5 && length > 1) hasPicture = true;
    offset += length;
  }
  if (!hasPicture) throw new Error("MEDIA_VIDEO_AVC");
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
    const description = (await video[0].getDecoderConfig())?.description;
    const avcc = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description ?? 0);
    if (avcc.length < 7 || avcc[0] !== 1) throw new Error("MEDIA_VIDEO_AVC");
    const lengthBytes = (avcc[4] & 3) + 1;
    if (lengthBytes === 3) throw new Error("MEDIA_VIDEO_AVC");
    // Read each sample payload as well as the timeline so truncated media
    // cannot pass by supplying a complete sample index alone.
    let seconds = 0;
    let samples = 0;
    let sampleBytes = 0;
    for (const track of tracks) {
      const timeResolution = await track.getTimeResolution();
      let trackSamples = 0;
      for await (const packet of new EncodedPacketSink(track).packets()) {
        if (track.id === video[0].id) checkAvcPacket(packet.data, lengthBytes);
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
