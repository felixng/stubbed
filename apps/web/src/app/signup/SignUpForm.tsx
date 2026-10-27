"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/Button";
import { field, label, ProviderButtons } from "../login/LoginForm";
import { signUp, type SignUpState } from "../login/actions";

// Apple, Google, or email + password. An email account gets a confirmation
// email first; then /welcome asks for a handle.
export function SignUpForm() {
  const id = useId();
  const next = useSearchParams().get("next") ?? "";
  const [state, dispatch, pending] = useActionState<SignUpState, FormData>(signUp, {});

  if (state.sent) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-5 text-center shadow-sm">
        <h2 className="text-headline text-label">Check your email</h2>
        <p className="text-subheadline text-label-secondary">
          We’ve sent a link to <span className="font-semibold break-all text-label">{state.email}</span>. Open it to confirm
          your account and pick your handle.
        </p>
        <p className="text-footnote text-label-secondary">
          Nothing there? Check spam, or{" "}
          <Link href="/signup" className="font-semibold text-tint-text underline-offset-2 hover:underline">
            try again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ProviderButtons next={next} />
      <form action={dispatch} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
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
            className={field}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-password`} className={label}>
            Password
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
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
