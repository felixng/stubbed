# Video trim feasibility (#142)

Run the native Swift 6 prototype with `swift -swift-version 6 scripts/media-video-prototype.swift /path/to/output-directory`. In `scripts/media-video-probe`, run `npm ci --ignore-scripts` and serve that directory over localhost. Select the generated `original.mp4` and run the trim tests.

## Initial measurements

Both tests used the same generated 32-second, 1280 × 720, 30 fps H.264 fixture with no audio on an Apple Silicon Mac.

| Requested | AVFoundation result | Native export | Chrome 156 result | Chrome export |
| --- | --- | --- | --- | --- |
| 29.9 s | 29.9 s, 187002 B | 57 ms | 29.9 s, 206127 B | 2881 ms |
| 30.0 s | 30.0 s, 187539 B | 22 ms | 30.0 s, 206880 B | 2512 ms |
| 30.1 s | 30.1 s, 188295 B | 21 ms | 30.1 s, 207659 B | 2867 ms |

Native peak RSS was 274 MB for the combined Swift process, including fixture generation. Browser memory, audio, mobile devices, nontrivial footage, malformed inputs and enforced server limits remain to be measured. The above-limit export is a validation fixture.

The browser probe pins Mediabunny 1.65.2 (MPL-2.0). Its full minified module occupies about 708 KiB on disk. Measure the production tree-shaken lazy chunk and codec availability before selection.

## Independent file validation

The Node probe inspects the file bytes with Mediabunny and enforces MP4, one H.264 video track, at most one AAC audio track, at most 1280 × 720 in either orientation, 15 MiB, and a strict 30-second sample timeline. It accepts no client duration argument. Run `node scripts/media-video-probe/validate.mjs /path/to/clip.mp4`.

| Native requested | Native reported | Parsed sample timeline | Validator |
| --- | --- | --- | --- |
| 29.90 s | 29.90 s | 29.9667 s | Accept |
| 29.95 s | 29.95 s | 30.0167 s | Reject |
| 30.00 s | 30.00 s | 30.0667 s | Reject |
| 30.10 s | 30.10 s | 30.1667 s | Reject |

Do not use AVAsset duration alone as the acceptance check. The native export path must verify the output sample timeline, and shorten and retry an overshooting trim before upload. Repeated 29.9-second exports stayed under the limit for this fixture. A fixed subtraction is insufficient evidence for other frame rates and audio.

The parser probe establishes a duration boundary, but does not establish production safety for arbitrary uploads. Before release, show that forged timelines and truncated media cannot pass, bound memory and CPU, and verify the parser in the actual quarantine runtime.

## Chrome export with audio

The native prototype also accepts a WAV path as its second argument and writes an `original-audio.mp4` source. With a synthetic 32-second 440 Hz tone, Chrome 156 exported H.264/AAC and loaded the resulting MP4 in its player.

| Requested | Parsed output duration | Bytes | Export |
| --- | --- | --- | --- |
| 29.9 s | 29.9293 s | 489577 | 2611 ms |
| 30.0 s | 30.0360 s | 491321 | 2520 ms |
| 30.1 s | 30.1213 s | 493159 | 2538 ms |

The browser producer also needs to validate the exported timeline and retry with a shorter range at the upper boundary. Audio packet duration can extend past the requested trim even when the video frames fit.

On a second Chrome 156 run, the 30.0-second request again produced 30.036 seconds. Subtracting the measured overshoot and a 50 ms margin yielded a 29.914-second request and a 29.9507-second output (489873 bytes, 3733 ms). Verify the retry output before passing its bytes to the uploader.

## Proposed upload contract

Use H.264 MP4 with optional AAC, a 1280-pixel long edge, a 720-pixel short edge, and at most 15 MiB per clip. The server measures the file timeline and enforces the 30-second cap. Clients prepare a square JPEG poster and thumbnail. Video files enter a private bucket via reservation-bound resumable upload. Finalization checks entitlement and storage metadata again, inspects the file, and publishes only after verifying the clip and derivatives. A failed or expired reservation leaves existing media readable and its unreferenced objects eligible for cleanup.

Include real media bytes in the capacity estimate. For 1,000 clips at the 15 MiB cap, one stored copy occupies about 14.65 GiB, and five full plays per clip transfer about 73.24 GiB. At a 3 Mb/s video target plus 96 kb/s audio, 30 seconds is approximately 11.1 MiB before container overhead. Posters, thumbnails, partial requests, cache hits and retained failed uploads change the totals. These are volume scenarios, not observed user traffic or a cost quote.

Before adopting a runtime, measure the bounded parser on high-complexity fixtures and verify how it handles malformed samples, track metadata and container timing. The Chrome and native probes establish that both clients can produce bounded outputs on the measured fixture. Safari, Firefox and mobile measurements still need to decide whether the browser producer needs a codec fallback.

## Safari and Firefox

Safari 26.6.2 on macOS reported H.264 and AAC encoding support. On the same audio fixture it produced the following files.

| Requested | Parsed output duration | Bytes | Export |
| --- | --- | --- | --- |
| 29.9 s | 29.940 s | 3261349 | 3384 ms |
| 30.0 s | 30.036 s | 3274290 | 2617 ms |
| 30.1 s | 30.132 s | 3285529 | 2563 ms |
| 29.914 s (retry) | 29.940 s | 3265895 | 2556 ms |

Firefox 146.0 on macOS in headless mode reported H.264 encoding support and no AAC encoding support. All three timed trims failed when the probe required AAC re-encoding. Removing the audio bitrate override let the probe copy the existing AAC packets while re-encoding the picture. This fixture demonstrates a fallback for AAC input. Sources containing other audio codecs still require a way to encode AAC.

| Browser | Requested | Parsed output duration | Bytes | Export |
| --- | --- | --- | --- | --- |
| Safari 26.5, iPhone 17 Pro simulator | 29.9 s | 29.940 s | 3548882 | 12694 ms |
| Safari 26.5, iPhone 17 Pro simulator | 30.0 s | 30.036 s | 3562554 | 7770 ms |
| Safari 26.5, iPhone 17 Pro simulator | 30.1 s | 30.132 s | 3574703 | 8136 ms |
| Safari 26.5, iPhone 17 Pro simulator | 29.914 s (retry) | 29.940 s | 3553415 | 9256 ms |
| Firefox 146.0, AAC packet copy | 29.9 s | 29.910 s | 351244 | 2755 ms |
| Firefox 146.0, AAC packet copy | 30.0 s | 30.006 s | 352511 | 2682 ms |
| Firefox 146.0, AAC packet copy | 30.1 s | 30.102 s | 353778 | 2825 ms |
| Firefox 146.0, AAC packet copy | 29.944 s (retry) | 29.974 s | 352105 | 2693 ms |

The simulator measurements establish export and parsing on that runtime. Physical-device playback, memory, and export performance still need measurement.

## Local Supabase Edge Runtime

The disposable Supabase Edge Runtime 1.77.4 (Deno 2.1.4) ran the shared parser against actual request bytes. Its response for the synthetic boundary fixture matched the Node result.

| Fixture | HTTP | Wall time | Result |
| --- | --- | --- | --- |
| 29.9 s native trim | 200 | 63 ms | 29.9667 s, 1280 × 720 |
| 30.1 s native trim | 422 | 11 ms | 30.1667 s |
| 11 bytes of invalid data | 422 | 6 ms | Unrecognized format |
| Native trim with last 1024 bytes removed | 422 | 8 ms | Invalid track metadata |

The parser reads indexed packet payloads and rejects empty tracks, empty payloads, more than 12,000 packets, and payload totals larger than the file. These runs measure request wall time and exercise one form of truncation. CPU and peak memory at the maximum input size, payload corruption with intact indexes, and forged sample timestamps still need evidence.
