"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/Button";
import { GoogleButton } from "./GoogleButton";
import { signInWithPassword, signInWithProvider, type LoginState } from "./actions";

export const field =
  "block min-h-[50px] w-full rounded-md border border-separator bg-surface px-4 text-body text-label shadow-sm placeholder:text-label-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const label = "text-subheadline font-medium text-label";

// Google, Apple, or email + password. The page the visitor was sent here from
// (?next=/app/...) rides along so they land back on it.
export function LoginForm() {
  const id = useId();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [state, dispatch, pending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    {},
  );

  const error = state.error ?? providerErrors[params.get("error") ?? ""];

  return (
    <div className="flex flex-col gap-6">
      {params.get("deleted") === "1" && (
        <p role="status" className="rounded-md bg-tint-fill px-4 py-3 text-subheadline font-medium text-label">
          Your account and everything in it have been deleted.
        </p>
      )}
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
            autoComplete="current-password"
            required
            aria-describedby={error ? `${id}-error` : undefined}
            className={field}
          />
        </div>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-footnote text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

// Apple or Google, on /login and /signup: either signs in, creating the
// account the first time. Then the "or" before the email form.
export function ProviderButtons({ next }: { next: string }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="apple" />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="neutral" className="w-full">
            <AppleIcon />
            Continue with Apple
          </Button>
        </form>
        <GoogleButton next={next} />
      </div>

      <div className="flex items-center gap-3 text-footnote text-label-secondary">
        <span className="h-px flex-1 bg-separator" />
        or
        <span className="h-px flex-1 bg-separator" />
      </div>
    </>
  );
}

const providerErrors: Record<string, string> = {
  google: "Couldn’t sign in with Google. Try again, or use your email.",
  apple: "Couldn’t sign in with Apple. Try again, or use your email.",
  "confirm-link": "That confirmation link has expired or was already used. Sign in, or sign up again for a new one.",
  "reset-link": "That reset link has expired or was already used. Ask for a new one below.",
};

// Apple's logo in the label colour, as Apple's sign-in guidelines allow on a
// white, outlined button.
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M16.37 12.7c-.02-2.3 1.88-3.4 1.97-3.46a4.24 4.24 0 0 0-3.33-1.8c-1.42-.15-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79a4.46 4.46 0 0 0-3.77 2.29c-1.61 2.79-.41 6.92 1.16 9.18.77 1.11 1.68 2.35 2.88 2.31 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.72c1.25-.02 2.04-1.13 2.8-2.24a9.9 9.9 0 0 0 1.27-2.6 4.04 4.04 0 0 1-2.45-3.69zM14.07 5.94a4.03 4.03 0 0 0 .95-2.94 4.1 4.1 0 0 0-2.66 1.37 3.84 3.84 0 0 0-.97 2.83 3.4 3.4 0 0 0 2.68-1.26z" />
    </svg>
  );
}
