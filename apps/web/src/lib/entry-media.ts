import type { SupabaseClient } from "@supabase/supabase-js";
import { signPhotos } from "./entries";
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

export async function entryGallery(client: SupabaseClient, entryId: string) {
  const { data, error } = await client.from("entry_media")
    .select("id,kind,display_path,poster_path,legacy").eq("entry_id", entryId)
    .eq("state", "ready").order("position");
  if (error) throw error;
  return data as { id: string; kind: "photo" | "video"; display_path: string; poster_path: string | null; legacy: boolean }[];
}

export async function reorderEntryGallery(client: SupabaseClient, entryId: string, mediaIds: string[]) {
  const { error } = await client.rpc("reorder_entry_media", { p_entry_id: entryId, p_media_ids: mediaIds });
  if (error) throw error;
}

export type GalleryItem = { id: string; url: string; kind: "photo" | "video"; poster: string | null };

export async function signedEntryGallery(client: SupabaseClient, id: string): Promise<GalleryItem[]> {
  const rows = await entryGallery(client, id).catch(() => []);
  const paths = rows.filter((row) => !row.legacy).flatMap((row) =>
    row.poster_path ? [row.display_path, row.poster_path] : [row.display_path]);
  const [legacy, native] = await Promise.all([
    signPhotos(client, rows.filter((row) => row.legacy).map((row) => row.display_path)),
    paths.length ? client.storage.from(ENTRY_MEDIA_BUCKET).createSignedUrls(paths, 3600) : null,
  ]);
  const signed = new Map(native?.data?.flatMap((row) =>
    row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : []));
  return rows.flatMap((row) => {
    const url = (row.legacy ? legacy : signed).get(row.display_path);
    return url ? [{ id: row.id, kind: row.kind, url,
      poster: row.poster_path ? signed.get(row.poster_path) ?? null : null }] : [];
  });
}
