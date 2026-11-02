"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

// The header button at the top right of the public pages: "Sign in" for
// visitors, "Open app" once a session exists. The pages stay static, so the
// session is checked in the browser; until then (and if the check fails) it
// reads "Sign in", and /login sends a signed-in visitor on to the app anyway.
export function SiteMenu() {
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
    <Link
      href={signedIn ? "/app" : "/login"}
      className="inline-flex min-h-11 items-center rounded-pill bg-surface px-5 text-body font-medium text-label shadow-sm ring-1 ring-separator hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {signedIn ? "Open app" : "Sign in"}
    </Link>
  );
}
