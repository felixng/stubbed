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
