"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/Button";
import { field, label } from "../login/LoginForm";
import { sendPasswordReset, type ResetState } from "../login/actions";

export function ForgotForm() {
  const id = useId();
  const [state, dispatch, pending] = useActionState<ResetState, FormData>(sendPasswordReset, {});
  if (state.sent) {
    return (
      <p role="status" className="rounded-md bg-tint-fill px-4 py-3 text-center text-subheadline text-label">
        If <span className="font-semibold break-all">{state.email}</span> has a Stubbed account, a reset link is on its way.
      </p>
    );
  }
  return (
    <form action={dispatch} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className={label}>
          Email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="you@example.com"
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={field}
        />
      </div>
      {state.error ? (
        <p id={`${id}-error`} role="alert" className="text-footnote text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
