import type { Metadata, Viewport } from "next";

import { Wordmark } from "@/components/ui/Wordmark";
import { ResetForm } from "./ResetForm";

// Choose a new password, signed in by the reset email's link (#149).
export const metadata: Metadata = { title: "Choose a new password — Stubbed", robots: { index: false, follow: false } };

export const viewport: Viewport = { themeColor: "#fff9f6" };

export default function ResetPasswordPage() {
  return (
    <main data-theme="light" className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size={44} href="/" mark />
          <h1 className="text-title font-display text-label">Choose a new password</h1>
        </div>
        <ResetForm />
      </div>
    </main>
  );
}
