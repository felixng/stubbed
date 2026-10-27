"use client";

import Script from "next/script";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { randomNonce } from "@/lib/google-nonce";
import { safeNext } from "@/lib/safe-next";
import { signInWithGoogleCode, signInWithProvider } from "./actions";

// "Continue with Google" in our own neutral button, matching Apple's (#179).
// It opens Google's popup through Google Identity Services' code client, so
// Google names getstubbed.app rather than our Supabase project. Google hands
// back a one-time code, which the server trades for the ID token and gives to
// Supabase (signInWithGoogleCode). Until Google is set up on a deployment (no
// client ID, or no secret on the server), or if the popup can't open, the
// same button submits the redirect flow through /auth/callback.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type CodeResponse = { code?: string; state?: string; error?: string };
type CodeClient = { requestCode(): void };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            state: string;
            callback: (response: CodeResponse) => void;
            error_callback: (error: { type: string }) => void;
          }): CodeClient;
        };
      };
    };
  }
}

export function GoogleButton({ next }: { next: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const redirectFlow = () => form.current?.requestSubmit();

  // A new client (and state) per tap, so a code is only good for this one.
  function open() {
    const oauth2 = window.google?.accounts.oauth2;
    if (!GOOGLE_CLIENT_ID || !oauth2) return redirectFlow();
    const state = randomNonce(16);
    setError(null);
    setBusy(true);
    oauth2
      .initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "openid email profile",
        ux_mode: "popup",
        state,
        callback: async (response) => {
          if (!response.code || response.state !== state) {
            setBusy(false);
            if (response.error !== "access_denied") setError(FAILED);
            return;
          }
          const result = await signInWithGoogleCode(response.code);
          if (result.error === "not-configured") return redirectFlow();
          if (result.error) {
            setBusy(false);
            setError(FAILED);
            return;
          }
          // A full load, so the proxy sends a new account on to /welcome.
          window.location.assign(safeNext(next));
        },
        error_callback: ({ type }) => {
          setBusy(false);
          // Closed: nothing to say. Blocked: the redirect flow instead.
          if (type === "popup_failed_to_open") redirectFlow();
        },
      })
      .requestCode();
  }

  return (
    <form ref={form} action={signInWithProvider} className="flex flex-col gap-2">
      {GOOGLE_CLIENT_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      )}
      <input type="hidden" name="provider" value="google" />
      <input type="hidden" name="next" value={next} />
      <Button
        type="button"
        variant="neutral"
        className="w-full"
        disabled={busy || (Boolean(GOOGLE_CLIENT_ID) && !scriptReady)}
        onClick={open}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      {error && (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

const FAILED = "Couldn’t sign in with Google. Try again, or use your email.";

// Google's "G", in its brand colours as Google's sign-in guidelines require.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
