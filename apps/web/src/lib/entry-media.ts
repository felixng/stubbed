import type { SupabaseClient } from "@supabase/supabase-js";
import type { renderPhotoCrop } from "./photo-crop";

export const ENTRY_MEDIA_BUCKET = "entry-media";

export type EntryPhotoDraft = Awaited<ReturnType<typeof renderPhotoCrop>> & {
  requestId: string;
  replacing: string | null;
  recrop?: boolean;
};

export async function entryMediaCover(client: SupabaseClient, entryId: string) {
  const { data, error } = await client.from("entry_media_covers")
    .select("media_id, photo_path, legacy").eq("entry_id", entryId).maybeSingle();
  if (error) throw error;
  return data as { media_id: string; photo_path: string; legacy: boolean } | null;
}

export async function saveEntryPhoto(client: SupabaseClient, entryId: string, photo: EntryPhotoDraft) {
  const files = { display: photo.display, thumb: photo.thumbnail, ...(!photo.recrop && { source: photo.source }) };
  const { data, error } = await client.rpc("reserve_entry_media", {
    p_entry_id: entryId,
    p_request_id: photo.requestId,
    p_kind: "photo",
    p_replace_media_id: photo.replacing,
    p_assets: Object.entries(files).map(([role, file]) => ({ role, content_type: "image/jpeg", bytes: file.size })),
  });
  if (error) throw error;
  if (data.state === "finalized") return;

  const bucket = client.storage.from(ENTRY_MEDIA_BUCKET);
  for (const [role, file] of Object.entries(files)) {
    const path = data.paths[role];
    if (typeof path !== "string") throw new Error("Missing reserved upload path");
    const { error: uploadError } = await bucket.upload(path, file, {
      contentType: "image/jpeg", cacheControl: "3600", upsert: false,
    });
    if (uploadError && !("statusCode" in uploadError && uploadError.statusCode === "409")) throw uploadError;
  }
  const { error: finalizeError } = await client.functions.invoke("entry-media-finalize", {
    body: { reservation_id: data.reservation_id, crop: photo.rectangle },
  });
  if (finalizeError) throw finalizeError;
}
