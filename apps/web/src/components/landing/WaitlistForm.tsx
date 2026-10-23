"use client";

import { useActionState, useId } from "react";

import { joinWaitlist, type WaitlistState } from "@/app/waitlist-action";
import { Button } from "@/components/ui/Button";

// Where a visitor came from (e.g. ?utm_source=instagram), so we can see
// whether shared cards drive sign-ups.
function sourceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("utm_source") ?? params.get("ref") ?? document.referrer;
}

export function WaitlistForm() {
  const id = useId();
  const [state, dispatch, pending] = useActionState<WaitlistState, FormData>(
    joinWaitlist,
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <p
        role="status"
        className="mb-3 max-w-[500px] rounded-md border border-separator bg-surface p-4 text-headline text-label shadow-sm"
      >
        {state.confirm ? "Almost there: please confirm your email." : "You’re on the list."}
        <span className="mt-1 block text-subheadline font-normal text-label-secondary">
          {state.confirm
            ? "We’ve sent you a link. Tap it to join the waitlist, and we’ll let you know when a space opens up."
            : "We’ll let you know when spaces open up."}
        </span>
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        formData.set("source", sourceFromUrl());
        dispatch(formData);
      }}
      className="w-full max-w-[500px]"
    >
      <div className="flex flex-wrap gap-2 rounded-[28px] border border-separator bg-surface p-1.5 shadow-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus sm:rounded-pill">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          aria-describedby={state.status === "error" ? `${id}-error` : undefined}
          className="block min-h-[50px] min-w-0 flex-[1_1_200px] bg-transparent px-5 text-body text-label placeholder:text-label-secondary focus-visible:outline-none"
        />
        {/* Honeypot: hidden from people and screen readers. */}
        <div aria-hidden="true" className="absolute -left-[9999px]">
          <input name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="flex-[1_0_auto] sm:flex-none"
        >
          {pending ? "Sending…" : "Join the waitlist"}
        </Button>
      </div>
      <p
        id={`${id}-error`}
        aria-live="polite"
        className="mt-2 min-h-5 px-5 text-footnote text-destructive"
      >
        {state.status === "error" ? state.message : ""}
      </p>
    </form>
  );
}
