# Entry media

The first photo and square cropping are free. Verified Pro membership allows up to ten combined photos and videos per entry and video clips up to 30 seconds. Existing media stays readable after expiry. This migration adds the read schema. Client writes and release capabilities are delivered in the subsequent slices of #164.

## Photos and gallery reads

Read metadata and derivatives from `entry_media`, ordered by zero-based position. The first ready item supplies the static cover through the security-invoker `entry_media_covers` view. Video covers use the square poster. The `legacy` flag selects the `entry-photos` bucket. Native files use the private `entry-media` bucket.

Normalize orientation before resizing to a maximum 1600px long edge and encoding a metadata-stripped JPEG. Read EXIF and run existing on-device recognition before encoding. The crop rectangle uses normalized coordinates from the top left of the normalized source. For width W and height H, use side S = min(W, H). The centered rectangle is ((W-S)/2W, (H-S)/2H, S/W, S/H). The normalized width and height may differ. The sides must agree within one source pixel. Render a square JPEG and thumbnail and retain the uncropped JPEG.

Native files use `{entry_id}/{media_id}/{revision}/{role}.{extension}`. The owner-only `entry_media_sources` relation supplies the source revision. Recropping advances the derivative revision while preserving the source revision. Videos use a trimmed display file and square poster, with no retained long source.

## Legacy compatibility

The migration projects canonical legacy photo paths into ready rows and preserves their IDs on retries. Legacy rows reuse stored bytes and have no crop or source metadata. Unexpected legacy paths remain readable through existing legacy APIs. Existing feed and entry RPC shapes and `entries.photo_path` remain intact. For native entries, current clients read the cover view and fall back to the legacy path when the view is unavailable or has no ready item. Older clients continue to show their legacy photo or the existing fallback. They can still update the legacy path, but their storage operations cannot alter native assets. Before enabling native writes, clients must verify the new schema and authorization endpoints are deployed. Entry deletion cascades metadata. The authorization slice must arrange Storage API cleanup for deleted entries, accounts and abandoned reservations.

## Upload interface for #518

- `reserve_entry_media(p_entry_id uuid, p_request_id uuid, p_kind text, p_replace_media_id uuid, p_assets jsonb)` returns `reservation_id`, `media_id`, `position`, `revision`, `expires_at` and permitted object paths. Each asset declares `role`, `content_type` and `bytes`. A null replacement ID appends a new item. A trusted upload endpoint issues short-lived credentials for the returned paths after reservation authorization.
- `finalize_entry_media(p_reservation_id uuid)` returns the finalized media ID, revision and position. A trusted verifier records the measured asset metadata before finalization. The client does not supply proof of type, size or duration. Pending assets and failed replacements leave the last ready revision in place.
- Scope request IDs to the owner, reject changed payloads on reuse, and return the same result for retries. Lock the entry before checking owner, active reservations, capacity and entitlements. Recheck at finalize. Keep pending assets private and deny unreserved writes and overwrites.
