"use client";

import type { Copy } from "@/lib/cms/model";
import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonClass } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

// The header actions at the top right of the public pages. A visitor gets a
// solid "Sign up free" (the action we want) beside a quiet "Sign in" link; once
// a session exists the one action is "Open app". The pages stay static, so the
// session is checked in the browser; until then (and if the check fails) the
// visitor pair shows, and /login sends a signed-in visitor on to the app anyway.
export function SiteMenuClient({ copy, signupLabel }: { copy: Copy<"footer">; signupLabel: string }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session) setSignedIn(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav aria-label="Main" className="ml-auto flex flex-wrap items-center justify-end gap-x-1 gap-y-2 sm:gap-x-2">
      {[{ href: "/about", label: copy.aboutLabel }, { href: "/faq", label: copy.faqLabel }].map(({ href, label }) => (
        <Link key={href} href={href} className="hidden min-h-11 min-w-11 items-center justify-center rounded-sm px-2 sm:inline-flex text-subheadline text-label-secondary hover:text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {label}
        </Link>
      ))}
      {signedIn ? (
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center rounded-pill bg-surface px-3 text-footnote sm:px-5 sm:text-body font-medium text-label shadow-sm ring-1 ring-separator hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {copy.openAppLabel}
        </Link>
      ) : (
        <>
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            {copy.signInLabel}
          </Link>
          <Link href="/signup" className={buttonClass("primary", "sm")}>
            {signupLabel}
          </Link>
        </>
      )}
    </nav>
  );
}
