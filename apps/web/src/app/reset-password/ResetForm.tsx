"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/Button";
import { field, label } from "../login/LoginForm";
import { updatePassword, type LoginState } from "../login/actions";

export function ResetForm() {
  const id = useId();
  const [state, dispatch, pending] = useActionState<LoginState, FormData>(updatePassword, {});
  return (
    <form action={dispatch} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-password`} className={label}>
          New password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-describedby={`${id}-hint${state.error ? ` ${id}-error` : ""}`}
          className={field}
        />
        <p id={`${id}-hint`} className="text-footnote text-label-secondary">
          At least 8 characters.
        </p>
      </div>
      {state.error ? (
        <p id={`${id}-error`} role="alert" className="text-footnote text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
