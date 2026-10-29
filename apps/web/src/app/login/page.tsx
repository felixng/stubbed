import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Wordmark } from "@/components/ui/Wordmark";
import { LoginForm } from "./LoginForm";

const link =
  "font-semibold text-tint-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Sign in (#13), with links to sign up (#149) and to reset a password. Kept
// out of search engines.
export const metadata: Metadata = {
  title: "Sign in — Stubbed",
  robots: { index: false, follow: false },
};

// Always light, like the landing page and the app (owner's call).
export const viewport: Viewport = { themeColor: "#f2f2f7" };

export default function LoginPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* The way back to the landing page. */}
          <Wordmark size={44} href="/" mark />
          <h1 className="text-title font-display text-label">Sign in</h1>
        </div>
        {/* Reads ?next, ?error and ?deleted, so it renders at request time. */}
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="flex flex-col gap-2 text-center text-subheadline text-label-secondary">
          <p>
            <Link href="/forgot-password" className={link}>
              Forgot your password?
            </Link>
          </p>
          <p>
            New to Stubbed?{" "}
            <Link href="/signup" className={link}>
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
