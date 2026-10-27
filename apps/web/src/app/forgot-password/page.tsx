import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/ui/Wordmark";
import { ForgotForm } from "./ForgotForm";

// Ask for a password reset email (#149). The link in it opens
// /auth/confirm, then /reset-password.
export const metadata: Metadata = { title: "Reset your password — Stubbed", robots: { index: false, follow: false } };

export const viewport: Viewport = { themeColor: "#fff9f6" };

export default function ForgotPasswordPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size={44} href="/" mark />
          <h1 className="text-title font-display text-label">Reset your password</h1>
          <p className="text-subheadline text-label-secondary">We’ll email you a link to choose a new one.</p>
        </div>
        <ForgotForm />
        <p className="text-center text-subheadline text-label-secondary">
          <Link href="/login" className="font-semibold text-tint-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
