import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTRY_MEDIA_BUCKET, ENTRY_VIDEO_BUCKET } from "./entry-media";
import { supabaseEnv } from "./env";

export type EntryVideoDraft = {
  requestId: string;
  display: Blob;
  poster: Blob;
  thumb: Blob;
  reservationId?: string;
  uploadUrl?: string;
  uploaded?: boolean;
};

const chunkSize = 6 * 1024 * 1024;

async function uploadVideo(client: SupabaseClient, draft: EntryVideoDraft, path: string,
  signal: AbortSignal, onProgress: (fraction: number) => void) {
  const { url, key } = supabaseEnv();
  const endpoint = new URL("/storage/v1/upload/resumable", url);
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) throw new Error("Sign in again to upload this video.");
  const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Tus-Resumable": "1.0.0" };
  const checkedUrl = (location: string) => {
    const target = new URL(location, endpoint);
    if (target.origin !== endpoint.origin || !target.pathname.startsWith(endpoint.pathname + "/")) {
      throw new Error("Invalid video upload URL.");
    }
    return target.href;
  };
  let offset = 0;
  if (draft.uploadUrl) {
    const response = await fetch(checkedUrl(draft.uploadUrl), { method: "HEAD", headers, signal });
    if (response.status === 404 || response.status === 410) {
      draft.uploadUrl = undefined;
    } else {
      const confirmed = response.headers.get("Upload-Offset");
      offset = Number(confirmed);
      if (!response.ok || confirmed === null || !Number.isSafeInteger(offset) || offset < 0 || offset > draft.display.size) {
        throw new Error("Couldn’t resume video upload.");
      }
    }
  }
  if (!draft.uploadUrl) {
    const metadata = Object.entries({ bucketName: ENTRY_VIDEO_BUCKET, objectName: path, contentType: "video/mp4" })
      .map(([name, value]) => name + " " + btoa(value)).join(",");
    const response = await fetch(endpoint, { method: "POST", signal, headers: {
      ...headers, "Upload-Length": String(draft.display.size), "Upload-Metadata": metadata,
    } });
    const location = response.headers.get("Location");
    if (response.status !== 201 || !location) throw new Error("Couldn’t start video upload.");
    draft.uploadUrl = checkedUrl(location);
  }
  onProgress(offset / draft.display.size);
  while (offset < draft.display.size) {
    const end = Math.min(offset + chunkSize, draft.display.size);
    const response = await fetch(draft.uploadUrl, { method: "PATCH", signal,
      headers: { ...headers, "Content-Type": "application/offset+octet-stream", "Upload-Offset": String(offset) },
      body: draft.display.slice(offset, end),
    });
    if (response.status !== 204 || Number(response.headers.get("Upload-Offset")) !== end) {
      throw new Error("Video upload was interrupted.");
    }
    offset = end;
    onProgress(offset / draft.display.size);
  }
}

export async function saveEntryVideo(client: SupabaseClient, entryId: string, draft: EntryVideoDraft,
  signal: AbortSignal, onProgress: (fraction: number) => void) {
  if (draft.display.size <= 0 || draft.display.size > 15 * 1024 * 1024) {
    throw new Error("The exported video must fit within 15 MiB.");
  }
  signal.throwIfAborted();
  const assets = { display: draft.display, poster: draft.poster, thumb: draft.thumb };
  const { data: lease, error } = await client.rpc("reserve_entry_media", {
    p_entry_id: entryId, p_request_id: draft.requestId, p_kind: "video", p_replace_media_id: null,
    p_assets: Object.entries(assets).map(([role, file]) => ({
      role, content_type: role === "display" ? "video/mp4" : "image/jpeg", bytes: file.size,
    })),
  });
  if (error) throw error;
  if (lease.state === "finalized") return;
  draft.reservationId = lease.reservation_id;

  if (!draft.uploaded) {
    await uploadVideo(client, draft, lease.paths.display, signal, onProgress);
    draft.uploaded = true;
  }
  for (const role of ["poster", "thumb"] as const) {
    signal.throwIfAborted();
    const { error: uploadError } = await client.storage.from(ENTRY_MEDIA_BUCKET)
      .upload(lease.paths[role], assets[role], { contentType: "image/jpeg", upsert: false });
    if (uploadError && !("statusCode" in uploadError && uploadError.statusCode === "409")) throw uploadError;
  }
  signal.throwIfAborted();
  const { error: finalizeError } = await client.functions.invoke("entry-media-finalize", {
    body: { reservation_id: lease.reservation_id },
  });
  if (finalizeError) throw finalizeError;
}
