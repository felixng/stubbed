"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import { randomNonce, sha256Hex } from "@/lib/google-nonce";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";
import { finishGoogleSignIn } from "./actions";

// Google's own "Sign in with Google" button (Google Identity Services), so
// Google's popup names getstubbed.app instead of our Supabase project (#179).
// Google returns an ID token here; Supabase checks it (with the nonce) and
// sets the session cookies through the browser client. Apple keeps the
// redirect flow through /auth/callback.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type CredentialResponse = { credential?: string };
type GoogleId = {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    ux_mode: "popup";
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export function GoogleButton({ next }: { next: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(async () => {
    const id = window.google?.accounts.id;
    const el = slot.current;
    if (!id || !el) return;
    // A fresh nonce for each button, so a token is only good for this sign-in.
    const nonce = randomNonce();
    id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: await sha256Hex(nonce),
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async ({ credential }) => {
        if (!credential) return;
        setBusy(true);
        setError(null);
        const { error } = await createClient().auth.signInWithIdToken({ provider: "google", token: credential, nonce });
        if (error) {
          console.error("Google sign-in failed", error.code, error.message);
          setBusy(false);
          setError("Couldn’t sign in with Google. Try again, or use your email.");
          return;
        }
        // A new account's Google photo becomes its avatar, as /auth/callback
        // does for the redirect flow.
        await finishGoogleSignIn();
        // A full load, so the proxy sends a new account on to /welcome.
        window.location.assign(safeNext(next));
      },
    });
    id.renderButton(el, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      logo_alignment: "center",
      width: Math.min(400, Math.max(200, Math.round(el.getBoundingClientRect().width))),
    });
  }, [next]);

  // Again whenever the page is shown: a page kept hidden (cacheComponents)
  // gets a new button and nonce on return.
  useEffect(() => {
    if (scriptReady) void render();
  }, [scriptReady, render]);

  return (
    <div className="flex flex-col gap-2">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      {/* Google draws its button in here: 44px tall, the width of the column. */}
      <div ref={slot} aria-busy={busy} className={`flex min-h-11 w-full justify-center ${busy ? "pointer-events-none opacity-40" : ""}`} />
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
