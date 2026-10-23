import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Wordmark } from "@/components/ui/Wordmark";
import { LEGAL } from "@/lib/legal";
import { LoginForm } from "./LoginForm";

const link =
  "font-semibold text-tint-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Owner sign-in (#13). Linked only from the landing page menu and kept out
// of search engines. Security comes from Supabase Auth (sign-ups are off), not from the
// page being hidden.
export const metadata: Metadata = {
  title: "Sign in — Stubbed",
  robots: { index: false, follow: false },
};

// Always light, like the landing page and the app (owner's call).
export const viewport: Viewport = { themeColor: "#fff9f6" };

export default function LoginPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* The way back to the landing page. */}
          <Wordmark size={44} href="/" />
          <h1 className="text-title-2 font-display text-label">Sign in</h1>
        </div>
        {/* Reads ?next, ?error and ?deleted, so it renders at request time. */}
        <Suspense>
          <LoginForm />
        </Suspense>
        {/* Password reset by email isn't built, so the honest route is support. */}
        <div className="flex flex-col gap-2 text-center text-footnote text-label-secondary">
          <p>
            Sign-ups are closed for now.{" "}
            <Link href="/#waitlist" className={link}>
              Join the waitlist
            </Link>
          </p>
          <p>
            Forgot your password? Email{" "}
            <a href={`mailto:${LEGAL.email}`} className={link}>
              {LEGAL.email}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
