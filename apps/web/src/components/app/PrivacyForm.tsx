"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

export function PrivacyForm({ userId, initial }: { userId: string; initial: boolean }) {
  const id = useId();
  const router = useRouter();
  const [isPrivate, setIsPrivate] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const shown = useFreshOnReturn(() => setStatus(null));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const { error } = await createClient().from("profiles").update({ is_private: isPrivate }).eq("id", userId);
      if (error) throw error;
      setSaved(isPrivate);
      shown();
      setStatus({ ok: true, text: isPrivate ? "Saved. Your profile is private." : "Saved. Your profile is public." });
      router.refresh();
    } catch {
      setStatus({ ok: false, text: "Couldn’t save your privacy settings. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-md border border-separator bg-surface p-4 shadow-sm">
        <span className="flex flex-col gap-1">
          <span className="text-body font-medium text-label">Private profile</span>
          <span id={`${id}-hint`} className="text-footnote text-label-secondary">
            Only you and followers you approve see your shows, trips and stats. Others see your handle, name, bio and link.
          </span>
        </span>
        <input id={id} type="checkbox" role="switch" checked={isPrivate} disabled={saving}
          aria-describedby={`${id}-hint${saved && !isPrivate ? ` ${id}-warning` : ""}`}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
      </label>
      {saved && !isPrivate && <p id={`${id}-warning`} className="text-footnote text-label-secondary">Going public approves any follow requests waiting for you.</p>}
      {status && <p role={status.ok ? "status" : "alert"} className={`text-footnote ${status.ok ? "text-label" : "text-destructive"}`}>{status.text}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
    </form>
  );
}
