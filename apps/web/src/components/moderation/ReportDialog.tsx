"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { REPORT_REASONS, sendReport, setBlocked, targetNoun, type ReportReason, type ReportTarget } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/client";

// Report a show, a comment or a profile: a reason, optional details, and
// "Also block @handle". Only admins read reports (/app/admin/reports). The
// iOS app's ReportSheet asks the same. Mounted while open; a native modal
// <dialog>, so Escape and the backdrop close it.
export function ReportDialog({
  target,
  owner,
  onClose,
}: {
  target: ReportTarget;
  // Who made it, for "Also block @handle".
  owner: { id: string; handle: string };
  onClose: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // As ConfirmDialog: the cleanup also runs when the page is hidden, which
  // closes the modal so it can't trap a page the visitor has left.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    return () => el.close();
  }, []);

  function close() {
    if (sending) return;
    onClose();
    // A block hides their content, so the page reads again.
    if (sent && block) router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await sendReport(supabase, target, reason, note);
    if (!error && block) await setBlocked(supabase, owner.id, true);
    setSending(false);
    if (error) setError(error);
    else setSent(true);
  }

  const noun = targetNoun(target.type);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[420px] rounded-md border border-separator bg-surface p-0 text-label shadow-lg backdrop:bg-black/50"
    >
      {sent ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <h2 id={`${id}-title`} className="text-title-2 font-display text-label">
            Thanks for telling us
          </h2>
          <p className="text-subheadline text-label-secondary">
            We’ll look at it and act if it breaks our rules.
            {block && ` You’ve blocked @${owner.handle}.`}
          </p>
          <Button className="mt-2 self-stretch" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 p-5">
          <h2 id={`${id}-title`} className="text-title-2 font-display text-label">
            Report this {noun}
          </h2>
          <fieldset className="flex flex-col">
            <legend className="mb-2 text-subheadline text-label-secondary">What’s wrong with it?</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-separator text-body text-label last:border-b-0"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="size-5 accent-tint"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-subheadline font-medium text-label">
            Details (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="rounded-sm border border-separator bg-background px-3 py-2 text-body font-normal text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-label">
            <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="size-5 accent-tint" />
            Also block @{owner.handle}
          </label>
          {error && (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reason || sending}>
              {sending ? "Sending…" : "Send report"}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}

// A quiet "Report" text button that opens the dialog: beside someone else's
// comment, and under someone else's show.
export function ReportButton({
  target,
  owner,
  label = "Report",
}: {
  target: ReportTarget;
  owner: { id: string; handle: string };
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 shrink-0 cursor-pointer rounded-pill px-3 text-footnote font-semibold text-label-secondary hover:bg-fill hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {label}
      </button>
      {open && <ReportDialog target={target} owner={owner} onClose={() => setOpen(false)} />}
    </>
  );
}
