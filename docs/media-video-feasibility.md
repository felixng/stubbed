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

Firefox 146.0 on macOS in headless mode reported H.264 encoding support and no AAC encoding support. All three timed trims failed when the probe required AAC re-encoding. Removing the audio bitrate override let the probe copy the existing AAC packets while re-encoding the picture. This fixture demonstrates a fallback for AAC input. Sources containing other audio codecs require AAC encoding.

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

## Firefox AAC encoding fallback

The probe lazy-loads `@mediabunny/aac-encoder` 1.65.2 when WebCodecs cannot encode AAC. It uses an MPL-2.0 wrapper and an LGPL-2.1-or-later FFmpeg encoder. The minified published module is 1,129,457 bytes and gzip reduces it to 293,320 bytes. Before distribution, preserve both license notices and provide the corresponding FFmpeg source and build instructions for the shipped binary. Production bundling must also verify its worker and WebAssembly policy.

| Firefox 146.0, WebAssembly AAC | Parsed output duration | Bytes | Export |
| --- | --- | --- | --- |
| 29.9 s | 29.920 s | 569300 | 2821 ms |
| 30.0 s | 30.016 s | 571165 | 2665 ms |
| 30.1 s | 30.112 s | 573159 | 2666 ms |
| 29.934 s (retry) | 29.952 s | 570225 | 2766 ms |

A separate Firefox 146 run decoded an Opus track in the same H.264 MP4 fixture and encoded AAC through the WebAssembly extension. The 30-second request produced 30.016 seconds. A 29.934-second retry produced a playable 29.952-second sample timeline (572,308 bytes, 2,798 ms). A second Firefox run decoded signed 16-bit PCM from a MOV and encoded AAC with the same fallback. Its 29.934-second retry produced a playable 29.952-second sample timeline (570,412 bytes, 2,839 ms). See the [Mediabunny AAC extension guide](https://mediabunny.dev/guide/extensions/aac-encoder).

## Local Supabase Edge Runtime

The disposable Supabase Edge Runtime 1.77.4 (Deno 2.1.4) ran the shared parser against actual request bytes. Its response for the synthetic boundary fixture matched the Node result.

| Fixture | HTTP | Wall time | Result |
| --- | --- | --- | --- |
| 29.9 s native trim | 200 | 63 ms | 29.9667 s, 1280 × 720 |
| 30.1 s native trim | 422 | 11 ms | 30.1667 s |
| 11 bytes of invalid data | 422 | 6 ms | Unrecognized format |
| Native trim with last 1024 bytes removed | 422 | 8 ms | Invalid track metadata |
| Native trim padded with an MP4 free box to exactly 15 MiB | 200 | 380 ms | 29.9667 s, 1280 × 720 |
| Native trim padded to 15 MiB plus one byte | 413 | 344 ms | Exceeds byte cap |

The padded clips exercise request and byte limits. They retain the original low-complexity sample payloads. The [hosted Edge limits](https://supabase.com/docs/guides/functions/limits) are 256 MB memory and 2 s CPU per request.

The parser reads indexed packet payloads and rejects empty tracks, empty payloads, more than 12,000 packets, and payload totals larger than the file. These runs measure request wall time and exercise one form of truncation. See the near-limit measurements below. Elementary-stream corruption and forged sample timestamps still need evidence.

### Near-limit payload and exact duration

FFmpeg 7.1 generated a 29.9-second noisy test pattern at 1280 × 720 and 60 fps with AAC audio. It contained 15,221,408 bytes. The updated Edge probe accepted it in 356 ms and accepted a synthetic 720 × 1280 clip at exactly 30.000 seconds. It rejected the over-limit native fixture when it encountered the first packet extending beyond 30 seconds.

Removing the last 4096 bytes of the near-limit fixture left the fast-start sample index intact. The original parser accepted this file because the packet reader returned the indexed sample size even at EOF. The probe now checks that all top-level MP4 boxes fit within the actual file and rejects the truncated fixture with HTTP 422. It also checks each packet endpoint at the track's time resolution and enforces both coded and display dimensions. This validates MP4 structure and indexed sample bounds, with elementary-stream decode and corruption still to verify.

For the three-request sequence (near-limit, truncated, exact duration), the disposable container used 0.518 s aggregate cgroup CPU and reached 183,246,848 bytes of cgroup memory, including runtime and request overhead. This is a local measurement across the three requests. Hosted worker CPU, per-isolate memory, and concurrent upload capacity remain unverified.

Reproduce the high-bitrate fixture with FFmpeg using the following command.

```sh
ffmpeg -f lavfi -i 'testsrc2=size=1280x720:rate=60,noise=alls=25:allf=t+u' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000' -t 29.9 \
  -c:v libx264 -threads 4 -pix_fmt yuv420p -preset veryfast \
  -b:v 3890k -minrate 3890k -maxrate 3890k -bufsize 7780k -x264-params nal-hrd=cbr \
  -c:a aac -b:a 96k -movflags +faststart 720p60-high.mp4
```

## Portrait VFR and long HEVC

The browser probe now fits the source display aspect ratio into the 1280 × 720 bounds in either orientation, rounds both output dimensions to even values, and bakes orientation into the frames. It reports dimensions from the exported track.

The silent 32-second 720 × 1280 H.264 fixture dropped every fifth frame at offset two from a 30 fps source. Desktop Safari 26.6.2 and Firefox 146 both reported 29.900, 30.000 and 30.100-second output timelines at the three requested boundaries. The 30-second Safari output was 5,916,578 bytes (3,875 ms), and Firefox produced 11,299,310 bytes (3,845 ms). On macOS, AVFoundation's 1280x720 preset produced a 16,576,347-byte output for the same 30-second request, exceeding the 15 MiB hard cap. The production iOS path needs an explicit bitrate-controlled encode and a post-export byte check. Its 720p preset alone is insufficient.

A silent 65-second, 3840 × 2160, 12 fps HEVC Main 10 fixture carried BT.2020/PQ tags and used a flat pattern. AVFoundation converted it to 1280 × 720 8-bit H.264 with BT.709 tags. The strict validator accepted the 29.9-second selection (29.9167 s, 28,146 bytes, 1.84 s export) and the exact 30-second selection (30.000 s, 28,201 bytes, 1.60 s export). The 30.1-second selection exceeded the timeline limit. Peak RSS for the Swift process across its four exports was 254,017,536 bytes. These measurements establish format conversion and timeline bounds for this fixture. They leave visual tone mapping quality and high-motion HDR performance open.

Firefox 146 reported that it could not decode the Main 10 source. Desktop Safari 26.6.2 and iPhone 17 Pro simulator Safari 26.5 both completed the 65-second source test and exported measured 29.9, 30.0 and 30.1-second 1280 × 720 clips. The 30-second exports took 28.67 seconds on desktop (1,120,965 bytes) and 61.43 seconds in the simulator (96,702 bytes). These are probe timings on the flat synthetic clip, with other local test activity running concurrently. Physical-device throughput and export color quality still need evidence. An in-app fallback for unsupported source codecs remains a separate question from the validated AAC encoder fallback.

To test a local fixture in Swift 6, create an empty output directory and run:

```sh
swift -swift-version 6 scripts/media-video-prototype.swift /path/to/output --source /path/to/fixture.mp4
node scripts/media-video-probe/validate.mjs /path/to/output/trim-*.mp4
```

### Native bitrate control

For the silent upright SDR portrait fixture, the Swift 6 `--controlled` path streams frames from `AVAssetReader` to a file-backed `AVAssetWriter` at a 3 Mb/s H.264 target. The 30-second output was 11,260,320 bytes and took 2.01 seconds, down from 16,576,347 bytes with the preset. The independent validator accepted the 29.9-second and 30-second outputs and rejected the 30.1-second output. Across four exports, the Swift process reached 296,026,112 bytes peak RSS on macOS. The controlled probe currently checks silent, upright sources. Audio, orientation transforms, HDR conversion and mobile memory still need verification before adopting it as the full iOS exporter.

```sh
swift -swift-version 6 scripts/media-video-prototype.swift /path/to/output --source /path/to/portrait-vfr.mp4 --controlled
```

### Native audio and rotation

The controlled path now renders source rotation into the output pixels, encodes AAC at 48 kHz, and drains each writer input independently so audio and video can each make progress under backpressure. On macOS, a synthetic H.264/AAC input with a 90° track transform produced upright 720 × 1280 H.264 with AAC-LC stereo and no output rotation metadata. FFmpeg decoded both tracks without errors. The 29.9-second request produced 29.908 seconds and 482,247 bytes in 2.50 seconds. The 29.95-second request produced 29.9667 seconds. The 30-second request was rejected by the strict validator because the audio extended the output past the cap. The iOS producer needs a measured shorten-and-retry step when audio padding crosses the boundary. Physical-device performance and controlled HDR conversion remain to be verified.

### Controlled HDR and native boundary retry

The controlled read/write path initially carried PQ color tags into an 8-bit H.264 output. Setting BT.709 primaries, transfer, and matrix on the video composition before rendering produced an 8-bit BT.709 output from the same 65-second 4K HDR source. FFmpeg decoded the result and the strict parser measured 29.900 seconds, 1280 × 720, and 118,544 bytes for the 29.9-second selection. Export took 3.24 seconds. This verifies the output format with the flat synthetic fixture. Visual tone mapping on real HDR footage and physical device memory still need measurement.

For the rotated audio fixture, the initial 30-second request produced a packet ending at 30.01467 seconds. Subtracting the observed overshoot plus 50 ms and rounding the requested trim down to 29.935 seconds produced a 29.96667-second output in 2.85 seconds. The validator accepted its 483,014-byte file. To reproduce the retry, pass `--controlled --length 29.935` to the Swift probe. A production client must validate the retried output and keep the file local if it remains outside the limits.

## Implementation contract for #523–#525

Use the existing entry-media reservation lifecycle and ordered gallery. The following interfaces are proposed for implementation after this feasibility ticket is accepted.

- **Reserve.** Call `reserve_entry_media(entry_id, request_id, 'video', null, assets)` with the current RPC's named parameters and a stable request UUID. The three asset roles are `display` (MP4, up to 15 MiB), `poster` (square JPEG, up to 1024 × 1024), and `thumbnail` (square JPEG, up to 256 × 256). Each asset carries its exact MIME type and byte count. The reservation returns the canonical paths and bucket for each asset. Keep the video object in a separate private bucket so the existing photo limit stays at 5 MiB. Allocate the position under the entry lock, count pending leases toward the 10-item limit, and enforce the video rollout flag and entitlement on reservation and publication.
- **Upload.** Upload only the exported MP4 via Supabase TUS, scoped to the pending reservation's immutable `display.mp4` key. Store the resumable upload URL against that reservation and local export, and resume using the server's offset. Upload the derivatives as ordinary JPEG uploads to the existing image bucket. Cancellation or an expired lease removes the ability to finish an upload and makes the reservation's orphaned objects eligible for cleanup. Polling or retrying uses the same request UUID and reservation.
- **Finalize and read.** Extend the existing `entry-media-finalize` function to accept a reservation UUID and derive canonical keys from its service-only verification target. Stream no more than 15 MiB into the inspector, validate square derivatives, and persist trusted video facts before calling the transactional finalize RPC. Persist duration in milliseconds rounded up only after enforcing the precise 30-second cap. SQL rechecks reservation ownership, expiry, entitlement, flags, and immutable Storage entries. Return the existing media ID, revision, and position on repeat finalization. Grant signed playback access through the same entry visibility and block checks used for photo derivatives. Raw reservation keys must remain unavailable to gallery readers. Extend cleanup and account deletion to scan both buckets.
- **iOS.** Use a file-backed AVFoundation reader/writer. Bake orientation into 720p-or-smaller output, target 3 Mb/s H.264 and optional 96 kb/s AAC, and derive square JPEGs from the exported clip. Inspect the actual local output. When packet timing crosses 30 seconds, subtract measured overshoot plus 50 ms and verify the shorter retry. Hold the user's source and draft until publication succeeds.
- **Web.** Lazy-load Mediabunny 1.65.2 after video intent and entitlement. Probe decode capability for the selected source and encoding capability for the output codec before conversion. Use the pinned AAC WebAssembly extension only when native AAC encoding is unavailable. Check the output after conversion, apply the same timeline retry, and use native inline playback with a poster, no autoplay, and offscreen pause.

The reservation and publication contract does not depend on the browser's input codec. The web implementation still needs a demonstrated path for unsupported source decoding, and FFmpeg decode of a local prototype is not evidence of a production-safe decoder in the Edge worker. The emulator results below establish packet-copy trim and playback for a compatible source. Run the final upload/playback matrix on a physical Android device with current Chrome before closing the release acceptance rows.

### Supabase capacity scenarios

At the 15 MiB hard cap, 50 clips require 0.786 GB of object storage and 250 complete plays transfer 3.932 GB before verification reads. A 1,000-clip catalog requires 15.729 GB of storage and 5,000 complete plays transfer 78.643 GB. If the backend fetches each complete clip once for verification, allow up to another 0.786 GB or 15.729 GB of transfer respectively until hosted usage measurements establish the accounting. Posters, thumbnails, existing media, abandoned uploads and range requests also count toward planning. The scenarios use decimal GB to compare with published quotas.

Supabase lists 1 GB of storage and 5 GB of uncached egress on Free. The smaller scenario can consume most of that shared allowance even without a traffic spike. The larger scenario exceeds both Free quotas. Supabase Pro lists 100 GB of storage and separate 250 GB cached and uncached egress allowances. If the project is already on Pro, add video usage to the existing usage before evaluating headroom. If overage billing is already enabled, the published rates above those Pro allowances are $0.0213 per GB for retained storage, $0.09 per GB for uncached egress, and $0.03 per GB for cached egress. Use the uncached rate for planning until signed playback cache behavior is measured. These estimates do not authorize a plan change or a new service. Check current project usage and the spend cap before enabling uploads. See the [Supabase pricing table](https://supabase.com/pricing) and [egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

### Export options

- UIKit's built-in editor has a maximum-duration control and returns the saved file path. It is portrait-only and exposes quality presets. The measured preset overshoot in bytes and the need to validate the packet timeline favor a custom trim interface with AVFoundation reader/writer and explicit encoder settings. See [Apple's video editor documentation](https://developer.apple.com/documentation/UIKit/UIVideoEditorController).
- MediaRecorder captures a MediaStream as it plays. A 30-second capture can take about 30 seconds at normal playback speed, and support for recording a particular MIME/codec combination varies by implementation. Treat it as a separate capture path, with the same output validation. It does not address a browser that cannot decode the source. See the [MediaStream Recording specification](https://www.w3.org/TR/mediastream-recording/).
- Full ffmpeg.wasm can add source codec support, but its example build downloads about 31 MB of core code and its typical integration copies files through the worker filesystem. The project's older desktop benchmark took 128.8 seconds for the single-thread build and 60.4 seconds for the multithread build on a conversion native FFmpeg completed in 5.2 seconds. Those timings are directional and come from a different workload. A production fallback would need a pinned audited build, bounded source copying or file-backed input, mobile memory measurements and license review. See [ffmpeg.wasm usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/) and [performance](https://ffmpegwasm.netlify.app/docs/performance/).

### Android Chrome

The Android 36.1 ARM64 Google Play emulator booted with Chrome 134.0.6998.135. The localhost probe decoded the H.264/AAC fixture and reported native AAC encoding but no H.264 encoder. Each requested transcode returned `no_encodable_target_codec`. This image does not establish physical-device encoder availability.

The probe's packet-copy option uses Mediabunny's forced copy with shrinking boundaries. It produced 29.900, 30.000, and 30.070-second outputs for 29.9, 30.0, and 30.1-second requests respectively. The exact 30-second clip exported in 41 ms, played in Android Chrome, and passed the independent validator at 332,675 bytes and 1280 × 720. The preview excluded the 30.070-second output.

Packet copy provides an in-browser alternative for compatible H.264/AAC sources that already meet the output constraints. The editor must measure and surface the actual selected bounds because the start can move to a keyframe, and reject the export if the independent checks fail. This path cannot resize or convert an incompatible source. Hardware encoding on current physical Android Chrome and a fallback for sources that require transcoding are still open.

### Browser software transcode fallback

On the Android 36.1 emulator, Chrome 134.0.6998.135 exported and played the silent VFR portrait fixture with `@ffmpeg/ffmpeg` 0.12.15 and single-threaded `@ffmpeg/core` 0.12.10. The worker mounted the source Blob with WORKERFS and encoded the selected 29.9 seconds to 720 × 1280 H.264 using libx264 at a 3 Mb/s target. The independent validator accepted the 11,371,827-byte output. Local core load took 1.10 seconds and load through playback took 18.58 seconds. The emulator's resource usage does not establish a minimum physical-device budget.

The wrapper declares MIT and the published core declares GPL-2.0-or-later. The core WASM is 32,232,419 bytes uncompressed. This measures a working fallback where WebCodecs cannot encode H.264. Before shipping a core, resolve corresponding-source distribution and measure cold load, peak memory, and cancellation on current physical devices. Keep core loading behind the fallback path. The normal WebCodecs and compatible packet-copy paths do not need this dependency.
