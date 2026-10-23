"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { Button } from "@/components/ui/Button";
import {
  BIO_MAX,
  NAME_MAX,
  handleProblem,
  isReservedHandleError,
  normalizeHandle,
  normalizeLink,
} from "@/lib/profile-handle";
import type { OwnProfile } from "@/lib/supabase/data";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { fieldClass } from "./log/Typeahead";

const label = "text-subheadline font-medium text-label";
const optional = <span className="font-normal text-label-secondary">(optional)</span>;

// Photo, handle, name, bio, link and the private switch. The photo saves on
// its own, as soon as it's picked. Everyone has a handle (set
// at /welcome), so the public profile (/@handle) always exists; going private
// hides its shows, trips and stats from everyone but approved followers. RLS limits the write
// to the signed-in user's own row and enforces the privacy.
export function ProfileForm({ userId, initial }: { userId: string; initial: OwnProfile }) {
  const id = useId();
  const router = useRouter();
  const [handle, setHandle] = useState(initial.handle ?? "");
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [link, setLink] = useState(initial.link ?? "");
  const [isPrivate, setIsPrivate] = useState(initial.is_private);
  const [saved, setSaved] = useState(initial.handle);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  // "Saved." is for this visit; it's gone when the page is shown again.
  const shown = useFreshOnReturn(() => setStatus(null));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const h = normalizeHandle(handle);
    const problem = handleProblem(h, saved);
    if (problem) return setStatus({ ok: false, text: problem });
    const url = normalizeLink(link);
    if (link.trim() && !url) return setStatus({ ok: false, text: "That link doesn’t look like a web address." });
    setSaving(true);
    const { error } = await createClient()
      .from("profiles")
      .update({
        handle: h,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        link: url,
        is_private: isPrivate,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      return setStatus({
        ok: false,
        text:
          error.code === "23505"
            ? `@${h} is taken. Try another.`
            : isReservedHandleError(error)
              ? `@${h} is reserved. Try another.`
              : "Couldn’t save your profile. Try again.",
      });
    }
    setHandle(h);
    setLink(url ?? "");
    setSaved(h);
    shown();
    setStatus({ ok: true, text: isPrivate ? "Saved. Your profile is private." : "Saved. Your profile is public." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <AvatarPicker userId={userId} name={displayName || handle} initialUrl={initial.avatar_url} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-handle`} className={label}>
          Handle
        </label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-body text-label-secondary">
            @
          </span>
          <input
            id={`${id}-handle`}
            className={`${fieldClass} pl-9`}
            value={handle}
            maxLength={21}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="sillyelphaba"
            aria-describedby={`${id}-handle-hint`}
            onChange={(e) => setHandle(normalizeHandle(e.target.value))}
          />
        </div>
        <p id={`${id}-handle-hint`} className="text-footnote text-label-secondary">
          Your profile is at /@{handle || "handle"}.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className={label}>
          Display name {optional}
        </label>
        <input
          id={`${id}-name`}
          className={fieldClass}
          value={displayName}
          maxLength={NAME_MAX}
          autoComplete="name"
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-bio`} className={label}>
            Bio {optional}
          </label>
          <span className="text-footnote text-label-secondary">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id={`${id}-bio`}
          className={`${fieldClass} resize-none py-3`}
          rows={3}
          value={bio}
          maxLength={BIO_MAX}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-link`} className={label}>
          Link {optional}
        </label>
        <input
          id={`${id}-link`}
          className={fieldClass}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={link}
          placeholder="instagram.com/yourname"
          onChange={(e) => setLink(e.target.value)}
        />
      </div>
      <label
        htmlFor={`${id}-private`}
        className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-separator bg-surface px-4 py-3 shadow-sm"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-body font-medium text-label">Private profile</span>
          <span id={`${id}-private-hint`} className="text-footnote text-label-secondary">
            Only you and followers you approve see your shows, trips and stats. Others see your handle, name, bio and link.
          </span>
        </span>
        <input
          id={`${id}-private`}
          type="checkbox"
          role="switch"
          checked={isPrivate}
          aria-describedby={`${id}-private-hint`}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </label>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`text-footnote ${status.ok ? "text-label" : "text-destructive"}`}>
          {status.text}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {saved && (
        <Link
          href={`/@${saved}`}
          className="inline-flex min-h-[50px] items-center justify-center rounded-pill bg-tint-fill px-6 text-headline text-tint-text hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          View profile
        </Link>
      )}
    </form>
  );
}
