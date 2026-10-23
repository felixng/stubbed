"use client";

import { useId, useRef, useState } from "react";

import { AVATAR_BUCKET as BUCKET, avatarPath } from "@/lib/avatar";
import { AVATAR_EDGE, reencodeJpeg } from "@/lib/photo";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";

const linkClass =
  "text-subheadline font-medium text-tint-text hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// The path of a file in our avatars bucket from its public URL, when it's one
// of this user's; null for anything else (no photo, or one from elsewhere).
function ownPath(url: string | null, userId: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (!url || at < 0) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
  return path.startsWith(`${userId}/`) ? path : null;
}

// Tap the avatar to add or change the profile photo. Saves straight away, on
// its own, so it works the same inside the onboarding and profile forms. The
// photo is cropped square and re-encoded on the device (which drops EXIF/GPS)
// before upload. RLS limits the upload and the profile write to this user.
export function AvatarPicker({
  userId,
  name,
  initialUrl,
  size = 88,
}: {
  userId: string;
  name: string;
  initialUrl: string | null;
  size?: number;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: string | null) {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ avatar_url: next }).eq("id", userId);
    if (error) throw error;
    // The profile no longer points at the old file, so delete it.
    const old = ownPath(url, userId);
    if (old) await supabase.storage.from(BUCKET).remove([old]);
    setUrl(next);
  }

  async function onFile(file: File) {
    setStatus(null);
    setBusy(true);
    try {
      let jpeg: Blob;
      try {
        jpeg = await reencodeJpeg(file, AVATAR_EDGE, 0.85, true);
      } catch {
        return setStatus({ ok: false, text: "Couldn’t read that photo. Try another." });
      }
      const supabase = createClient();
      const path = avatarPath(userId);
      const { error: upload } = await supabase.storage
        .from(BUCKET)
        .upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (upload) throw upload;
      try {
        await save(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      } catch (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      setStatus({ ok: true, text: "Photo saved." });
    } catch (error) {
      console.error("Saving the avatar failed", error);
      setStatus({ ok: false, text: "Couldn’t save the photo. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setStatus(null);
    setBusy(true);
    try {
      await save(null);
      setStatus({ ok: true, text: "Photo removed." });
    } catch (error) {
      console.error("Removing the avatar failed", error);
      setStatus({ ok: false, text: "Couldn’t remove the photo. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={input}
        id={`${id}-file`}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        aria-label={url ? "Change profile photo" : "Add profile photo"}
        className="relative rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
      >
        <Avatar name={name || "?"} url={url} size={size} />
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-pill bg-label text-background ring-2 ring-background"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </span>
      </button>
      <div className="flex gap-4">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={linkClass}>
          {busy ? "Saving…" : url ? "Change photo" : "Add photo"}
        </button>
        {url && !busy && (
          <button type="button" onClick={remove} className={linkClass}>
            Remove
          </button>
        )}
      </div>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`text-footnote ${status.ok ? "text-label-secondary" : "text-destructive"}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
