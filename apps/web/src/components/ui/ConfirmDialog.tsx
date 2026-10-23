"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

// An in-app confirmation for destructive steps, in place of window.confirm:
// a native modal <dialog>, so focus stays inside, the rest of the page is
// inert and Escape cancels. Matches the iOS confirmation dialog: the question,
// one line of consequence, the destructive action and Cancel.
//
//   const [confirm, dialog] = useConfirm();
//   if (!(await confirm({ title: "Delete this trip?", action: "Delete trip" }))) return;
//   …
//   return <>{button}{dialog}</>;
type Options = { title: string; message?: string; action: string };

export function useConfirm() {
  const [pending, setPending] = useState<(Options & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: Options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  const dialog = pending ? <ConfirmDialog {...pending} onSettle={settle} /> : null;
  return [confirm, dialog] as const;
}

function ConfirmDialog({ title, message, action, onSettle }: Options & { onSettle: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  // Opens while mounted. The cleanup also runs when the page is hidden (see
  // useFreshOnReturn), which closes the modal so it can't trap a page the
  // visitor has left; it opens again if they come back with it unanswered.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    // Cancel first, as with the system dialogs: Enter never deletes by accident.
    cancelRef.current?.focus();
    return () => el.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      // Escape fires `cancel`; settle as Cancel and let React unmount it.
      onCancel={(e) => {
        e.preventDefault();
        onSettle(false);
      }}
      // A tap on the backdrop (the dialog element itself, outside its panel) cancels.
      onClick={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
      className="m-auto w-[min(100%-32px,340px)] rounded-lg bg-surface p-0 text-label shadow-lg backdrop:bg-label/40"
    >
      <div className="flex flex-col gap-1 px-5 pt-5 pb-4 text-center">
        <h2 id={titleId} className="text-headline text-label">
          {title}
        </h2>
        {message && (
          <p id={messageId} className="text-subheadline text-label-secondary">
            {message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={() => onSettle(true)}
          className="min-h-11 cursor-pointer rounded-pill bg-fill px-4 text-headline text-destructive hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {action}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => onSettle(false)}
          className="min-h-11 cursor-pointer rounded-pill px-4 text-headline text-tint-text hover:bg-tint-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
