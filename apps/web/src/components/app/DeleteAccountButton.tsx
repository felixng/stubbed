"use client";

import { useActionState, useId, useRef, useState } from "react";

import { deleteAccount, type DeleteAccountState } from "@/app/app/profile/actions";
import { Button } from "@/components/ui/Button";
import { disableBrowserPush } from "@/lib/browser-push";
import { normalizeHandle } from "@/lib/profile-handle";
import { fieldClass } from "./log/Typeahead";

// Opens a confirmation modal; the account is deleted only once the user types
// their handle. Native <dialog>: focus moves in and stays there, Escape
// closes it.
export function DeleteAccountButton({ handle, asRow = false }: { handle: string; asRow?: boolean }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [state, dispatch, pending] = useActionState<DeleteAccountState, FormData>(async (previous, form) => {
    if (normalizeHandle(String(form.get("confirm") ?? "")) === handle.toLowerCase()) await disableBrowserPush().catch(() => {});
    return deleteAccount(previous, form);
  }, {});
  const matches = normalizeHandle(typed) === handle.toLowerCase();

  function close() {
    if (pending) return;
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTyped("");
          dialog.current?.showModal();
        }}
        className={asRow
          ? "min-h-12 w-full cursor-pointer px-4 py-3 text-left text-body text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          : "min-h-11 self-start rounded-pill px-4 text-subheadline font-semibold text-destructive hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"}
      >
        Delete account
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        onClick={(e) => {
          // A click on the backdrop lands on the <dialog> itself.
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[calc(100%-32px)] max-w-[420px] rounded-md border border-separator bg-surface p-0 text-label shadow-lg backdrop:bg-black/50"
      >
        <form action={dispatch} className="flex flex-col gap-4 p-5">
          <h2 id={`${id}-title`} className="text-title-2 font-display text-label">
            Delete your account?
          </h2>
          <p id={`${id}-desc`} className="text-subheadline text-label-secondary">
            This permanently deletes your profile, every show in your diary, your trips and labels, and your
            photos. It can’t be undone. Shows and venues you added stay in the catalogue for others.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-confirm`} className="text-subheadline font-medium text-label">
              Type your handle, <span className="font-semibold break-all">@{handle}</span>, to confirm
            </label>
            <input
              id={`${id}-confirm`}
              name="confirm"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-describedby={state.error ? `${id}-error` : undefined}
              className={fieldClass}
            />
          </div>
          {state.error ? (
            <p id={`${id}-error`} role="alert" className="text-footnote text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={!matches || pending}
              className="inline-flex min-h-[50px] cursor-pointer items-center justify-center rounded-pill bg-destructive px-6 text-headline font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
