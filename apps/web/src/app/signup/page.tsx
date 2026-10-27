import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Wordmark } from "@/components/ui/Wordmark";
import { SignUpForm } from "./SignUpForm";

const link =
  "font-semibold text-tint-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Create an account (#149). Free; the terms and privacy policy apply.
export const metadata: Metadata = {
  title: "Sign up — Stubbed",
  description: "Create your free Stubbed account and start your theatre diary.",
  alternates: { canonical: "/signup" },
};

export const viewport: Viewport = { themeColor: "#fff9f6" };

export default function SignUpPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size={44} href="/" mark />
          <h1 className="text-title font-display text-label">Create your account</h1>
          <p className="text-subheadline text-label-secondary">Log the shows you see, rate them and share them. Free.</p>
        </div>
        {/* Reads ?next, so it renders at request time. */}
        <Suspense>
          <SignUpForm />
        </Suspense>
        <div className="flex flex-col gap-2 text-center text-subheadline text-label-secondary">
          <p>
            Already have an account?{" "}
            <Link href="/login" className={link}>
              Sign in
            </Link>
          </p>
          <p className="text-footnote">
            By signing up you agree to the{" "}
            <Link href="/terms" className={link}>
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className={link}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
