"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { setBlocked } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/client";
import { ReportDialog } from "./ReportDialog";

const ITEM =
  "flex min-h-11 w-full cursor-pointer items-center px-4 text-left text-body hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

// The "…" beside Follow on someone else's /@handle, for signed-in visitors:
// Report, and Block or Unblock. A <details> that
// closes when an item is chosen.
export function ProfileActions({ profileId, handle, blocked }: { profileId: string; handle: string; blocked: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [reporting, setReporting] = useState(false);
  const toggle = useBlockToggle(profileId, handle, blocked);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  return (
    <>
      <details ref={menu} className="relative">
        <summary
          aria-label={`More actions for @${handle}`}
          className="flex size-11 cursor-pointer list-none items-center justify-center rounded-pill text-label hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
        >
          <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false" fill="currentColor">
            <circle cx="5" cy="12" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="19" cy="12" r="1.75" />
          </svg>
        </summary>
        <div className="absolute right-0 z-10 mt-1 min-w-52 overflow-hidden rounded-md border border-separator bg-surface shadow-lg">
          <button
            type="button"
            onClick={() => {
              close();
              setReporting(true);
            }}
            className={`${ITEM} text-label`}
          >
            Report
          </button>
          <button
            type="button"
            disabled={toggle.busy}
            onClick={() => {
              close();
              toggle.run();
            }}
            className={`${ITEM} border-t border-separator text-destructive`}
          >
            {blocked ? "Unblock" : "Block"}
          </button>
        </div>
      </details>
      {reporting && <ReportDialog target={{ type: "profile", id: profileId }} owner={{ id: profileId, handle }} onClose={() => setReporting(false)} />}
      {toggle.dialog}
    </>
  );
}

// Shown in place of the shows on a profile the visitor has blocked.
export function UnblockButton({ profileId, handle }: { profileId: string; handle: string }) {
  const toggle = useBlockToggle(profileId, handle, true);
  return (
    <>
      <Button size="sm" variant="secondary" disabled={toggle.busy} onClick={toggle.run}>
        Unblock
      </Button>
      {toggle.dialog}
    </>
  );
}

// Block or unblock after a confirmation, then read the page again: blocking
// ends follows both ways and hides each from the other (Postgres does both).
export function useBlockToggle(profileId: string, handle: string, blocked: boolean, onChanged?: () => void) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function run() {
    const ok = await confirm(
      blocked
        ? { title: `Unblock @${handle}?`, message: "They’ll be able to see your shows and follow you again.", action: "Unblock" }
        : {
            title: `Block @${handle}?`,
            message: "You won’t see each other’s shows, likes or comments, and any follows between you end. They aren’t told.",
            action: "Block",
          },
    );
    if (!ok) return;
    setSaving(true);
    const { ok: saved } = await setBlocked(createClient(), profileId, !blocked);
    if (!saved) {
      setSaving(false);
      window.alert(blocked ? `Couldn’t unblock @${handle}. Try again.` : `Couldn’t block @${handle}. Try again.`);
      return;
    }
    onChanged?.();
    startRefresh(() => {
      setSaving(false);
      router.refresh();
    });
  }

  return { run, dialog, busy: saving || refreshing };
}
